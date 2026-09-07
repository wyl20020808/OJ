$ErrorActionPreference = 'Stop'
$env:OJPLATFORM_RUNTIME_TEST_MODE = '1'
. (Join-Path $PSScriptRoot 'dev-runtime.ps1')
Remove-Item Env:OJPLATFORM_RUNTIME_TEST_MODE

function Assert-Equal($actual, $expected, [string]$label) {
  if ($actual -ne $expected) { throw "$label expected=$expected actual=$actual" }
}

$canonical = Resolve-CanonicalProductSource $ProjectRoot
Assert-Equal $canonical.root 'D:\OJPlatform' 'canonical root'
Assert-Equal $canonical.branch 'main' 'canonical branch identity'
Assert-Equal $canonical.commit ((Invoke-Git $ProjectRoot @('rev-parse','refs/heads/main')).ToLowerInvariant()) 'canonical main HEAD'

$registered = @(Get-RegisteredWorktrees $ProjectRoot)
if (@($registered | Where-Object { $_.branch -eq 'refs/heads/main' }).Count -eq 0) {
  Assert-Equal $canonical.root 'D:\OJPlatform' 'canonical resolution without main worktree entry'
}

$state = @{ processes = @{ api = @{ sourceRoot='D:\OJPlatform'; branch='main'; gitCommit=$canonical.commit } } }
$script:ProductIdentity = $canonical
Assert-Equal (Test-VersionCompatible $state.processes.api) $true 'matching version reuse'
$state.processes.api.gitCommit = ('0' * 40)
Assert-Equal (Test-VersionCompatible $state.processes.api) $false 'stale version mismatch'

'Canonical main launcher tests PASS'
