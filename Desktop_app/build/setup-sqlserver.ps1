# setup-sqlserver.ps1 - takes a Windows PC from "no database at all" to
# "Starmans can log in", or repairs an existing broken install. Runs on
# EVERY install and EVERY update (see installer.nsh) - every step here must
# be idempotent, that's what makes a reinstall a genuine repair.
#
# Design constraints, per DECISIONS.md ("REVISED: adopt a proven
# bundled-SQL-Server release pipeline") and release_pipeline.md Section 6 Step 4 -
# do not weaken these without updating both docs:
#   - Every step idempotent.
#   - End with a REAL connection test - not "the installer returned 0".
#     Actually connect as sa over TCP and run a query.
#   - THIS SCRIPT writes app-config.json, not NSIS - PowerShell's
#     ConvertTo-Json escapes correctly by construction; hand-rolled NSIS
#     JSON escaping previously shipped a config whose password didn't match
#     what was actually set on sa (setup reported success, login still
#     failed).
#   - Write the config machine-wide (%ProgramData%), never per-user - the
#     installer runs elevated, so a per-user path lands in the elevating
#     admin's profile and is invisible to whoever actually runs the app.
#   - Log everything to a file; the installer names that file in its error
#     message if this script fails.
#   - Password argument optional. Absent = update path: read it back from
#     the existing config instead of demanding a new one.
#
# *** UNVERIFIED ON REAL WINDOWS - see DECISIONS.md. Written against
# documented SQL Server silent-install/configuration references, but this
# project's dev environment is Linux-only. Must be run end-to-end on a real
# Windows machine before shipping - see Task 26's rewritten verification
# checklist. ***

param(
    [string]$SaPassword,                      # optional - absent means "update path", read existing config
    [string]$BackupFolder = "$env:USERPROFILE\Documents\Starmans Backup",
    # BOTH this script and the bundled SQL Server installer land in
    # <INSTDIR>\resources\ (electron-builder extraResources), so they are
    # SIBLINGS - no "..". An earlier "$PSScriptRoot\..\sqlserver\" pointed at
    # <INSTDIR>\sqlserver\, one level too high, and would have made a
    # fresh-machine install fail with "Bundled SQL Server installer not
    # found". Verified against the real win-unpacked layout, not assumed.
    [string]$InstallerPath = "$PSScriptRoot\sqlserver\SQLEXPR_x64_ENU.exe",
    [string]$InstanceName = "SQLEXPRESS",
    [string]$DatabaseName = "starmans",
    [int]$Port = 1433
)

$ErrorActionPreference = 'Stop'
$ConfigDir = "$env:ProgramData\Starmans"
$ConfigPath = "$ConfigDir\app-config.json"

# Fixed, ProgramData-based staging area for the manual "backup to external
# drive" feature (Backend/src/services/backup.js) - always this same path
# regardless of what $BackupFolder is, so the icacls grant below only ever
# has to target two known-stable locations instead of every USB drive a
# user might browse to later.
$StagingFolder = "$ConfigDir\backup-staging"

# Log to a FIXED, machine-wide path - never $env:TEMP. The installer runs
# elevated, so its %TEMP% is the *administrator's* temp (frequently
# C:\Windows\Temp), not the %TEMP% the logged-in user sees in Explorer. The
# v1.0.3 Windows test failed and the log was nowhere the tester could find it,
# which cost a whole diagnostic round-trip. ProgramData is the same path for
# every user and is where app-config.json already lives.
$LogPath = "$ConfigDir\sqlserver-setup.log"

# Create the log directory before anything else can fail, so that even an
# early error has somewhere to be recorded.
New-Item -ItemType Directory -Path $ConfigDir -Force | Out-Null

function Write-Log {
    param([string]$Message)
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Write-Host $line
    Add-Content -Path $LogPath -Value $line
}

function Test-SqlConnection {
    param([string]$Password, [int]$TimeoutSeconds = 5)
    try {
        $connStr = "Server=127.0.0.1,$Port;Database=master;User Id=sa;Password=$Password;Connection Timeout=$TimeoutSeconds;TrustServerCertificate=True;"
        $conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
        $conn.Open()
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = "SELECT 1"
        $null = $cmd.ExecuteScalar()
        $conn.Close()
        return $true
    } catch {
        Write-Log "Connection test failed: $($_.Exception.Message)"
        return $false
    }
}

function Get-ExistingInstance {
    # Look in the 64-bit registry view specifically - a 32-bit process (NSIS)
    # calling a bare `Get-ItemProperty` on a 32-bit-launched powershell.exe
    # would see WOW6432Node and miss a real SQL Server install entirely.
    # This script itself must be invoked via Sysnative PowerShell (see
    # installer.nsh) for this check to be meaningful.
    $regPath = 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL'
    if (Test-Path $regPath) {
        $instances = Get-ItemProperty -Path $regPath -ErrorAction SilentlyContinue
        if ($instances.$InstanceName) { return $true }
    }
    return $false
}

