<#
.SYNOPSIS
  Applies the DB engineer's Liquibase changelog to an existing PostgreSQL database. No Docker.

.DESCRIPTION
  Connects directly to an existing PostgreSQL server over JDBC and runs Liquibase against it:

  1. (Optional) Create the target database if it is absent. Requires -CreateDatabase and connects to the
     maintenance database 'postgres' to run CREATE DATABASE only when the target does not exist. It never
     drops, truncates or alters anything, and never touches any other database. If the database already
     exists (the normal case here, where we connect to an existing DB), nothing is created.
  2. 'liquibase update-sql' prints the exact SQL for review, then 'liquibase update' applies it.
     The changelog is db\changelog\db.changelog-master.yaml, applied as-is and never edited here.

  Liquibase runs through Maven (mvn), using the same installed Maven/JDK as the app, so no Docker and no
  local 'liquibase' or 'psql' binary are needed. The Liquibase engine is pinned to the version the DB
  engineer verified (liquibase.version in pom.xml, 4.33.0) and the PostgreSQL JDBC driver is the one the
  app already depends on.

  The password is read from the environment (PGPASSWORD, or SPRING_DATASOURCE_PASSWORD) and passed to
  Maven as a property value only; it is never printed or written to a file.

  Needs: Maven (mvn) and a JDK on PATH. Network access to the PostgreSQL server.

.EXAMPLE
  $env:PGPASSWORD = 'postgres'                            # or set SPRING_DATASOURCE_PASSWORD
  powershell -NoProfile -ExecutionPolicy Bypass -File backend\scripts\db-init.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File backend\scripts\db-init.ps1 -PreviewOnly
  powershell -NoProfile -ExecutionPolicy Bypass -File backend\scripts\db-init.ps1 -CreateDatabase
#>
param(
    [string]$DbHost = '192.168.100.46',
    [int]$Port = 5432,
    [string]$User = 'postgres',
    [string]$DbName = 'aidrama',
    # Print the SQL that would run and change nothing.
    [switch]$PreviewOnly,
    # Create the target database first if it does not exist (connects to the 'postgres' database to do so).
    [switch]$CreateDatabase
)

$ErrorActionPreference = 'Stop'
if ($DbName -notmatch '^[a-z][a-z0-9_]{0,62}$') { throw "Unsafe database name: $DbName" }

$password = if ($env:PGPASSWORD) { $env:PGPASSWORD } else { $env:SPRING_DATASOURCE_PASSWORD }
if (-not $password) { throw 'Set PGPASSWORD (or SPRING_DATASOURCE_PASSWORD) in the environment first. It is never read from a file.' }

$backend = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent $backend
$changelogDir = Join-Path $repoRoot 'db\changelog'
$masterChangelog = Join-Path $changelogDir 'db.changelog-master.yaml'
if (-not (Test-Path $masterChangelog)) { throw "Changelog not found at $masterChangelog" }

$pom = Join-Path $backend 'pom.xml'
if (-not (Test-Path $pom)) { throw "pom.xml not found at $pom" }

$mvn = Get-Command mvn -ErrorAction SilentlyContinue
if (-not $mvn) { throw 'Maven (mvn) was not found on PATH. Install Maven 3.9+ and a JDK 21.' }

$jdbcUrl = "jdbc:postgresql://${DbHost}:${Port}/${DbName}"

function Invoke-Native {
    param([string]$Label, [scriptblock]$Command)
    # Windows PowerShell 5.1 turns native stderr into terminating errors under 'Stop'. Relax it here.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $output = & $Command 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = $previous }
    if ($LASTEXITCODE -ne 0) {
        $output | Write-Host
        throw "FAILED: $Label (exit $LASTEXITCODE)"
    }
    return $output
}

