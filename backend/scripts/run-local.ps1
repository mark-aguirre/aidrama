<#
.SYNOPSIS
  Starts the backend on http://localhost:8080 using values from backend\.env (gitignored).

.DESCRIPTION
  Loads KEY=VALUE lines from backend\.env into this process's environment. Variables that are already
  set in the environment win over the file. Values are never printed. Then runs `mvn spring-boot:run`.
  Required: SPRING_DATASOURCE_PASSWORD, AIDRAMA_JWT_SECRET, AIDRAMA_STORAGE_BUCKET, AIDRAMA_STORAGE_PUBLIC_BASE_URL.
#>
$ErrorActionPreference = 'Stop'
$backend = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $backend '.env'
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^\s*#' -or $line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') { continue }
        $name = $Matches[1]; $value = $Matches[2].Trim()
        if ($value -ne '' -and -not [Environment]::GetEnvironmentVariable($name)) {
            [Environment]::SetEnvironmentVariable($name, $value, 'Process')
        }
    }
} else {
    Write-Host 'No backend\.env found. Using the current environment only. Copy .env.example to .env to create one.'
}
Push-Location $backend
try { mvn -B spring-boot:run } finally { Pop-Location }