# Every SQL Server instance on the box, for the log. Worth capturing because
# "SQL Server is already installed" and "the instance THIS app needs exists"
# are different statements: a machine can have a default MSSQLSERVER instance
# (which typically already owns port 1433) while having no SQLEXPRESS at all.
# That combination is a real conflict and is invisible without this.
function Get-InstalledInstances {
    $regPath = 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL'
    if (-not (Test-Path $regPath)) { return @() }
    $p = Get-ItemProperty -Path $regPath -ErrorAction SilentlyContinue
    if (-not $p) { return @() }
    return $p.PSObject.Properties |
        Where-Object { $_.Name -notlike 'PS*' } |
        ForEach-Object { $_.Name }
}

# Whether anything is already listening on the port we intend to use. If a
# pre-existing default instance owns 1433, our named instance cannot also
# have it, and the failure would otherwise surface as a confusing connection
# error long after setup claimed success.
function Test-PortInUse {
    param([int]$P)
    try {
        $listeners = Get-NetTCPConnection -State Listen -LocalPort $P -ErrorAction SilentlyContinue
        return [bool]$listeners
    } catch { return $false }
}

# Our instance does NOT have to own 1433. Nothing about this app requires the
# default port - the app reads whatever port setup records in app-config.json
# (main.js -> loadProductionConfig -> MSSQL_PORT), so any free port works.
#
# This matters because "the machine already has SQL Server" usually means a
# default MSSQLSERVER instance that already owns 1433. Rather than fighting it
# for the port - or reconfiguring someone else's instance, which risks breaking
# whatever depends on it - we simply step aside onto a free port and leave
# their existing SQL Server completely untouched.
function Get-FreePort {
    param([int]$Preferred = 1433, [int]$Attempts = 25)
    for ($p = $Preferred; $p -lt ($Preferred + $Attempts); $p++) {
        if (-not (Test-PortInUse -P $p)) { return $p }
    }
    throw "No free TCP port found in range $Preferred-$($Preferred + $Attempts - 1) for the SQL Server instance."
}

