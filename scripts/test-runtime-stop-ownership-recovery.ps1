$ErrorActionPreference = 'Stop'
$env:OJPLATFORM_RUNTIME_TEST_MODE = '1'
. (Join-Path $PSScriptRoot 'dev-runtime.ps1')
Remove-Item Env:OJPLATFORM_RUNTIME_TEST_MODE

function Assert-Equal($actual, $expected, [string]$label) {
  if ($actual -ne $expected) { throw "$label expected=$expected actual=$actual" }
}
function Assert-Contains([string]$actual, [string]$expected, [string]$label) {
  if ($actual -notlike "*$expected*") { throw "$label missing=$expected" }
}

$script:listener = $true
$script:startTime = '2026-09-08T00:00:00.0000000Z'
$script:process = [pscustomobject]@{
  ProcessId=42
  ParentProcessId=24
  Name='node.exe'
  ExecutablePath='C:\Program Files\nodejs\node.exe'
  CommandLine='node --import tsx apps/judge-host-agent/src/server.ts'
}
$script:knownRoots = @()
function Get-PortOwner { if($script:listener){@([pscustomobject]@{OwningProcess=42})}else{@()} }
function Get-ProcessInfo { $script:process }
function Get-ProcessStartTime { $script:startTime }
function Get-KnownOJPlatformRoots { @($script:knownRoots) }
function Get-LegacyProcessRecords { @() }
function Test-TcpPort { [bool]$script:listener }

$emptyState = @{processes=@{}}
$orphan = Resolve-OJPlatformProcessOwnership 'host-agent' 3180 $emptyState
Assert-Equal $orphan.classification 'ORPHANED_OJPLATFORM_PROCESS' 'missing registry exact launch contract'
Assert-Equal $orphan.inspection.parentPid 24 'process evidence parent PID'
Assert-Equal $orphan.inspection.port 3180 'process evidence listening port'
Assert-Equal $orphan.inspection.service 'host-agent' 'process evidence role'

$script:process.ExecutablePath = 'C:\unrelated\node.exe'
Assert-Equal (Resolve-OJPlatformProcessOwnership 'host-agent' 3180 $emptyState).classification 'EXTERNAL' 'untrusted Node executable path'
$script:process.ExecutablePath = 'C:\Program Files\nodejs\node.exe'

$script:process.CommandLine = 'node C:\unrelated\server.js'
Assert-Equal (Resolve-OJPlatformProcessOwnership 'host-agent' 3180 $emptyState).classification 'EXTERNAL' 'unrelated external process'
$script:process.CommandLine = 'node --import tsx apps/api/src/server.ts'
Assert-Equal (Resolve-OJPlatformProcessOwnership 'host-agent' 3180 $emptyState).classification 'EXTERNAL' 'generic Node role mismatch'
$script:process.CommandLine = 'node --import tsx D:\OJPlatform\apps\judge-host-agent\src\server.ts'
$script:knownRoots = @('D:\OJPlatform')
Assert-Equal (Resolve-OJPlatformProcessOwnership 'host-agent' 3180 $emptyState).classification 'ORPHANED_OJPLATFORM_PROCESS' 'known root orphan identity'

$script:knownRoots = @()
$script:process.CommandLine = 'node --import tsx apps/judge-host-agent/src/server.ts'
$script:taskkillPid = $null
$script:saveCount = 0
function Save-State { $script:saveCount++ }
function New-PortProcessRecord { @{pid=42;port=3180;processStartTime=$script:startTime;ownerCheckout='D:\OJPlatform';health='http://127.0.0.1:3180/health';signature='apps/judge-host-agent/src/server.ts'} }
function Test-OwnedProcess { $true }
function Invoke-TaskkillTree([int]$ProcessId) { $script:taskkillPid=$ProcessId;$script:listener=$false;$true }