# Runs a Liquibase goal through Maven. The password is passed as a property value and never printed.
# -q keeps Maven quiet; Liquibase's own output still comes through.
function Invoke-Liquibase {
    param([string]$Goal, [string]$DatabaseUrl)
    Invoke-Native "liquibase:$Goal" {
        mvn -B -q -f $pom `
            "org.liquibase:liquibase-maven-plugin:${env:AIDRAMA_LIQUIBASE_VERSION}:$Goal" `
            "-Dliquibase.url=$DatabaseUrl" `
            "-Dliquibase.username=$User" `
            "-Dliquibase.password=$password" `
            "-Dliquibase.changeLogFile=db.changelog-master.yaml" `
            "-Dliquibase.searchPath=$changelogDir" `
            '-Dliquibase.analyticsEnabled=false'
    }
}

# Resolve the Liquibase version pinned in pom.xml (property liquibase.version) so the engine matches the
# one the DB engineer verified with, instead of hard-coding it in two places.
$liquibaseVersion = (Invoke-Native 'resolve liquibase.version' {
    mvn -B -q -f $pom help:evaluate '-Dexpression=liquibase.version' -DforceStdout
}) -join '' 
$liquibaseVersion = $liquibaseVersion.Trim()
if ($liquibaseVersion -notmatch '^\d+\.\d+\.\d+') { throw "Could not resolve liquibase.version from pom.xml (got '$liquibaseVersion')." }
$env:AIDRAMA_LIQUIBASE_VERSION = $liquibaseVersion

Write-Host "== Target: ${User}@${DbHost}:${Port} database '$DbName' (Liquibase $liquibaseVersion via Maven, no Docker) =="

if ($CreateDatabase) {
    Write-Host "`n== 1. Create database if absent =="
    Write-Host "NOTE: -CreateDatabase requires a 'psql' client on PATH; the normal flow connects to an existing database and does not need it."
    $psql = Get-Command psql -ErrorAction SilentlyContinue
    if (-not $psql) { throw "psql not found on PATH. Create the database '$DbName' on ${DbHost}:${Port} manually, then re-run without -CreateDatabase." }
    $env:PGPASSWORD = $password
    $exists = (Invoke-Native 'check database exists' {
        psql -w -v ON_ERROR_STOP=1 -X -q -t -A -h $DbHost -p $Port -U $User -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '$DbName'"
    }) -join ''
    if ($exists.Trim() -eq '1') {
        Write-Host "Database '$DbName' already exists. Leaving it as is."
    } elseif ($PreviewOnly) {
        Write-Host "PreviewOnly: would run CREATE DATABASE $DbName"
        Write-Host 'PreviewOnly: database does not exist yet, so migration SQL cannot be generated against it.'
        exit 0
    } else {
        Invoke-Native 'create database' {
            psql -w -v ON_ERROR_STOP=1 -X -q -h $DbHost -p $Port -U $User -d postgres -c "CREATE DATABASE $DbName"
        } | Out-Null
        Write-Host "Created database '$DbName'."
    }
} else {
    Write-Host "`n== 1. Using existing database '$DbName' (no creation; pass -CreateDatabase to create it) =="
}

Write-Host "`n== 2. Migration SQL for review (liquibase update-sql) =="
$sql = Invoke-Liquibase -Goal 'updateSQL' -DatabaseUrl $jdbcUrl
$sqlFile = Join-Path ([IO.Path]::GetTempPath()) "aidrama-update-$([guid]::NewGuid().ToString('N')).sql"
Set-Content -Path $sqlFile -Value $sql
Write-Host "Written to $sqlFile ($(@($sql).Count) lines)."
if ($PreviewOnly) { Write-Host 'PreviewOnly: stopping before update.'; exit 0 }

Write-Host "`n== 3. Apply (liquibase update) =="
Invoke-Liquibase -Goal 'update' -DatabaseUrl $jdbcUrl | Select-Object -Last 6 | Write-Host

Write-Host "`n== 4. Check (liquibase status) =="
$status = Invoke-Liquibase -Goal 'status' -DatabaseUrl $jdbcUrl
$status | Write-Host
if (($status -join "`n") -notmatch 'up to date|up-to-date|0 change') {
    Write-Host 'WARNING: Liquibase status does not clearly report the database as up to date. Review the output above.'
}

Write-Host "`nDone."