# The static port our own instance is already configured to listen on, or 0 if
# it has none (dynamic ports, or no such instance). Needed because Get-FreePort
# alone cannot tell "someone else owns 1433" from "WE own 1433": a setup run
# that got far enough to pin the port but died before writing app-config.json
# leaves exactly that state, and a re-run would then see 1433 busy and migrate
# the instance to 1434 for no reason. Ask the instance directly instead.
function Get-InstanceStaticPort {
    $instanceId = (Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL' -ErrorAction SilentlyContinue).$InstanceName
    if (-not $instanceId) { return 0 }
    $tcpPath = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\$instanceId\MSSQLServer\SuperSocketNetLib\Tcp\IPAll"
    if (-not (Test-Path $tcpPath)) { return 0 }
    $tcp = Get-ItemProperty -Path $tcpPath -ErrorAction SilentlyContinue
    if ($tcp -and $tcp.TcpPort -match '^\d+$') { return [int]$tcp.TcpPort }
    return 0
}

# Run an external program with a hard timeout, killing its whole process TREE
# on expiry. The tree part matters: the previous version called Stop-Process on
# the handle it started, which for the SQL Server package kills only the parent
# and leaves the setup children it spawned running - holding the install and
# whatever files it had open, so the next attempt inherits a half-installed
# machine rather than a clean one.
#
# Failing loudly on a timeout is deliberate: the 1.0.11 release hung for the
# full 6-hour GitHub Actions ceiling with no diagnostic output at all.
function Invoke-WithTimeout {
    param(
        [Parameter(Mandatory)] [string]   $FilePath,
        # Not Mandatory: a Mandatory [string[]] rejects @() outright, which
        # would make this helper unusable for an argument-less program.
        [string[]] $Arguments = @(),
        [Parameter(Mandatory)] [int]      $TimeoutMinutes,
        [Parameter(Mandatory)] [string]   $What,
        # Optional escape hatch from a bad assumption this function used to
        # make everywhere: that a freshly-started .NET Process object's
        # .ExitCode is always cleanly readable once WaitForExit() returns
        # $true. On a real client machine (never exercised in CI - CI invokes
        # this script directly, a client always goes through
        # installer.nsh's NSIS -> nsExec::Exec -> cmd.exe /C "... > file 2>&1"
        # -> elevated powershell.exe chain) that assumption broke: the
        # self-extractor's files were fully and correctly extracted (confirmed
        # from a client machine's temp folder - hundreds of MB, hundreds of
        # files, exactly what a real extraction produces) while $proc.ExitCode
        # still came back as $null, which "$null -ne 0" treats as a failure
        # and "$($null)" renders as an empty string - producing the exact
        # "exited with code  -" (blank) seen in the field. Reading .ExitCode
        # itself is now wrapped below so that whatever is actually going on
        # (a lost/re-pointed process handle several redirected-stdio layers
        # deep) is logged instead of silently becoming $null.
        #
        # When given, a program that has actually finished doing its job -
        # verified independently of whatever its process handle's exit code
        # claims - is not a failure, no matter what $proc.ExitCode says.
        [scriptblock] $SuccessCheck = $null
    )

    # Start-Process also rejects an empty -ArgumentList, so omit it entirely.
    $startParams = @{ FilePath = $FilePath; PassThru = $true; NoNewWindow = $true }
    if ($Arguments.Count -gt 0) { $startParams.ArgumentList = $Arguments }
    $proc = Start-Process @startParams
    if (-not $proc.WaitForExit($TimeoutMinutes * 60 * 1000)) {
        # taskkill /T walks the child tree; Stop-Process has no equivalent.
        try { & taskkill.exe /PID $proc.Id /T /F 2>&1 | Out-Null } catch {}
        throw "$What did not finish within $TimeoutMinutes minutes and was killed (process tree terminated). See %ProgramFiles%\Microsoft SQL Server\...\Setup Bootstrap\Log for whatever it captured before being killed - if that log is EMPTY or absent, setup never launched and the failure is upstream of it (extraction), not inside SQL Setup."
    }

    $exitCode = $null
    $exitCodeError = $null
    try { $exitCode = $proc.ExitCode } catch { $exitCodeError = $_.Exception.Message }

    if ($null -ne $exitCode -and $exitCode -eq 0) {
        Write-Log "$What completed (exit code 0)."
        return
    }

    if ($SuccessCheck -and (& $SuccessCheck)) {
        # The exit code is unreliable/unreadable in this process chain, but
        # the thing $What was supposed to produce is actually there - trust
        # that over a handle that may not even point at the real worker
        # process anymore. Still logged (not silently ignored) so this stays
        # diagnosable if it ever masks a real problem.
        $codeDesc = if ($exitCodeError) { "unreadable ($exitCodeError)" } else { "$exitCode" }
        Write-Log "$What reported exit code $codeDesc, but its expected output is present - treating as success (PID $($proc.Id))."
        return
    }

    $codeDesc = if ($exitCodeError) { "unreadable ($exitCodeError)" } elseif ($null -eq $exitCode) { "(none)" } else { "$exitCode" }
    throw "$What exited with code $codeDesc (PID $($proc.Id)) - see %ProgramFiles%\Microsoft SQL Server\...\Setup Bootstrap\Log for details."
}

function Install-SqlServerExpress {
    Write-Log "No existing SQL Server instance found - installing SQL Server Express from bundled package."
    if (-not (Test-Path $InstallerPath)) {
        throw "Bundled SQL Server installer not found at $InstallerPath"
    }
    # NOT $args - that's a PowerShell automatic variable (unbound arguments
    # inside a function). Assigning to it is legal but shadows built-in
    # behaviour and misbehaves under StrictMode.
    $setupArgs = @(
        '/ACTION=Install',
        '/IACCEPTSQLSERVERLICENSETERMS',
        '/QUIET',
        "/INSTANCENAME=$InstanceName",
        '/SECURITYMODE=SQL',
        # SAPWD, not SAPWORD - confirmed wrong by a real install log:
        # "The setting 'SAPWORD' specified is not recognized." This was wrong
        # from the very first version of this script and never caught until
        # Bug 1 (the encoding failure) stopped blocking execution before this
        # line was ever reached - every prior "successful lint/build" only
        # proved the script COMPILED, never that this parameter was correct.
        "/SAPWD=$SaPassword",
        '/SQLSYSADMINACCOUNTS=BUILTIN\Administrators',
        '/TCPENABLED=1',
        # Stops Setup reaching out to Windows/Microsoft Update to check for a
        # newer cumulative update before installing. Found the hard way: the
        # 1.0.11 CI release run hung for the full 6-hour GitHub Actions job
        # ceiling with the log's last line being "installing SQL Server
        # Express from bundled package" and nothing after - i.e. exactly this
        # network check stalling forever with no timeout of its own. A
        # locked-down network (this CI runner, or a client machine behind a
        # firewall) can hit the same thing. Also makes the installed version
        # deterministic - exactly what's bundled - rather than "whatever
        # Microsoft Update happened to have that day."
        '/UPDATEENABLED=0'
    )

    # Belt-and-suspenders for the same failure mode: even with the update
    # check disabled, do not let a hung installer consume an entire CI job
    # (or a client's machine) indefinitely the way the 1.0.11 run did. A real
    # successful install on real Windows (see DECISIONS.md's 1.0.9 entry, log
    # timestamps 12:42:38 -> 12:52:00) took under 10 minutes; 20 is generous
    # headroom. Failing loudly in 20 minutes beats a silent 6-hour hang with
    # zero diagnostic information - which is what happened without this.
    # SQLEXPR_x64_ENU.exe is a self-extracting WRAPPER, not SETUP.EXE. It must be
    # extracted first and the real SETUP.EXE invoked from the extracted media.
    #
    # This is what actually hung the 1.0.11 and 1.0.12 CI releases. The wrapper
    # parses arguments before SETUP.EXE ever exists: the setup-level '/QUIET'
    # above is NOT the extractor's quiet switch (that is '/Q'), so the wrapper
    # saw no quiet flag, fell back to its interactive "Choose Directory For
    # Extracted Files" dialog, and waited for a click that a headless runner can
    # never provide. Both releases sat at exactly that point - the last log line
    # each time was this function's own "installing..." message with nothing from
    # SQL Setup after it, because SETUP.EXE had not been launched yet.
    #
    # That also explains why 1.0.12's '/UPDATEENABLED=0' changed nothing: those
    # setup arguments were never reaching setup. They are kept (unchanged, and
    # still correct) and are now passed to SETUP.EXE where they take effect.
    $extractDir = Join-Path $env:TEMP "starmans-sqlexpr-extract"
    if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue }

    $setupExe = Join-Path $extractDir 'SETUP.EXE'

    Write-Log "Extracting bundled installer to $extractDir ..."
    # -SuccessCheck: see Invoke-WithTimeout's own comment for why this exists.
    # For extraction specifically, "SETUP.EXE showed up where expected" is a
    # strictly more trustworthy success signal than this self-extractor's
    # process exit code has proven to be on a real client machine.
    Invoke-WithTimeout -FilePath $InstallerPath -Arguments @('/Q', "/X:$extractDir") `
        -TimeoutMinutes 10 -What 'SQL Server Express self-extractor' `
        -SuccessCheck { Test-Path $setupExe }

    if (-not (Test-Path $setupExe)) {
        throw "Extraction finished but SETUP.EXE is not at $setupExe. The bundled package may not be the expected self-extracting SQLEXPR_x64_ENU.exe - check what download:sqlserver actually fetched."
    }

    Write-Log "Running SETUP.EXE from extracted media..."
    Invoke-WithTimeout -FilePath $setupExe -Arguments $setupArgs `
        -TimeoutMinutes 20 -What 'SQL Server Express installer'

    Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Log "SQL Server Express install completed (exit code 0)."
}

function Set-SqlServerConfig {
    # Force mixed-mode auth + TCP/IP on port 1433 on an EXISTING instance -
    # needed both for a fresh install (belt-and-suspenders, the installer
    # args above already requested this) and for REPAIRING a PC that has
    # SQL Server but with Windows-only auth or TCP disabled.
    Write-Log "Ensuring mixed-mode auth and TCP/IP are enabled on $InstanceName..."

    # Mixed-mode auth: registry value under the instance's MSSQLServer key.
    $instanceIdPath = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL"
    $instanceId = (Get-ItemProperty -Path $instanceIdPath -ErrorAction SilentlyContinue).$InstanceName
    if (-not $instanceId) {
        # Without this guard the path below silently becomes
        # "...\Microsoft SQL Server\\MSSQLServer" and fails with an obscure
        # registry error instead of naming the actual problem.
        throw "Instance '$InstanceName' is not registered even after setup. Instances present: $((Get-InstalledInstances) -join ', ')"
    }
    $loginModePath = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\$instanceId\MSSQLServer"
    Set-ItemProperty -Path $loginModePath -Name LoginMode -Value 2  # 2 = Mixed Mode

    # TCP/IP enabled + pinned to the requested port, via the SQL Server
    # Configuration Manager WMI provider (version varies by SQL release -
    # try known namespaces).
    # CIM, not Get-WmiObject. Get-WmiObject does not exist natively in
    # PowerShell 7: PS7 satisfies the call through the Windows PowerShell
    # Compatibility feature, which runs it in a background 5.1 session and
    # returns objects across a serialization boundary. Those come back as
    # `Deserialized.System.Management.ManagementObject` - property bags with
    # NO methods - so `.SetEnable()` throws "does not contain a method named
    # 'SetEnable'". That is exactly how the v1.0.13 release failed, and it is
    # a real 7-vs-5.1 difference, not a CI quirk: under 5.1 (which is what
    # runs on a client during install) the identical code works, which is why
    # 1.0.9's real install succeeded and no earlier CI run reached this line
    # to expose it - setup itself had always died first.
    #
    # Get-CimInstance/Invoke-CimMethod exist in BOTH 5.1 (since PS 3.0) and 7
    # and never serialize, so this path now behaves identically in the
    # installer and in CI.
    $wmiNamespace = Get-CimInstance -Namespace root\Microsoft\SqlServer -ClassName __NAMESPACE -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like 'ComputerManagement*' } | Select-Object -First 1
    if ($wmiNamespace) {
        $ns = "root\Microsoft\SqlServer\$($wmiNamespace.Name)"
        $tcp = Get-CimInstance -Namespace $ns -ClassName ServerNetworkProtocol -ErrorAction SilentlyContinue |
            Where-Object { $_.InstanceName -eq $InstanceName -and $_.ProtocolName -eq 'Tcp' }
        if ($tcp) {
            Invoke-CimMethod -InputObject $tcp -MethodName SetEnable | Out-Null
            $props = Get-CimInstance -Namespace $ns -ClassName ServerNetworkProtocolProperty -ErrorAction SilentlyContinue |
                Where-Object { $_.InstanceName -eq $InstanceName -and $_.IPAddressName -eq 'IPAll' }

            # Setting TcpPort alone is NOT enough, and this is the classic
            # SQL Server Express trap: Express defaults to DYNAMIC ports, and
            # while TcpDynamicPorts holds a value it WINS over any static
            # TcpPort. The instance would keep listening on a random high
            # port while this script reported success and the app connected
            # to 1433 and failed. Clearing it is what actually pins the port.
            $dynamic = $props | Where-Object { $_.PropertyName -eq 'TcpDynamicPorts' }
            if ($dynamic) {
                # SetStringValue's parameter is named StrValue; Invoke-CimMethod
                # requires arguments by name, unlike the positional WMI call.
                Invoke-CimMethod -InputObject $dynamic -MethodName SetStringValue -Arguments @{ StrValue = '' } | Out-Null
                Write-Log "Cleared TcpDynamicPorts (was '$($dynamic.PropertyStrVal)') so the static port takes effect."
            }

            $static = $props | Where-Object { $_.PropertyName -eq 'TcpPort' }
            if ($static) {
                Invoke-CimMethod -InputObject $static -MethodName SetStringValue -Arguments @{ StrValue = "$Port" } | Out-Null
                Write-Log "Pinned TcpPort to $Port."
            }
        } else {
            # Say so rather than skipping in silence: without this, a missing
            # Tcp protocol object left TCP/IP disabled and the only symptom was
            # the post-setup connection check failing with a generic
            # "server was not found or was not accessible" much later.
            Write-Log "WARNING: no Tcp ServerNetworkProtocol object found for instance '$InstanceName' in $ns - TCP/IP was NOT enabled and the connection check below will fail."
        }
    } else {
        Write-Log "WARNING: could not locate SQL Server Configuration Manager WMI namespace - TCP/IP config may need manual verification."
    }

    Write-Log "Restarting SQL Server service to apply config changes..."
    Restart-Service -Name "MSSQL`$$InstanceName" -Force
    Start-Sleep -Seconds 5
}