$orphanState = @{processes=@{}}
$orphanOutput = (& { Stop-Managed 'host-agent' $orphanState } *>&1 | Out-String)
Assert-Equal $script:taskkillPid 42 'verified orphan tree termination'
Assert-Equal $orphanState.processes.ContainsKey('host-agent') $false 'orphan registry cleanup'
Assert-Contains $orphanOutput 'host-agent ORPHAN DETECTED' 'orphan log'
Assert-Contains $orphanOutput 'PORT 3180 RELEASED' 'orphan port release wait'
Assert-Contains $orphanOutput 'host-agent STOP (orphan recovered)' 'orphan stop result'

$script:listener = $true
$script:taskkillPid = $null
$script:process.CommandLine = 'node C:\unrelated\server.js'
$externalOutput = (& { Stop-Managed 'host-agent' @{processes=@{}} } *>&1 | Out-String)
Assert-Equal $script:taskkillPid $null 'external process not killed'
foreach($value in @('Service: host-agent','Port: 3180','PID: 42','Process Name: node.exe','Executable Path: C:\Program Files\nodejs\node.exe','Command Line: node C:\unrelated\server.js','Identity: UNVERIFIED_EXTERNAL','PowerShell: Stop-Process -Id 42 -Force','CMD: taskkill /PID 42 /T /F')) {
  Assert-Contains $externalOutput $value "external diagnostic $value"
}

$script:process.CommandLine = 'node --import tsx apps/judge-host-agent/src/server.ts'
$script:releaseChecks = 0
function Get-PortOwner {
  $script:releaseChecks++
  if($script:releaseChecks -le 3){@([pscustomobject]@{OwningProcess=42})}else{@()}
}
function Invoke-TaskkillTree { $true }
function Start-Sleep {}
Assert-Equal (Stop-ProvenProcess @{pid=42;port=3180}) $true 'delayed port release'
if($script:releaseChecks -lt 4){throw 'delayed port release was not polled'}

$script:listener = $true
function Get-PortOwner { if($script:listener){@([pscustomobject]@{OwningProcess=42})}else{@()} }
function Wait-PortReleased { $false }
function Invoke-TaskkillTree { $true }
$failedState = @{processes=@{}}
$failedOutput = (& { Stop-Managed 'host-agent' $failedState } *>&1 | Out-String)
Assert-Contains $failedOutput 'host-agent STOP did not complete' 'failed termination warning'
Assert-Contains $failedOutput 'PowerShell: Stop-Process -Id 42 -Force' 'failed termination remediation'
Assert-Equal $failedState.processes.ContainsKey('host-agent') $true 'failed termination state retained'

$script:listener = $false
$script:startCalled = $false
function Resolve-OJPlatformProcessOwnership { @{classification=if($script:listener){'PROVEN_OWNED'}else{'NOT_RUNNING'};pid=if($script:listener){42}else{$null};ownerCheckout='D:\OJPlatform'} }
function Test-HttpOk { $script:listener }
function Get-HttpJson { if($script:listener){@{status=200;body=@{}}}else{$null} }
function Start-ProcessDetached { $script:startCalled=$true;$script:listener=$true;@{pid=42} }
function Test-RecordServiceAtPort { $true }
function Wait-PortReleased { $script:listener=$false;$true }
$restartState = @{processes=@{}}
Start-Managed 'host-agent' 'node' @('--import','tsx','apps/judge-host-agent/src/server.ts') @{JUDGE_HOST_AGENT_TEMPLATES_JSON='[{"env":{}}]'} 3180 'http://127.0.0.1:3180/health' 'apps/judge-host-agent/src/server.ts' $restartState
Assert-Equal $script:startCalled $true 'next start after orphan recovery'
Assert-Equal $restartState.processes.ContainsKey('host-agent') $true 'next start registry record'

$script:taskkillPid = $null
function Invoke-TaskkillTree([int]$ProcessId) { $script:taskkillPid=$ProcessId;$script:listener=$false;$true }
Stop-Managed 'host-agent' $restartState
Assert-Equal $script:taskkillPid 42 'normal owned stop'
Assert-Equal $restartState.processes.ContainsKey('host-agent') $false 'normal stop registry cleanup'

'Runtime stop ownership recovery focused tests PASS'
