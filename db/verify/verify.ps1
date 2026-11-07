<#
.SYNOPSIS
  Proves the migrations apply clean up and down on a fresh, empty, throwaway PostgreSQL.

.DESCRIPTION
  Starts a disposable postgres container on a private docker network (no published ports) and runs
  Liquibase against it. It never accepts a connection string, so it cannot touch a shared or production database.

  Steps
    1. update            apply every changeset to an empty database, save a schema-only dump (A)
    2. rollback-count    undo every changeset, assert nothing but Liquibase bookkeeping tables remains
    3. update            apply again, save schema-only dump (B), assert A equals B
    4. constraints-test  run db/verify/constraints-test.sql (synthetic data, rolled back)
    5. explain           (optional, -Explain) seed synthetic volume data and print query plans
  The container and network are removed at the end unless -Keep is given.

.EXAMPLE
  powershell -NoProfile -File db\verify\verify.ps1
  powershell -NoProfile -File db\verify\verify.ps1 -Explain
#>
param(
    [switch]$Explain,
    [switch]$Keep,
    [string]$PostgresImage = 'postgres:16-alpine',
    [string]$LiquibaseImage = 'liquibase/liquibase:4.33.0'
)

$ErrorActionPreference = 'Stop'
$dbRoot    = Split-Path -Parent $PSScriptRoot
$changelog = Join-Path $dbRoot 'changelog'
$outDir    = Join-Path $PSScriptRoot 'out'
$net       = 'aidrama-dbverify-net'
$pg        = 'aidrama-dbverify-pg'
$dbName    = 'aidrama'
$dbUser    = 'verify'
$dbPass    = [guid]::NewGuid().ToString('N')
$changesets = (Select-String -Path (Join-Path $changelog 'changes\*.sql') -Pattern '^--changeset ' | Measure-Object).Count

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

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

