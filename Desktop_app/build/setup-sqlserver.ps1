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
        "/SAPWORD=$SaPassword",
        '/SQLSYSADMINACCOUNTS=BUILTIN\Administrators',
        '/TCPENABLED=1'
    )
    $proc = Start-Process -FilePath $InstallerPath -ArgumentList $setupArgs -Wait -PassThru -NoNewWindow
    if ($proc.ExitCode -ne 0) {
        throw "SQL Server Express installer exited with code $($proc.ExitCode) - see %ProgramFiles%\Microsoft SQL Server\...\Setup Bootstrap\Log for details."
    }
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
    $wmiNamespace = Get-WmiObject -Namespace root\Microsoft\SqlServer -Class __NAMESPACE -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like 'ComputerManagement*' } | Select-Object -First 1
    if ($wmiNamespace) {
        $ns = "root\Microsoft\SqlServer\$($wmiNamespace.Name)"
        $tcp = Get-WmiObject -Namespace $ns -Class ServerNetworkProtocol -ErrorAction SilentlyContinue |
            Where-Object { $_.InstanceName -eq $InstanceName -and $_.ProtocolName -eq 'Tcp' }
        if ($tcp) {
            $tcp.SetEnable() | Out-Null
            $props = Get-WmiObject -Namespace $ns -Class ServerNetworkProtocolProperty -ErrorAction SilentlyContinue |
                Where-Object { $_.InstanceName -eq $InstanceName -and $_.IPAddressName -eq 'IPAll' }

            # Setting TcpPort alone is NOT enough, and this is the classic
            # SQL Server Express trap: Express defaults to DYNAMIC ports, and
            # while TcpDynamicPorts holds a value it WINS over any static
            # TcpPort. The instance would keep listening on a random high
            # port while this script reported success and the app connected
            # to 1433 and failed. Clearing it is what actually pins the port.
            $dynamic = $props | Where-Object { $_.PropertyName -eq 'TcpDynamicPorts' }
            if ($dynamic) {
                $dynamic.SetStringValue("") | Out-Null
                Write-Log "Cleared TcpDynamicPorts (was '$($dynamic.PropertyStrVal)') so the static port takes effect."
            }

            $static = $props | Where-Object { $_.PropertyName -eq 'TcpPort' }
            if ($static) {
                $static.SetStringValue("$Port") | Out-Null
                Write-Log "Pinned TcpPort to $Port."
            }
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
    Write-Log "Setting sa password via Windows Integrated auth..."
    $connStr = "Server=127.0.0.1,$Port;Database=master;Integrated Security=True;Connection Timeout=10;TrustServerCertificate=True;"
    $conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
    $conn.Open()
    $cmd = $conn.CreateCommand()
    # Password is parameterized via sp_executesql to avoid any T-SQL
    # injection/escaping issues with special characters in the password.
    $cmd.CommandText = "ALTER LOGIN sa WITH PASSWORD = @pwd; ALTER LOGIN sa ENABLE;"
    $cmd.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter("@pwd", $SaPassword))) | Out-Null
    $cmd.ExecuteNonQuery() | Out-Null
    $conn.Close()
    Write-Log "sa password set and login enabled."
}

function New-StarmansDatabase {
    Write-Log "Ensuring database '$DatabaseName' exists..."
    $connStr = "Server=127.0.0.1,$Port;Database=master;User Id=sa;Password=$SaPassword;Connection Timeout=10;TrustServerCertificate=True;"
    $conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "IF DB_ID('$DatabaseName') IS NULL CREATE DATABASE [$DatabaseName];"
    $cmd.ExecuteNonQuery() | Out-Null
    $conn.Close()
    Write-Log "Database '$DatabaseName' present."
}

function Write-AppConfig {
    param([string]$Password)
    New-Item -ItemType Directory -Path $ConfigDir -Force | Out-Null
    New-Item -ItemType Directory -Path $BackupFolder -Force | Out-Null
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
    $config | ConvertTo-Json | Set-Content -Path $ConfigPath -Encoding UTF8
    Write-Log "Wrote $ConfigPath"
}

function Read-ExistingPassword {
    if (-not (Test-Path $ConfigPath)) {
        throw "No SaPassword argument given and no existing config at $ConfigPath to read one from - cannot proceed on the update path."
    }
    $existing = Get-Content -Path $ConfigPath -Raw | ConvertFrom-Json
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
            $existing = Get-Content -Path $ConfigPath -Raw | ConvertFrom-Json
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
    Write-Log "Port $Port already in use before setup: $(Test-PortInUse -P $Port)"

    $hasInstance = Get-ExistingInstance
    if (-not $hasInstance) {
        # Flag the specific conflict that "SQL is already installed" usually
        # means in practice: some OTHER instance exists (commonly the default
        # MSSQLSERVER), which typically already owns port 1433. Installing our
        # named instance alongside it is fine, but both cannot have the port.
        if ($allInstances.Count -gt 0) {
            Write-Log "NOTE: instance '$InstanceName' is absent but other instances exist ($($allInstances -join ', ')). Installing '$InstanceName' alongside them."
            if (Test-PortInUse -P $Port) {
                Write-Log "WARNING: port $Port is already in use, most likely by one of those instances. '$InstanceName' cannot also listen on it, and this setup will probably fail verification at the end."
            }
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
