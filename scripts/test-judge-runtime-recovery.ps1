$ErrorActionPreference = 'Stop'
$env:OJPLATFORM_RUNTIME_TEST_MODE = '1'
. (Join-Path $PSScriptRoot 'dev-runtime.ps1')
Remove-Item Env:OJPLATFORM_RUNTIME_TEST_MODE
$testRoot = Join-Path ([IO.Path]::GetTempPath()) "ojplatform-worker-recovery-$PID"
New-Item -ItemType Directory -Path $testRoot | Out-Null
$RuntimeRoot = $testRoot

function Assert-Equal($actual, $expected, [string]$label) {
  if ($actual -ne $expected) { throw "$label expected=$expected actual=$actual" }
}
function Assert-Contains([string]$actual, [string]$expected, [string]$label) {
  if ($actual -notlike "*$expected*") { throw "$label missing=$expected" }
}

$script:Secrets = @{judgeServiceToken='current-token'}
$script:portOpen = $true
$script:adminAuthorized = $false
function Test-TcpPort { $script:portOpen }
function Get-HttpJson($url, $headers, $timeout) {
  if ($url -like '*/health') { return @{status=200;body=@{status='ok'}} }
  if ($script:adminAuthorized -and $headers['x-judge-service-token'] -eq 'current-token') { return @{status=200;body=@{items=@()}} }
  return $null
}
$blocked = $false
try { Assert-JudgeAdminAuthorization } catch { $blocked=$true; Assert-Contains $_.Exception.Message 'JUDGE_ADMIN_AUTH_MISMATCH' 'live stale token error' }
Assert-Equal $blocked $true 'live stale token fails closed'
$script:adminAuthorized = $true
Assert-JudgeAdminAuthorization
$script:adminAuthorized = $false
function Get-HttpJson { return $null }
$blocked = $false
try { Assert-JudgeAdminAuthorization } catch { $blocked=$_.Exception.Message -like 'JUDGE_ADMIN_AUTH_MISMATCH*' }
Assert-Equal $blocked $true 'unhealthy live Judge also fails closed'

$script:Command = 'stop'
$script:state = @{processes=@{'judge-service'=@{pid=10}}}
$script:adminAuthorized = $false
Assert-Equal (Get-ActiveJudgeJobs) -1 '401 is not zero active jobs'
$script:Command = 'start'

$script:ProductIdentity = @{root='D:\OJPlatform';branch='main';commit='new'}
$script:stopped = $false
$script:adminAuthorized = $true
function Get-HttpJson($url, $headers, $timeout) {
  if ($script:adminAuthorized -and $headers['x-judge-service-token'] -eq 'current-token') { return @{status=200;body=@{items=@()}} }
  return $null
}
function Get-ActiveJudgeJobs { -1 }
function Test-VersionCompatible { $false }
function Resolve-OJPlatformProcessOwnership { @{classification='PROVEN_OWNED';ownerCheckout='D:\OJPlatform';record=@{pid=10;port=3100;gitCommit='old';sourceRoot='D:\OJPlatform'}} }
function Stop-Managed { $script:stopped=$true }
function Get-RecordSourceIdentity { @{commit='old'} }
$unknownBlocked = $false
try { Start-Managed 'judge-service' 'node' @() @{} 3100 'http://127.0.0.1:3100/v1/admin/nodes' 'apps/judge-service/src/server.ts' @{processes=@{}} (Get-JudgeAdminHeaders) } catch { $unknownError=$_.Exception.Message; $unknownBlocked=$unknownError -like 'RUNNING_VERSION_MISMATCH_ACTIVE_JOBS_UNKNOWN*' }
if (-not $unknownBlocked) { throw "unexpected version mismatch result: $unknownError" }
Assert-Equal $unknownBlocked $true 'version mismatch unknown jobs blocked'
Assert-Equal $script:stopped $false 'version mismatch unknown jobs not stopped'

$Config.WorkerBinary = 'C:\runtime\judge-worker.exe'
$start = [DateTime]::Parse('2026-09-08T03:44:07Z').ToUniversalTime()
$record = @{pid=42;nodeId='node-a';startedAt=[DateTimeOffset]::new($start).ToUnixTimeMilliseconds();executable=$Config.WorkerBinary}
$node = @{nodeId='node-a';activeJobs=0}
$process = [pscustomobject]@{ProcessId=42;ParentProcessId=24;Name='judge-worker.exe';ExecutablePath=$Config.WorkerBinary}
function Get-WorkerProcessStartTime { $start }
function Test-WorkerParentAlive { $false }
Assert-Equal (Resolve-WorkerRecoveryIdentity $process $record $node).classification 'REGISTERED_STALE' 'verified stale Worker'

function Test-WorkerParentAlive { $true }
Assert-Equal (Resolve-WorkerRecoveryIdentity $process $record $node).classification 'REGISTERED_CURRENT' 'current Worker preserved'
function Test-WorkerParentAlive { $false }
$node.activeJobs = 1
Assert-Equal (Resolve-WorkerRecoveryIdentity $process $record $node).classification 'ACTIVE_JOB_OWNER' 'active Worker refused'
$node.activeJobs = 0
Assert-Equal (Resolve-WorkerRecoveryIdentity $process $null $node).classification 'EXTERNAL_OR_UNKNOWN' 'unregistered executable refused'
Assert-Equal (Resolve-WorkerRecoveryIdentity $process $record $null).classification 'UNKNOWN' 'missing node state refused'

$record2 = @{pid=43;nodeId='node-b';startedAt=$record.startedAt;executable=$Config.WorkerBinary}
$process2 = [pscustomobject]@{ProcessId=43;ParentProcessId=25;Name='judge-worker.exe';ExecutablePath=$Config.WorkerBinary}
$script:killed = @()
function Get-CimInstance { @($process,$process2) }
function Get-HttpJson { @{status=200;body=@{items=@(@{nodeId='node-a';activeJobs=0},@{nodeId='node-b';activeJobs=0})}} }
function Get-Process { param([int]$Id) if ($script:killed -notcontains $Id) { [pscustomobject]@{Id=$Id;StartTime=$start} } }
function Invoke-TaskkillTree([int]$ProcessId) { $script:killed += $ProcessId; return $true }
function Start-Sleep {}
try {
  @{version=1;owned=@($record,$record2)} | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 (Join-Path $RuntimeRoot 'host-agent-state.json')
  Recover-StaleWorkers
  Assert-Equal $script:killed.Count 2 'two stale Workers recovered'
  Assert-Equal @((Get-Content -Raw (Join-Path $RuntimeRoot 'host-agent-state.json') | ConvertFrom-Json).owned).Count 0 'Worker registry reconciled'
  $bytes=[IO.File]::ReadAllBytes((Join-Path $RuntimeRoot 'host-agent-state.json'))
  Assert-Equal ([bool]($bytes.Length -ge 3 -and $bytes[0] -eq 0xef -and $bytes[1] -eq 0xbb -and $bytes[2] -eq 0xbf)) $false 'Host Agent state has no UTF-8 BOM'
} finally {
  Remove-Item -LiteralPath $testRoot -Recurse -Force
}

'Judge runtime recovery focused tests PASS'
