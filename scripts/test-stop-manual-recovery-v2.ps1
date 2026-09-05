$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$runtime = Get-Content -Raw (Join-Path $PSScriptRoot 'dev-runtime.ps1')
$bat = Get-Content -Raw (Join-Path $root 'OJPlatform-Stop.bat')
function Assert-Contains([string]$text,[string]$value,[string]$label) { if($text -notlike "*$value*"){throw "$label missing: $value"} }
Assert-Contains $runtime "STOP = BLOCKED" 'blocked result'
Assert-Contains $runtime 'Judge active-job state could not be determined' 'unknown jobs reason'
Assert-Contains $runtime 'Show-StopRecovery $state' 'blocked diagnostics continue'
Assert-Contains $runtime 'SERVICE=$($item.service) PORT=$($item.port) PID=$pidValue' 'listener fields'
Assert-Contains $runtime 'OWNER=$classification' 'ownership field'
Assert-Contains $runtime 'Stop-Process -Id $pidValue -Force' 'specific manual stop'
Assert-Contains $runtime 'MANUAL CONFIRMATION REQUIRED' 'unsafe owner warning'
Assert-Contains $bat 'if errorlevel 2' 'blocked exit handling'
Assert-Contains $bat 'OJPlatform Stop incomplete.' 'blocked message'
if($bat -match 'Stop failed:'){throw 'expected blocker uses Stop failed'}
if($runtime -match 'ACTIVE_JOBS_UNKNOWN:.*throw'){throw 'expected blocker throws'}
'Stop manual recovery contract tests PASS'