function Invoke-Liquibase {
    param([string[]]$LbArgs)
    Invoke-Native "liquibase $($LbArgs -join ' ')" {
        docker run --rm --network $net -e LIQUIBASE_ANALYTICS_ENABLED=false `
            -v "${changelog}:/liquibase/changelog:ro" $LiquibaseImage `
            "--url=jdbc:postgresql://${pg}:5432/${dbName}" "--username=$dbUser" "--password=$dbPass" `
            '--changelog-file=db.changelog-master.yaml' '--search-path=/liquibase/changelog' @LbArgs
    }
}

function Invoke-Psql {
    param([string]$Sql)
    Invoke-Native "psql" {
        docker exec $pg psql -v ON_ERROR_STOP=1 -X -q -t -A -U $dbUser -d $dbName -c $Sql
    }
}

function Get-SchemaDump {
    # Newer pg_dump emits random \restrict / \unrestrict tokens. Drop them so dumps are comparable.
    Invoke-Native 'pg_dump' { docker exec $pg pg_dump -U $dbUser -d $dbName --schema-only --no-owner --no-privileges } |
        Where-Object { $_ -notmatch '^\\(un)?restrict ' }
}

try {
    Write-Host "== Starting throwaway PostgreSQL ($PostgresImage) on private network =="
    Invoke-Native 'network create' { docker network create $net } | Out-Null
    Invoke-Native 'postgres run' {
        docker run -d --name $pg --network $net --label purpose=aidrama-dbverify `
            -e POSTGRES_USER=$dbUser -e POSTGRES_PASSWORD=$dbPass -e POSTGRES_DB=$dbName $PostgresImage
    } | Out-Null
    for ($i = 0; $i -lt 60; $i++) {
        docker exec $pg pg_isready -U $dbUser -d $dbName | Out-Null
        if ($LASTEXITCODE -eq 0) { break }
        Start-Sleep -Seconds 1
    }
    # The official image restarts once during init. Wait until a real query works.
    for ($i = 0; $i -lt 60; $i++) {
        docker exec $pg psql -X -q -t -A -U $dbUser -d $dbName -c 'SELECT 1' | Out-Null
        if ($LASTEXITCODE -eq 0) { break }
        Start-Sleep -Seconds 1
    }
    Write-Host (Invoke-Psql 'SELECT version()')
    Write-Host "Changesets found on disk: $changesets"

    Write-Host "`n== 1. update (fresh empty database) =="
    # update-sql first: the exact SQL a reviewer would read before anything runs.
    $sql = Invoke-Liquibase @('update-sql')
    Set-Content -Path (Join-Path $outDir 'update.sql') -Value $sql -Encoding utf8
    Write-Host "Review SQL written to $outDir\update.sql"
    Invoke-Liquibase @('update') | Select-Object -Last 3 | Write-Host
    $applied = [int](Invoke-Psql 'SELECT count(*) FROM databasechangelog')
    if ($applied -ne $changesets) { throw "Expected $changesets applied changesets, found $applied" }
    $dumpA = Get-SchemaDump
    Set-Content -Path (Join-Path $outDir 'schema-after-first-update.sql') -Value $dumpA -Encoding utf8

    # 1b. 0011-trailer-link in isolation: roll back only 0011 (and anything after it), assert every trailer object is gone,
    #     then apply again and assert the schema equals the first update.
    $trailerFile = Join-Path $changelog 'changes\0011-trailer-link.sql'
    if (Test-Path $trailerFile) {
        Write-Host "`n== 1b. 0011-trailer-link round trip in isolation =="
        $trailerObjects = @"
SELECT (SELECT count(*) FROM information_schema.columns WHERE table_name='videos' AND column_name='trailer_video_id')
     + (SELECT count(*) FROM pg_constraint WHERE conname IN ('fk_videos_trailer_video','ck_videos_trailer_not_self','ck_videos_trailer_no_nesting'))
     + (SELECT count(*) FROM pg_indexes WHERE indexname='uq_videos_trailer_video')
     + (SELECT count(*) FROM pg_trigger WHERE tgname IN ('trg_videos_check_trailer_link','trg_videos_guard_trailer_type'))
     + (SELECT count(*) FROM pg_proc WHERE proname IN ('check_video_trailer_link','guard_trailer_video_type'))
"@
        $withTrailer = [int](Invoke-Psql $trailerObjects)
        Write-Host "trailer objects present after update: $withTrailer (expected 9: 1 column, 3 constraints, 1 index, 2 triggers, 2 functions)"
        if ($withTrailer -ne 9) { throw "Expected 9 trailer objects after update, found $withTrailer" }
        $before = @(Get-ChildItem (Join-Path $changelog 'changes') -Filter '*.sql' | Where-Object { $_.Name -lt '0011-trailer-link.sql' }).Count
        $after  = $changesets - $before
        Invoke-Liquibase @('rollback-count', "--count=$after") | Select-Object -Last 2 | Write-Host
        $leftover = [int](Invoke-Psql $trailerObjects)
        Write-Host "trailer objects present after rollback: $leftover"
        if ($leftover -ne 0) { throw "Rollback of 0011 left $leftover trailer objects behind" }
        $dumpPre = Get-SchemaDump
        Set-Content -Path (Join-Path $outDir 'schema-before-0011.sql') -Value $dumpPre -Encoding utf8
        # Case-sensitive: the video_type value 'TRAILER' legitimately remains. Only the new lower-case object names must be gone.
        if (($dumpPre | Where-Object { $_ -cmatch 'trailer' }).Count -ne 0) { throw 'Schema dump still mentions trailer objects after rollback' }
        if (($dumpPre -join "`n") -eq ($dumpA -join "`n")) { throw 'Rollback of 0011 did not change the schema' }
        Invoke-Liquibase @('update') | Select-Object -Last 2 | Write-Host
        if (($dumpA -join "`n") -ne ((Get-SchemaDump) -join "`n")) { throw 'Schema after re-applying 0011 differs from the first update' }
        Write-Host '0011 round trip: rollback removed all 9 objects, re-apply restored the identical schema.'
    }

    Write-Host "`n== 2. rollback-count $changesets (down) =="
    Invoke-Liquibase @('rollback-count', "--count=$changesets") | Select-Object -Last 3 | Write-Host
    $leftTables = Invoke-Psql "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','S','f','p') AND c.relname NOT LIKE 'databasechangelog%'"
    $leftFuncs  = Invoke-Psql "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'"
    $leftTrig   = Invoke-Psql "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal"
    $leftTypes  = Invoke-Psql "SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e'"
    Write-Host "after rollback: tables=$leftTables functions=$leftFuncs triggers=$leftTrig enums=$leftTypes"
    if ("$leftTables$leftFuncs$leftTrig$leftTypes" -ne '0000') { throw 'Rollback left objects behind' }
    $remaining = [int](Invoke-Psql 'SELECT count(*) FROM databasechangelog')
    if ($remaining -ne 0) { throw "databasechangelog still has $remaining rows after rollback" }

    Write-Host "`n== 3. update again (round trip) =="
    Invoke-Liquibase @('update') | Select-Object -Last 3 | Write-Host
    $dumpB = Get-SchemaDump
    Set-Content -Path (Join-Path $outDir 'schema-after-second-update.sql') -Value $dumpB -Encoding utf8
    if (($dumpA -join "`n") -ne ($dumpB -join "`n")) { throw 'Schema differs between first and second update' }
    Write-Host 'Schema after update -> rollback -> update is identical to the first update.'

    Write-Host "`n== 3b. second update is a no-op =="
    Invoke-Liquibase @('update') | Select-Object -Last 2 | Write-Host

    Write-Host "`n== 4. constraint and integrity tests =="
    Invoke-Native 'docker cp test' { docker cp (Join-Path $PSScriptRoot 'constraints-test.sql') "${pg}:/tmp/constraints-test.sql" } | Out-Null
    $testOut = Invoke-Native 'constraints-test' { docker exec $pg psql -v ON_ERROR_STOP=1 -X -q -U $dbUser -d $dbName -f /tmp/constraints-test.sql }
    $testOut | Where-Object { $_ -match 'PASS|FAIL' } | Write-Host
    Set-Content -Path (Join-Path $outDir 'constraints-test.txt') -Value $testOut -Encoding utf8
    $passes = ($testOut | Where-Object { $_ -match 'PASS' }).Count
    Write-Host "constraint tests passed: $passes"

    if ($Explain) {
        Write-Host "`n== 5. explain on synthetic volume data =="
        if (Test-Path (Join-Path $PSScriptRoot 'explain-trailer.sql')) {
            Invoke-Native 'docker cp explain-trailer' { docker cp (Join-Path $PSScriptRoot 'explain-trailer.sql') "${pg}:/tmp/explain-trailer.sql" } | Out-Null
            $trailerPlan = Invoke-Native 'explain-trailer' { docker exec $pg psql -v ON_ERROR_STOP=1 -X -U $dbUser -d $dbName -f /tmp/explain-trailer.sql }
            Set-Content -Path (Join-Path $outDir 'explain-trailer.txt') -Value $trailerPlan -Encoding utf8
            Write-Host "Trailer plans written to $outDir\explain-trailer.txt"
        }
        Invoke-Native 'docker cp explain' { docker cp (Join-Path $PSScriptRoot 'explain-discovery.sql') "${pg}:/tmp/explain-discovery.sql" } | Out-Null
        $plan = Invoke-Native 'explain' { docker exec $pg psql -v ON_ERROR_STOP=1 -X -U $dbUser -d $dbName -f /tmp/explain-discovery.sql }
        Set-Content -Path (Join-Path $outDir 'explain.txt') -Value $plan -Encoding utf8
        Write-Host "Plans written to $outDir\explain.txt"
    }

    Write-Host "`nRESULT: OK - $changesets changesets applied, rolled back to empty, re-applied identically, $passes constraint tests passed."
}
finally {
    if (-not $Keep) {
        docker rm -f $pg | Out-Null
        docker network rm $net | Out-Null
        Write-Host 'Throwaway container and network removed.'
    }
}
