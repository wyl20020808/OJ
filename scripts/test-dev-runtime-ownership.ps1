$ErrorActionPreference = 'Stop'
$env:OJPLATFORM_RUNTIME_TEST_MODE = '1'
. (Join-Path $PSScriptRoot 'dev-runtime.ps1')
Remove-Item Env:OJPLATFORM_RUNTIME_TEST_MODE

function Assert-Equal($actual, $expected, [string]$label) {
  if ($actual -ne $expected) { throw "$label expected=$expected actual=$actual" }
}

$tcpListener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$tcpListener.Start()
try {
  Assert-Equal (Get-PortOwner $tcpListener.LocalEndpoint.Port).OwningProcess $PID 'listener owner lookup'
} finally {
  $tcpListener.Stop()
}

$script:testListener = @{ OwningProcess = 42 }
$script:testStart = '2026-09-04T00:00:00.0000000Z'
$script:testCommand = 'node --import tsx D:\OJPlatform-worktrees\old\apps\judge-host-agent\src\server.ts'
function Get-PortOwner { @($script:testListener) }
function Get-ProcessStartTime { $script:testStart }
function Get-ProcessInfo { @{ ProcessId=42;CommandLine=$script:testCommand;Name='node.exe';ExecutablePath='C:\Program Files\nodejs\node.exe' } }
function Get-KnownOJPlatformRoots { @('D:\OJPlatform-worktrees\old') }

$state = @{ processes=@{ 'host-agent'=@{pid=42;port=3180;processStartTime=$script:testStart;ownerCheckout='D:\OJPlatform-worktrees\old'} } }
Assert-Equal (Resolve-OJPlatformProcessOwnership 'host-agent' 3180 $state).classification 'PROVEN_OWNED' 'shared ownership'

function Get-LegacyProcessRecords { @(@{root='D:\OJPlatform-worktrees\old';record=@{pid=42;port=3180;processStartTime=$script:testStart}}) }
function Get-KnownOJPlatformRoots { @() }
$state = @{ processes=@{} }
Assert-Equal (Resolve-OJPlatformProcessOwnership 'host-agent' 3180 $state).classification 'PROVEN_OWNED' 'legacy record ownership'

function Get-LegacyProcessRecords { @() }
function Get-KnownOJPlatformRoots { @('D:\OJPlatform-worktrees\old') }
$state = @{ processes=@{} }
Assert-Equal (Resolve-OJPlatformProcessOwnership 'host-agent' 3180 $state).classification 'PROVEN_OWNED' 'registered worktree command ownership'

$script:testCommand = 'node C:\unrelated\server.js'
Assert-Equal (Resolve-OJPlatformProcessOwnership 'host-agent' 3180 $state).classification 'EXTERNAL' 'external ownership'

$script:testCommand = 'python D:\OJPlatform-worktrees\old\apps\judge-host-agent\src\server.ts'
function Get-ProcessInfo { @{ ProcessId=42;CommandLine=$script:testCommand;Name='python.exe';ExecutablePath='C:\Python\python.exe' } }
Assert-Equal (Resolve-OJPlatformProcessOwnership 'host-agent' 3180 $state).classification 'EXTERNAL' 'executable identity'

$script:testCommand = 'node --import tsx D:\OJPlatform-worktrees\old\apps\judge-host-agent\src\server.ts'
function Get-ProcessInfo { @{ ProcessId=42;CommandLine=$script:testCommand;Name='node.exe';ExecutablePath='C:\Program Files\nodejs\node.exe' } }
function Get-KnownOJPlatformRoots { @() }
function Get-LegacyProcessRecords { @(@{root='D:\OJPlatform-worktrees\old';record=@{pid=42;port=9999;processStartTime=$script:testStart}}) }
Assert-Equal (Resolve-OJPlatformProcessOwnership 'host-agent' 3180 $state).classification 'EXTERNAL' 'legacy port validation'
function Get-LegacyProcessRecords { @(@{root='D:\OJPlatform-worktrees\old';record=@{pid=42;port=3180;processStartTime='wrong'}}) }
Assert-Equal (Resolve-OJPlatformProcessOwnership 'host-agent' 3180 $state).classification 'EXTERNAL' 'legacy start time validation'

function Get-ProcessInfo { $null }
function Get-LegacyProcessRecords { @() }
Assert-Equal (Resolve-OJPlatformProcessOwnership 'host-agent' 3180 $state).classification 'UNKNOWN' 'unknown ownership'

$script:testListener = $null
Assert-Equal (Resolve-OJPlatformProcessOwnership 'host-agent' 3180 @{processes=@{'host-agent'=@{pid=42}}}).classification 'STALE_RECORD' 'stale record'
Assert-Equal (Resolve-OJPlatformProcessOwnership 'host-agent' 3180 @{processes=@{}}).classification 'NOT_RUNNING' 'not running'

$script:testListener = @{ OwningProcess = 42 }
$script:stopped = $false
function Resolve-OJPlatformProcessOwnership { @{classification='EXTERNAL';pid=42;ownerCheckout=''} }
function Stop-ProvenProcess { $script:stopped=$true;$true }
Stop-Managed 'host-agent' @{processes=@{}}
Assert-Equal $script:stopped $false 'external stop fail closed'

function Resolve-OJPlatformProcessOwnership { @{classification='PROVEN_OWNED';pid=42;ownerCheckout='D:\OJPlatform-worktrees\old'} }
function New-PortProcessRecord { @{pid=42;port=3180;processStartTime=$script:testStart;signature='apps/judge-host-agent/src/server.ts'} }
function Save-State {}
function Test-OwnedProcess { $true }
function Stop-ProvenProcess { $script:stopped=$true;$true }
$stopState=@{processes=@{}}
Stop-Managed 'host-agent' $stopState
Assert-Equal $script:stopped $true 'legacy stop'

$script:startCalled = $false
function Test-HttpOk { $true }
function Start-ProcessDetached { $script:startCalled=$true }
$startState=@{processes=@{}}
Start-Managed 'web' 'pnpm.cmd' @() @{} 5173 'http://127.0.0.1:5173/' '@ojplatform/web' $startState
Start-Managed 'web' 'pnpm.cmd' @() @{} 5173 'http://127.0.0.1:5173/' '@ojplatform/web' $startState
Assert-Equal $script:startCalled $false 'legacy start reuse and idempotence'

function Test-TcpPort([int]$Port) { $Port -eq 3180 }
$guarded=$false
try { Assert-ApplicationPortsReleased } catch { $guarded=$_.Exception.Message -match 'APPLICATION_PORT_REMAINS_OCCUPIED: 3180' }
Assert-Equal $guarded $true 'stop all application port guard'

foreach($bat in 'OJPlatform-Start.bat','OJPlatform-Stop.bat','OJPlatform-Restart.bat','OJPlatform-Status.bat') {
  if ((Get-Content -Raw (Join-Path $ProjectRoot $bat)) -notmatch 'scripts\\dev-runtime\.ps1') { throw "$bat does not use dev-runtime.ps1" }
}
'Runtime ownership focused tests PASS'