function Set-SaPassword {
    # Enable the sa login and set its password using WINDOWS INTEGRATED AUTH
    # (the current process is already elevated/admin) - this is what lets
    # this REPAIR a PC where sa is disabled or its password is unknown, since
    # integrated auth as a local admin always works regardless of sa's state.
    #
    # BUT: a single TCP-loopback connection string is not reliable for this.
    # Confirmed by a real install log:
    #   "Login failed. The login is from an untrusted domain and cannot be
    #    used with Integrated authentication."
    # This is a known SQL Server / Windows interaction - Integrated auth over
    # TCP to 127.0.0.1 or localhost can fail SSPI/NTLM negotiation on machines
    # with NTLM-restriction policies or certain loopback configurations, even
    # though the exact same Windows identity is fully trusted locally. Named
    # pipes/shared memory to "." (the standard local-instance connection
    # string) bypasses that negotiation path entirely and is the documented
    # workaround, so it is tried FIRST; TCP is kept as a fallback for the
    # (rarer) machines where named pipes itself is disabled.
    Write-Log "Setting sa password via Windows Integrated auth..."

    $strategies = @(
        @{ Desc = "named pipes/shared memory (.\$InstanceName)"; ConnStr = "Server=.\$InstanceName;Database=master;Integrated Security=True;Connection Timeout=10;TrustServerCertificate=True;" },
        @{ Desc = "TCP loopback (127.0.0.1,$Port)";              ConnStr = "Server=127.0.0.1,$Port;Database=master;Integrated Security=True;Connection Timeout=10;TrustServerCertificate=True;" },
        @{ Desc = "TCP localhost ($Port)";                       ConnStr = "Server=localhost,$Port;Database=master;Integrated Security=True;Connection Timeout=10;TrustServerCertificate=True;" }
    )

    $conn = $null
    $lastError = $null
    foreach ($s in $strategies) {
        try {
            Write-Log "  Trying $($s.Desc)..."
            $candidate = New-Object System.Data.SqlClient.SqlConnection($s.ConnStr)
            $candidate.Open()
            $conn = $candidate
            Write-Log "  Connected via $($s.Desc)."
            break
        } catch {
            $lastError = $_.Exception.Message
            Write-Log "  Failed via $($s.Desc): $lastError"
        }
    }

    if (-not $conn) {
        # Actionable, not a raw .NET stack dump - name the identity that was
        # tried and what to check, per the requirement that a failure here
        # must be diagnosable without re-running with extra logging.
        $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        throw "Could not authenticate to SQL Server as an administrator using any connection method (tried: $(($strategies | ForEach-Object { $_.Desc }) -join '; ')). " +
              "Attempted Windows identity: $identity. Last error: $lastError. " +
              "Check that Mixed Mode Authentication is enabled on '$InstanceName', and that '$identity' " +
              "(or BUILTIN\Administrators) is a member of that instance's sysadmin role."
    }

    $cmd = $conn.CreateCommand()
    # ALTER LOGIN ... WITH PASSWORD requires a string LITERAL - T-SQL does not
    # accept a variable or a bound parameter there. Sending
    # "ALTER LOGIN sa WITH PASSWORD = @pwd" with a SqlParameter therefore fails
    # with "Incorrect syntax near '@pwd'" (confirmed on a real install log),
    # and wrapping that exact text in sp_executesql fails identically - the
    # restriction is on the ALTER LOGIN statement itself, not on the batch.
    #
    # So the literal has to be built, but NOT by interpolating the password
    # into PowerShell's string - that would break on any password containing a
    # quote and reintroduce the injection risk. Instead the password still
    # crosses the wire as a real parameter, and QUOTENAME does the escaping
    # server-side (QUOTENAME(@pwd, '''') wraps it in single quotes and doubles
    # any embedded ones). The password never appears in the command text.
    # Single-quoted here-string (@'...'@), not @"..."@ - a double-quoted one
    # interpolates $-prefixed names, and embedded T-SQL must reach the server
    # byte-for-byte as written.
    $cmd.CommandText = @'
DECLARE @sql nvarchar(max);
IF @pwd IS NULL OR LEN(@pwd) = 0 OR LEN(@pwd) > 128
    THROW 50000, 'sa password is empty or longer than the 128 chars QUOTENAME can escape.', 1;
SET @sql = N'ALTER LOGIN sa WITH PASSWORD = ' + QUOTENAME(@pwd, '''') + N'; ALTER LOGIN sa ENABLE;';
EXEC sp_executesql @sql;
'@
    $pwdParam = New-Object System.Data.SqlClient.SqlParameter("@pwd", [System.Data.SqlDbType]::NVarChar, 128)
    $pwdParam.Value = $SaPassword
    $cmd.Parameters.Add($pwdParam) | Out-Null
    $cmd.ExecuteNonQuery() | Out-Null
    $conn.Close()
    Write-Log "sa password set and login enabled."
}

# ExecuteScalar, with SQL's NULL normalised to PowerShell's $null. Without
# this, [DBNull]::Value is a non-null object and every `-ne $null` test on a
# NULL result silently reports "not null" - the opposite of the truth.
function Invoke-Scalar {
    param($Connection, [string]$Sql)
    $cmd = $Connection.CreateCommand()
    $cmd.CommandText = $Sql
    $result = $cmd.ExecuteScalar()
    if ($result -is [System.DBNull]) { return $null }
    return $result
}

function Invoke-NonQuery {
    param($Connection, [string]$Sql)
    $cmd = $Connection.CreateCommand()
    $cmd.CommandText = $Sql
    $cmd.ExecuteNonQuery() | Out-Null
}

function New-StarmansDatabase {
    Write-Log "Ensuring database '$DatabaseName' exists..."
    $connStr = "Server=127.0.0.1,$Port;Database=master;User Id=sa;Password=$SaPassword;Connection Timeout=10;TrustServerCertificate=True;"
    $conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
    $conn.Open()
    try {
        if ((Invoke-Scalar $conn "SELECT DB_ID('$DatabaseName')") -ne $null) {
            Write-Log "Database '$DatabaseName' present."
            return
        }

        # DB_ID is NULL, but that does NOT mean there is nothing on disk. A
        # plain CREATE DATABASE here is what wedged a real machine
        # permanently:
        #   "Cannot create file '...\DATA\starmans.mdf' because it already
        #    exists. CREATE DATABASE failed."
        # Uninstalling SQL Server LEAVES the data files behind, so after a
        # reinstall the new instance has no 'starmans' registered while the
        # previous installation's starmans.mdf is still sitting in its default
        # data directory. Every subsequent run then failed identically, with no
        # way out, because the check and the failure disagreed about what
        # "exists" means.
        #
        # Those files are the user's data, so ATTACH them rather than creating
        # over them - this is a recovery path, not just an error to dodge.
        $dataDir = Invoke-Scalar $conn "SELECT CONVERT(nvarchar(4000), SERVERPROPERTY('InstanceDefaultDataPath'))"
        $logDir  = Invoke-Scalar $conn "SELECT CONVERT(nvarchar(4000), SERVERPROPERTY('InstanceDefaultLogPath'))"
        if (-not $dataDir) {
            # SERVERPROPERTY's default-path properties are SQL 2012+; fall back
            # to where master actually lives on older builds.
            $dataDir = Invoke-Scalar $conn "SELECT LEFT(physical_name, LEN(physical_name) - CHARINDEX('\', REVERSE(physical_name))) + '\' FROM sys.master_files WHERE database_id = 1 AND type = 0"
        }
        if (-not $logDir) { $logDir = $dataDir }

        $mdf = Join-Path $dataDir "$DatabaseName.mdf"
        $ldf = Join-Path $logDir  "${DatabaseName}_log.ldf"

        if (Test-Path -LiteralPath $mdf) {
            Write-Log "Database '$DatabaseName' is not registered on this instance, but $mdf exists on disk (left behind by a previous SQL Server installation). Attaching it instead of creating a new one, to preserve the data."
            # Doubling single quotes is the T-SQL string escape; these paths are
            # server-derived, but the DDL cannot be parameterised so escape anyway.
            $mdfLit = $mdf.Replace("'", "''")
            $ldfLit = $ldf.Replace("'", "''")
            try {
                if (Test-Path -LiteralPath $ldf) {
                    Invoke-NonQuery $conn "CREATE DATABASE [$DatabaseName] ON (FILENAME = N'$mdfLit'), (FILENAME = N'$ldfLit') FOR ATTACH;"
                } else {
                    # No log file to attach - SQL Server can build a fresh one.
                    Write-Log "  Log file $ldf is missing; attaching with ATTACH_REBUILD_LOG."
                    Invoke-NonQuery $conn "CREATE DATABASE [$DatabaseName] ON (FILENAME = N'$mdfLit') FOR ATTACH_REBUILD_LOG;"
                }
                Write-Log "Attached existing '$DatabaseName' data files - previous data preserved."
                return
            } catch {
                # Corrupt, version-incompatible, or in-use files. Do not leave
                # setup permanently stuck: move them aside (never delete - they
                # may be the only copy of the user's data) and start clean.
                Write-Log "  WARNING: attach failed: $($_.Exception.Message)"
                $stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
                foreach ($orphan in @($mdf, $ldf)) {
                    if (Test-Path -LiteralPath $orphan) {
                        $moved = "$orphan.orphaned-$stamp"
                        Move-Item -LiteralPath $orphan -Destination $moved -Force
                        Write-Log "  Moved $orphan aside to $moved (kept, not deleted)."
                    }
                }
            }
        }

        Invoke-NonQuery $conn "IF DB_ID('$DatabaseName') IS NULL CREATE DATABASE [$DatabaseName];"
        Write-Log "Database '$DatabaseName' present."
    } finally {
        $conn.Close()
    }
}

# BACKUP DATABASE runs inside the SQL Server service process, not this
# script - so the service's own Windows identity (a per-instance virtual
# service account, NOT the admin running this installer) needs write
# permission on wherever the backup file lands. Without this grant, every
# scheduled/manual backup fails with an "Operating system error 5(Access is
# denied.)" the moment Backend/src/services/backup.js's BACKUP DATABASE runs
# - permissions "New-Item -Force" alone does not confer.
#
# icacls, not Set-Acl: works uniformly across drive types, and is the
# documented approach in Microsoft's own SQL Server backup-folder guidance.
# Failure here is logged but non-fatal - not every target is NTFS. FAT32/
# exFAT (common on the small USB sticks this app can also target once a
# folder is browsed to) have no ACL concept at all, so icacls errors out
# there, but SQL Server can still write freely since nothing is restricting
# it in the first place; only a genuine NTFS permission problem should ever
# actually block a backup, and that surfaces later as a clear "Access is
# denied" from BACKUP DATABASE itself, not as a silent setup failure here.
function Grant-BackupFolderAccess {
    param([string]$FolderPath)
    $serviceAccount = "NT SERVICE\MSSQL`$$InstanceName"
    try {
        New-Item -ItemType Directory -Path $FolderPath -Force | Out-Null
        $result = & icacls.exe "$FolderPath" /grant "${serviceAccount}:(OI)(CI)M" 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Log "NOTE: icacls could not grant $serviceAccount write access to $FolderPath (exit $LASTEXITCODE): $result. Harmless on non-NTFS media (FAT32/exFAT); a real problem will surface as an 'Access is denied' error from the backup itself."
        } else {
            Write-Log "Granted $serviceAccount write access to $FolderPath."
        }
    } catch {
        Write-Log "NOTE: could not grant $serviceAccount access to ${FolderPath}: $($_.Exception.Message)"
    }
}

function Write-AppConfig {
    param([string]$Password)
    New-Item -ItemType Directory -Path $ConfigDir -Force | Out-Null
    Grant-BackupFolderAccess -FolderPath $BackupFolder
    Grant-BackupFolderAccess -FolderPath $StagingFolder
    $config = @{
        mssqlServer   = "127.0.0.1"
        mssqlPort     = $Port
        mssqlDatabase = $DatabaseName
        mssqlUser     = "sa"
        mssqlPassword = $Password
        backupFolder  = $BackupFolder
        configuredAt  = (Get-Date -Format 'o')
    }
    # ConvertTo-Json escapes correctly by construction - do not hand-roll
    # this in NSIS, see the file header comment for why that already went
    # wrong once in the reference project.
    #
    # WriteAllText with an explicit BOM-less UTF8Encoding, NOT
    # `Set-Content -Encoding UTF8`: Windows PowerShell 5.1 writes a UTF-8 BOM
    # (EF BB BF) for that switch, and main.js's JSON.parse rejects the leading
    # U+FEFF - "Unexpected token" - taking down the entire Electron main
    # process at startup. That shipped in 1.0.9 and made a fully successful SQL
    # setup look like a total failure, because the config this function wrote
    # was unreadable by the only thing that consumes it.
    #
    # -Encoding utf8NoBOM would be the obvious fix but does not exist before
    # PowerShell 6; this script must run on the stock 5.1 every Windows box
    # ships with, so the .NET API is the portable way to express it.
    $json = $config | ConvertTo-Json
    [System.IO.File]::WriteAllText($ConfigPath, $json, (New-Object System.Text.UTF8Encoding($false)))
    Write-Log "Wrote $ConfigPath"
}

# Every read of $ConfigPath passes -Encoding UTF8 explicitly, and that is load
# bearing rather than decorative: PowerShell 5.1 infers a file's encoding from
# its BOM, and falls back to ANSI (Windows-1252) when there is none. Now that
# Write-AppConfig deliberately writes BOM-less UTF-8 - it has to, or JSON.parse
# rejects the file - an unqualified Get-Content would silently reinterpret any
# non-ASCII byte in the sa password, and the update path would then hand the
# app a password that no longer matches the one SQL Server holds.
function Read-ExistingPassword {
    if (-not (Test-Path $ConfigPath)) {
        throw "No SaPassword argument given and no existing config at $ConfigPath to read one from - cannot proceed on the update path."
    }
    $existing = Get-Content -Path $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
    return $existing.mssqlPassword
}

# --- main ---------------------------------------------------------------

try {
    Write-Log "=== Starmans SQL Server setup starting ==="
    Write-Log "Mode: $(if ($SaPassword) { 'fresh install (password provided)' } else { 'update/repair (reading existing config)' })"

    $isUpdate = -not $SaPassword
    if ($isUpdate) {
        $SaPassword = Read-ExistingPassword
        if (Test-Path $ConfigPath) {
            $existing = Get-Content -Path $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($existing.backupFolder) { $BackupFolder = $existing.backupFolder }
        }
    }

    # Environment snapshot BEFORE changing anything. Cheap to capture and it
    # is the difference between a diagnosable failure report and a guess.
    Write-Log "PowerShell: $($PSVersionTable.PSVersion) ($($PSVersionTable.PSEdition)), 64-bit process: $([Environment]::Is64BitProcess)"
    Write-Log "Bundled installer path: $InstallerPath (exists: $(Test-Path $InstallerPath))"
    $allInstances = Get-InstalledInstances
    if ($allInstances.Count -gt 0) {
        Write-Log "SQL Server instances already on this machine: $($allInstances -join ', ')"
    } else {
        Write-Log "No SQL Server instances found on this machine."
    }
    # Decide the port BEFORE doing anything, and never move it under an
    # install that already exists. An already-configured machine keeps the
    # port recorded in app-config.json - re-scanning would find that port
    # "in use" (by our own instance) and needlessly migrate to a new one,
    # orphaning the database the app is already pointed at.
    if (Test-Path $ConfigPath) {
        $existingCfg = Get-Content -Path $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($existingCfg.mssqlPort) {
            $Port = [int]$existingCfg.mssqlPort
            Write-Log "Reusing port $Port from the existing app-config.json (not re-scanning - this machine is already configured)."
        }
    } else {
        $ownPort = Get-InstanceStaticPort
        if ($ownPort -gt 0) {
            $Port = $ownPort
            Write-Log "Instance '$InstanceName' is already pinned to port $Port - keeping it (a previous setup run configured it but did not get as far as writing app-config.json)."
        } else {
            $requested = $Port
            $Port = Get-FreePort -Preferred $Port
            if ($Port -ne $requested) {
                Write-Log "Port $requested is already in use (most likely by an existing SQL Server instance). Using port $Port instead - the app reads the port from app-config.json, so a non-default port is fully supported."
            } else {
                Write-Log "Port $Port is free; using it."
            }
        }
    }

    $hasInstance = Get-ExistingInstance
    if (-not $hasInstance) {
        if ($allInstances.Count -gt 0) {
            Write-Log "NOTE: instance '$InstanceName' is absent but other instances exist ($($allInstances -join ', ')). Installing '$InstanceName' alongside them on port $Port - their instances are left completely untouched."
        }
        Install-SqlServerExpress
    } else {
        Write-Log "Existing SQL Server instance '$InstanceName' found - repairing/verifying configuration instead of installing."
    }

    Set-SqlServerConfig
    Set-SaPassword
    New-StarmansDatabase
    Write-AppConfig -Password $SaPassword

    Write-Log "Verifying with a real sa connection..."
    if (-not (Test-SqlConnection -Password $SaPassword)) {
        throw "Post-setup verification connection failed - sa login/database appears misconfigured despite setup completing. See log above for details."
    }

    Write-Log "=== Starmans SQL Server setup completed successfully ==="
    exit 0
} catch {
    Write-Log "FATAL: $($_.Exception.Message)"
    Write-Log "See full details above. Log file: $LogPath"
    exit 1
}
