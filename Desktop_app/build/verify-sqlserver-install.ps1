# verify-sqlserver-install.ps1 - actually RUNS setup-sqlserver.ps1 against a
# real SQL Server Express install on the CI Windows runner, and gates
# publishing on it succeeding. Every prior verification of this codebase's
# SQL logic was either a static parse-check on Linux or a human manually
# testing on their own machine after a release was already public - this is
# the first automated test that installs a real SQL Server and queries it.
#
# Runs on the same windows-latest runner that builds the app, using the same
# resources\ folder electron-builder just produced, so it is testing the
# actual shipped artifact, not a separate copy.
#
# Exits non-zero on ANY failure - see release.yml, which runs this BEFORE
# creating the GitHub Release, so a broken SQL setup blocks publishing
# instead of shipping silently, which is what happened for six releases in a
# row before this file existed.

param(
    [Parameter(Mandatory)][string]$ResourcesDir,   # release/win-unpacked/resources
    [string]$TestPassword = "Verify-Test-P@ss'123" # deliberately contains an apostrophe -
                                                    # exercises the QUOTENAME escaping fix
                                                    # from the 1.0.9 ALTER LOGIN bug. A test
                                                    # password without one would not have
                                                    # caught that bug even if run every release.
)

$ErrorActionPreference = 'Stop'
$setupScript = Join-Path $ResourcesDir "setup-sqlserver.ps1"
$failures = @()

function Test-Step {
    param([string]$Name, [scriptblock]$Body)
    Write-Host "`n=== $Name ===" -ForegroundColor Cyan
    try {
        & $Body
        Write-Host "PASS: $Name" -ForegroundColor Green
    } catch {
        Write-Host "FAIL: $Name - $($_.Exception.Message)" -ForegroundColor Red
        $script:failures += "$Name`: $($_.Exception.Message)"
    }
}

function Get-RealSqlConnection {
    param([int]$Port, [string]$Password, [int]$TimeoutSeconds = 10)
    $connStr = "Server=127.0.0.1,$Port;Database=master;User Id=sa;Password=$Password;Connection Timeout=$TimeoutSeconds;TrustServerCertificate=True;"
    $conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
    $conn.Open()
    return $conn
}

# --- 1. Payload sanity -------------------------------------------------
Test-Step "Bundled SQL Server payload size" {
    $installer = Join-Path $ResourcesDir "sqlserver\SQLEXPR_x64_ENU.exe"
    if (-not (Test-Path $installer)) { throw "Not found: $installer" }
    $size = (Get-Item $installer).Length
    Write-Host "  $installer : $size bytes"
    if ($size -lt 250MB) { throw "Only $size bytes - looks truncated (expected ~279293816, SQL Server 2022 Express Core)." }
}

# --- 2. Fresh install ----------------------------------------------------
$configPath = "$env:ProgramData\Starmans\app-config.json"
if (Test-Path "$env:ProgramData\Starmans") {
    Remove-Item "$env:ProgramData\Starmans" -Recurse -Force
}

Test-Step "Fresh install (setup-sqlserver.ps1 -SaPassword ...)" {
    & $setupScript -SaPassword $TestPassword -InstallerPath (Join-Path $ResourcesDir "sqlserver\SQLEXPR_x64_ENU.exe")
    if ($LASTEXITCODE -ne 0) { throw "setup-sqlserver.ps1 exited $LASTEXITCODE - see sqlserver-setup.log below" }
}

Test-Step "app-config.json was written and is valid JSON" {
    if (-not (Test-Path $configPath)) { throw "$configPath does not exist" }
    $script:config = Get-Content $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $config.mssqlPort)     { throw "mssqlPort missing from config" }
    if ($config.mssqlPassword -ne $TestPassword) { throw "config password does not match what was set" }
}

Test-Step "A real SQL connection with the password actually set works" {
    $conn = Get-RealSqlConnection -Port $config.mssqlPort -Password $TestPassword
    $conn.Close()
}

Test-Step "The apostrophe in the test password survived (QUOTENAME escaping, 1.0.9 fix)" {
    # Redundant with the connection test above by construction, but explicit:
    # if QUOTENAME's escaping were subtly wrong, the symptom is exactly
    # "connects, but not with the password that was actually requested" -
    # a naive interpolation fix could pass a simpler password and still be
    # broken for this exact class of password.
    if ($TestPassword -notmatch "'") { throw "Test password does not contain an apostrophe - this check is meaningless" }
    $conn = Get-RealSqlConnection -Port $config.mssqlPort -Password $TestPassword
    $conn.Close()
}

Test-Step "Create a marker table (to prove the update path below does not wipe data)" {
    $conn = Get-RealSqlConnection -Port $config.mssqlPort -Password $TestPassword
    $conn.ChangeDatabase("starmans")
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "IF OBJECT_ID('dbo.CiMarker','U') IS NULL CREATE TABLE dbo.CiMarker (Id INT); INSERT INTO dbo.CiMarker VALUES (1);"
    $cmd.ExecuteNonQuery() | Out-Null
    $conn.Close()
}

# --- 3. Update/repair path - the actual test for "does an update wipe data" ---
Test-Step "Update path (setup-sqlserver.ps1 with NO -SaPassword) exits 0" {
    & $setupScript -InstallerPath (Join-Path $ResourcesDir "sqlserver\SQLEXPR_x64_ENU.exe")
    if ($LASTEXITCODE -ne 0) { throw "Update-path run exited $LASTEXITCODE" }
}

Test-Step "SQL Server was NOT reinstalled on the update path (marker row survived)" {
    $conn = Get-RealSqlConnection -Port $config.mssqlPort -Password $TestPassword
    $conn.ChangeDatabase("starmans")
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "SELECT COUNT(*) FROM dbo.CiMarker WHERE Id = 1"
    $count = $cmd.ExecuteScalar()
    $conn.Close()
    if ($count -ne 1) { throw "Marker row is gone - the update path destroyed data (count=$count)" }
}

Test-Step "Update path did not change the recorded port" {
    $after = Get-Content $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($after.mssqlPort -ne $config.mssqlPort) {
        throw "Port changed from $($config.mssqlPort) to $($after.mssqlPort) on a plain update - see the 1.0.9 'self-inflicted port walk' entry in DECISIONS.md, this is that bug's regression test"
    }
}

# --- Summary --------------------------------------------------------------
Write-Host "`n=== Setup log (sqlserver-setup.log) ===" -ForegroundColor Yellow
$logPath = "$env:ProgramData\Starmans\sqlserver-setup.log"
if (Test-Path $logPath) { Get-Content $logPath } else { Write-Host "(no log file found)" }

if ($failures.Count -gt 0) {
    Write-Host "`n$($failures.Count) CHECK(S) FAILED:" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}

Write-Host "`nAll SQL Server install/update checks passed against a real installed instance." -ForegroundColor Green
exit 0
