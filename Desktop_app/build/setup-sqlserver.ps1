# setup-sqlserver.ps1 — takes a Windows PC from "no database at all" to
# "Starmans can log in", or repairs an existing broken install. Runs on
# EVERY install and EVERY update (see installer.nsh) — every step here must
# be idempotent, that's what makes a reinstall a genuine repair.
#
# Design constraints, per DECISIONS.md ("REVISED: adopt a proven
# bundled-SQL-Server release pipeline") and release_pipeline.md §6 Step 4 —
# do not weaken these without updating both docs:
#   - Every step idempotent.
#   - End with a REAL connection test — not "the installer returned 0".
#     Actually connect as sa over TCP and run a query.
#   - THIS SCRIPT writes app-config.json, not NSIS — PowerShell's
#     ConvertTo-Json escapes correctly by construction; hand-rolled NSIS
#     JSON escaping previously shipped a config whose password didn't match
#     what was actually set on sa (setup reported success, login still
#     failed).
#   - Write the config machine-wide (%ProgramData%), never per-user — the
#     installer runs elevated, so a per-user path lands in the elevating
#     admin's profile and is invisible to whoever actually runs the app.
#   - Log everything to a file; the installer names that file in its error
#     message if this script fails.
#   - Password argument optional. Absent = update path: read it back from
#     the existing config instead of demanding a new one.
#
# *** UNVERIFIED ON REAL WINDOWS — see DECISIONS.md. Written against
# documented SQL Server silent-install/configuration references, but this
# project's dev environment is Linux-only. Must be run end-to-end on a real
# Windows machine before shipping — see Task 26's rewritten verification
# checklist. ***

param(
    [string]$SaPassword,                      # optional — absent means "update path", read existing config
    [string]$BackupFolder = "$env:USERPROFILE\Documents\Starmans Backup",
    [string]$InstallerPath = "$PSScriptRoot\..\sqlserver\SQLEXPR_x64_ENU.exe",  # electron-builder extraResources path at runtime
    [string]$InstanceName = "SQLEXPRESS",
    [string]$DatabaseName = "starmans",
    [int]$Port = 1433
)

$ErrorActionPreference = 'Stop'
$ConfigDir = "$env:ProgramData\Starmans"
$ConfigPath = "$ConfigDir\app-config.json"
$LogPath = "$env:TEMP\sqlserver-setup.log"

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
    # Look in the 64-bit registry view specifically — a 32-bit process (NSIS)
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

function Install-SqlServerExpress {
    Write-Log "No existing SQL Server instance found — installing SQL Server Express from bundled package."
    if (-not (Test-Path $InstallerPath)) {
        throw "Bundled SQL Server installer not found at $InstallerPath"
    }
    $args = @(
        '/ACTION=Install',
        '/IACCEPTSQLSERVERLICENSETERMS',
        '/QUIET',
        "/INSTANCENAME=$InstanceName",
        '/SECURITYMODE=SQL',
        "/SAPWORD=$SaPassword",
        '/SQLSYSADMINACCOUNTS=BUILTIN\Administrators',
        '/TCPENABLED=1'
    )
    $proc = Start-Process -FilePath $InstallerPath -ArgumentList $args -Wait -PassThru -NoNewWindow
    if ($proc.ExitCode -ne 0) {
        throw "SQL Server Express installer exited with code $($proc.ExitCode) — see %ProgramFiles%\Microsoft SQL Server\...\Setup Bootstrap\Log for details."
    }
    Write-Log "SQL Server Express install completed (exit code 0)."
}

function Set-SqlServerConfig {
    # Force mixed-mode auth + TCP/IP on port 1433 on an EXISTING instance —
    # needed both for a fresh install (belt-and-suspenders, the installer
    # args above already requested this) and for REPAIRING a PC that has
    # SQL Server but with Windows-only auth or TCP disabled.
    Write-Log "Ensuring mixed-mode auth and TCP/IP are enabled on $InstanceName..."

    # Mixed-mode auth: registry value under the instance's MSSQLServer key.
    $instanceIdPath = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL"
    $instanceId = (Get-ItemProperty -Path $instanceIdPath).$InstanceName
    $loginModePath = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\$instanceId\MSSQLServer"
    Set-ItemProperty -Path $loginModePath -Name LoginMode -Value 2  # 2 = Mixed Mode

    # TCP/IP enabled + pinned to the requested port, via the SQL Server
    # Configuration Manager WMI provider (version varies by SQL release —
    # try known namespaces).
    $wmiNamespace = Get-WmiObject -Namespace root\Microsoft\SqlServer -Class __NAMESPACE -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like 'ComputerManagement*' } | Select-Object -First 1
    if ($wmiNamespace) {
        $ns = "root\Microsoft\SqlServer\$($wmiNamespace.Name)"
        $tcp = Get-WmiObject -Namespace $ns -Class ServerNetworkProtocol -ErrorAction SilentlyContinue |
            Where-Object { $_.InstanceName -eq $InstanceName -and $_.ProtocolName -eq 'Tcp' }
        if ($tcp) {
            $tcp.SetEnable() | Out-Null
            $ipAll = Get-WmiObject -Namespace $ns -Class ServerNetworkProtocolProperty -ErrorAction SilentlyContinue |
                Where-Object { $_.InstanceName -eq $InstanceName -and $_.IPAddressName -eq 'IPAll' -and $_.PropertyName -eq 'TcpPort' }
            if ($ipAll) { $ipAll.SetStringValue("$Port") | Out-Null }
        }
    } else {
        Write-Log "WARNING: could not locate SQL Server Configuration Manager WMI namespace — TCP/IP config may need manual verification."
    }

    Write-Log "Restarting SQL Server service to apply config changes..."
    Restart-Service -Name "MSSQL`$$InstanceName" -Force
    Start-Sleep -Seconds 5
}

function Set-SaPassword {
    # Enable the sa login and set its password using WINDOWS INTEGRATED AUTH
    # (the current process is already elevated/admin) — this is what lets
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
    # ConvertTo-Json escapes correctly by construction — do not hand-roll
    # this in NSIS, see the file header comment for why that already went
    # wrong once in the reference project.
    $config | ConvertTo-Json | Set-Content -Path $ConfigPath -Encoding UTF8
    Write-Log "Wrote $ConfigPath"
}

function Read-ExistingPassword {
    if (-not (Test-Path $ConfigPath)) {
        throw "No SaPassword argument given and no existing config at $ConfigPath to read one from — cannot proceed on the update path."
    }
    $existing = Get-Content -Path $ConfigPath -Raw | ConvertFrom-Json
    return $existing.mssqlPassword
}

# ─── main ───────────────────────────────────────────────────────────────

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

    $hasInstance = Get-ExistingInstance
    if (-not $hasInstance) {
        Install-SqlServerExpress
    } else {
        Write-Log "Existing SQL Server instance '$InstanceName' found — repairing/verifying configuration instead of installing."
    }

    Set-SqlServerConfig
    Set-SaPassword
    New-StarmansDatabase
    Write-AppConfig -Password $SaPassword

    Write-Log "Verifying with a real sa connection..."
    if (-not (Test-SqlConnection -Password $SaPassword)) {
        throw "Post-setup verification connection failed — sa login/database appears misconfigured despite setup completing. See log above for details."
    }

    Write-Log "=== Starmans SQL Server setup completed successfully ==="
    exit 0
} catch {
    Write-Log "FATAL: $($_.Exception.Message)"
    Write-Log "See full details above. Log file: $LogPath"
    exit 1
}
