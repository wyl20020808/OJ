[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('start', 'stop', 'restart', 'status', 'logs', 'doctor')]
  [string]$Command = 'status',
  [switch]$All,
  [switch]$Verify,
  [string]$SourceRoot,
  [string]$PluginSourceRoot,
  [switch]$UseCurrentCheckout
)

$ErrorActionPreference = 'Stop'
$InvocationRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd('\')
function Invoke-Git([string]$Root, [string[]]$Arguments) {
  $output = & git -C $Root @Arguments 2>$null
  if ($LASTEXITCODE -ne 0) { throw "GIT_IDENTITY_FAILED: $Root git $($Arguments -join ' ')" }
  return (($output -join "`n").Trim())
}
function Get-GitIdentity([string]$Root) {
  if (-not (Test-Path (Join-Path $Root '.git'))) { throw "SOURCE_NOT_GIT_WORKTREE: $Root" }
  $branch = Invoke-Git $Root @('branch','--show-current'); if (-not $branch) { $branch = 'DETACHED' }
  $commit = Invoke-Git $Root @('rev-parse','HEAD')
  if ($commit -notmatch '^[0-9a-fA-F]{40}$') { throw "SOURCE_HEAD_INVALID: $Root" }
  return [pscustomobject]@{ root = [IO.Path]::GetFullPath($Root).TrimEnd('\'); branch = $branch; commit = $commit.ToLowerInvariant() }
}
function Get-RegisteredWorktrees([string]$RepoRoot) {
  $lines = @((Invoke-Git $RepoRoot @('worktree','list','--porcelain')) -split "`r?`n")
  $items = @(); $item = $null
  foreach ($line in $lines) {
    if ($line -like 'worktree *') { if ($item) { $items += $item }; $item = @{ root = $line.Substring(9).Trim() } }
    elseif ($item -and $line -like 'branch *') { $item.branch = $line.Substring(7).Trim() }
    elseif ($item -and $line -eq 'detached') { $item.branch = 'DETACHED' }
  }
  if ($item) { $items += $item }
  return @($items | Where-Object { $_.root -and (Test-Path $_.root) })
}
function Test-TrackedClean([string]$Root) { return [string]::IsNullOrWhiteSpace((Invoke-Git $Root @('status','--porcelain','--untracked-files=no'))) }
function Resolve-RegisteredSource([string]$Requested, [string]$RepoRoot, [switch]$RequireClean) {
  $candidate = [IO.Path]::GetFullPath($Requested).TrimEnd('\')
  $registered = @(Get-RegisteredWorktrees $RepoRoot | Where-Object { [IO.Path]::GetFullPath($_.root).TrimEnd('\') -ieq $candidate })
  if ($registered.Count -eq 0) { throw "SOURCE_NOT_REGISTERED_WORKTREE: $candidate" }
  $identity = Get-GitIdentity $candidate
  if ($RequireClean -and -not (Test-TrackedClean $candidate)) { throw "SOURCE_TRACKED_DIRTY: $candidate" }
  return $identity
}
function Resolve-MainWorktree([string]$RepoRoot) {
  $main = @(Get-RegisteredWorktrees $RepoRoot | Where-Object { $_.branch -eq 'refs/heads/main' }) | Select-Object -First 1
  if (-not $main) { throw "CANONICAL_MAIN_NOT_FOUND: $RepoRoot" }
  return (Get-GitIdentity $main.root)
}
function Resolve-CanonicalPluginRepo {
  $candidates = @($env:OJPLATFORM_CANONICAL_PLUGIN_ROOT, 'D:\OJPlatformPlugins\OnlineCodeEditor', 'D:\OJPlatformPlugins\OnlineCodeEditor-remediation') | Where-Object { $_ -and (Test-Path $_) }
  foreach ($candidate in $candidates) {
    try {
      $root = [IO.Path]::GetFullPath($candidate)
      $identity = Get-GitIdentity $root
      if ($identity.branch -eq 'main') { return $identity.root }
      return (Resolve-MainWorktree $root).root
    } catch {}
  }
  throw 'CANONICAL_PLUGIN_MAIN_NOT_FOUND'
}
$PluginRepoRoot = Resolve-CanonicalPluginRepo
$CanonicalProductIdentity = Resolve-MainWorktree $InvocationRoot
$CanonicalPluginIdentity = Resolve-MainWorktree $PluginRepoRoot
$ProductIdentity = if ($UseCurrentCheckout) { Resolve-RegisteredSource $InvocationRoot $InvocationRoot -RequireClean } elseif ($SourceRoot) { Resolve-RegisteredSource $SourceRoot $InvocationRoot -RequireClean } else { $CanonicalProductIdentity }
$PluginIdentity = if ($PluginSourceRoot) { Resolve-RegisteredSource $PluginSourceRoot $PluginRepoRoot -RequireClean } else { $CanonicalPluginIdentity }
$ProjectRoot = $ProductIdentity.root
Set-Location $ProjectRoot
# Explorer-launched BAT files may not inherit the npm user-bin directory.
# Add it only to this manager process so detached Web processes can resolve pnpm.
$UserNpmBin = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'npm'
$UserPnpm = Join-Path $UserNpmBin 'pnpm.cmd'
if ((Test-Path -LiteralPath $UserPnpm) -and (($env:Path -split ';') -notcontains $UserNpmBin)) {
  $env:Path = "$UserNpmBin;$env:Path"
}
$RuntimeRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'OJPlatform\runtime\ojplatform-local'
$StateFile = Join-Path $RuntimeRoot 'state.json'
$ContractFile = Join-Path $RuntimeRoot 'runtime-contract.json'
$LockFile = Join-Path $RuntimeRoot 'runtime.lock'
$LogRoot = Join-Path $RuntimeRoot 'logs'

$Config = @{
  WebPort = 5173; ApiPort = 3010; JudgeServicePort = 3100; HostAgentPort = 3180; SupervisorPort = 19092
  ComposeProjectName = 'ojplatform-local'
  WslDistro = 'Ubuntu-24.04'; SupervisorLinuxBinary = '/opt/ojplatform/bin/supervisor'
  SupervisorSystemdUnit = 'ojplatform-local-supervisor.service'
  SupervisorProbeLinuxPath = '/opt/ojplatform/bin/trusted-probe'; SupervisorSandboxRoot = '/tmp/ojplatform-sandbox'
  SupervisorRuncBinary = 'runc'; CompilerRootfsLinuxPath = '/opt/ojplatform/compiler-rootfs/cpp20-gcc-13-v1'
  CompilerRootfsIdentity = ''; CompilerRootfsVersion = 'g++-13 (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0'; WorkerBinary = ''
  WorkerHealthPort = 18080; WorkerMaxConcurrency = 1; HostCpuUnits = 1; HostMemoryMb = 1024; PoolMode = 'MANUAL'
  ProductDatabaseUrl = 'postgres://ojplatform:ojplatform_dev@127.0.0.1:55432/ojplatform'
  JudgeDatabaseAdminUrl = 'postgres://ojplatform:ojplatform_dev@127.0.0.1:55432/postgres'
  JudgeDatabaseName = 'ojplatform_judge'; JudgeDatabaseRole = 'oj_judge_service'; JudgeDatabasePassword = ''
  JudgeDatabaseUrl = 'postgres://oj_judge_service:CHANGE_ME@127.0.0.1:55432/ojplatform_judge'
  RedisUrl = 'redis://127.0.0.1:56379'; JudgeRedisPrefix = 'oj:judge-service'; MinioEndpoint = 'http://127.0.0.1:59000'; AutoOpenBrowser = $false
}
$LocalConfig = Join-Path $ProjectRoot 'config/dev-runtime.local.ps1'
if (Test-Path $LocalConfig) { . $LocalConfig; if ($OJPlatformRuntimeConfig) { foreach ($key in $OJPlatformRuntimeConfig.Keys) { $Config[$key] = $OJPlatformRuntimeConfig[$key] } } }
$Config.WebOrigin = "http://127.0.0.1:$($Config.WebPort)"; $Config.ApiOrigin = "http://127.0.0.1:$($Config.ApiPort)"; $Config.JudgeOrigin = "http://127.0.0.1:$($Config.JudgeServicePort)"; $Config.HostOrigin = "http://127.0.0.1:$($Config.HostAgentPort)"; $Config.SupervisorOrigin = "http://127.0.0.1:$($Config.SupervisorPort)"
$Config.WorkerBinary = if ($Config.WorkerBinary) { $Config.WorkerBinary } else { Join-Path $RuntimeRoot 'bin/judge-worker.exe' }
$Config.WorkerBuildMetadata = if ($Config.WorkerBuildMetadata) { $Config.WorkerBuildMetadata } else { Join-Path $RuntimeRoot 'bin/judge-worker.build.json' }
$PortReconcileScript = Join-Path $ProjectRoot 'scripts/runtime-port-reconcile.ps1'

function Ensure-RuntimeFolders { New-Item -ItemType Directory -Force -Path $RuntimeRoot, $LogRoot, (Join-Path $RuntimeRoot 'bin') | Out-Null }
function Convert-ToHashtable($value) { if ($null -eq $value) { return $null }; if ($value -is [System.Collections.IDictionary]) { $result=@{}; foreach($key in $value.Keys){$result[$key]=Convert-ToHashtable $value[$key]}; return $result }; if ($value -is [System.Collections.IEnumerable] -and -not ($value -is [string])) { return @($value | ForEach-Object { Convert-ToHashtable $_ }) }; if ($value -is [psobject]) { $result=@{}; foreach($property in $value.PSObject.Properties){$result[$property.Name]=Convert-ToHashtable $property.Value}; return $result }; return $value }
function Get-KnownOJPlatformRoots {
  $roots = @($ProjectRoot, 'D:\OJPlatform')
  try { $roots += @(& git -C $ProjectRoot worktree list --porcelain 2>$null | Where-Object { $_ -like 'worktree *' } | ForEach-Object { $_.Substring(9) }) } catch {}
  return @($roots | Where-Object { $_ -and (Test-Path $_) } | ForEach-Object { [IO.Path]::GetFullPath($_).TrimEnd('\') } | Select-Object -Unique)
}
function Get-LegacyRuntimeRoots {
  return @(Get-KnownOJPlatformRoots | Where-Object { Test-Path (Join-Path $_ '.runtime\state.json') })
}
function Get-LegacyProcessRecords([string]$Name) {
  $records=@()
  foreach($root in Get-LegacyRuntimeRoots){try{$legacy=Convert-ToHashtable (Get-Content -Raw (Join-Path $root '.runtime\state.json')|ConvertFrom-Json);$record=$legacy.processes[$Name];if($record){$records+=@{root=$root;record=$record}}}catch{}}
  return $records
}
function Import-LegacyRuntimeState {
  if (Test-Path $StateFile) { return }
  $candidates = @()
  foreach ($root in Get-LegacyRuntimeRoots) {
    try {
      $state = Convert-ToHashtable (Get-Content -Raw (Join-Path $root '.runtime\state.json') | ConvertFrom-Json)
      if ($state.processes -and $state.processes.Count -gt 0) {
        $live = @($state.processes.Values | Where-Object { $_.pid -and $_.port -and ((Get-PortOwner ([int]$_.port) | Select-Object -First 1).OwningProcess -eq [int]$_.pid) }).Count
        if ($live -gt 0) { $candidates += @{ root=$root; state=$state; live=$live; newest=@($state.processes.Values | ForEach-Object { $_.startedAt } | Sort-Object -Descending | Select-Object -First 1)[0] } }
      }
    } catch {}
  }
  $candidate = $candidates | Sort-Object @{ Expression='live'; Descending=$true }, @{ Expression='newest'; Descending=$true } | Select-Object -First 1
  if (-not $candidate) { return }
  $candidate.state.runtimeInstanceId = $Config.ComposeProjectName
  $candidate.state.ownerCheckout = $candidate.root
  foreach ($name in @($candidate.state.processes.Keys)) {
    $record = $candidate.state.processes[$name]
    $record.ownerCheckout = $candidate.root
    if ($record.pid -and $record.port) {
      $listener = Get-PortOwner ([int]$record.port) | Select-Object -First 1
      if ($listener -and [int]$listener.OwningProcess -eq [int]$record.pid) { $record.processStartTime = Get-ProcessStartTime ([int]$record.pid) }
    }
  }
  $candidate.state.legacyStateImportedAt = (Get-Date).ToUniversalTime().ToString('o')
  Ensure-RuntimeFolders
  $candidate.state | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $StateFile
  $legacySecrets = Join-Path $candidate.root '.runtime\secrets.json'
  if ((Test-Path $legacySecrets) -and -not (Test-Path (Join-Path $RuntimeRoot 'secrets.json'))) { Copy-Item -LiteralPath $legacySecrets -Destination (Join-Path $RuntimeRoot 'secrets.json') }
  Write-Host "Shared runtime registry IMPORTED ($($candidate.root))"
}
function Read-State { Import-LegacyRuntimeState; if (-not (Test-Path $StateFile)) { return @{ version = 2; runtimeInstanceId = $Config.ComposeProjectName; ownerCheckout = $ProjectRoot; processes = @{}; infrastructure = @{ managed = $false }; timings = @{} } }; try { return Convert-ToHashtable (Get-Content -Raw $StateFile | ConvertFrom-Json) } catch { throw "Shared runtime state is unreadable: $StateFile" } }
function Save-State($state) { Ensure-RuntimeFolders; $state.version=3; $state.runtimeInstanceId=$Config.ComposeProjectName; $state.requestedSource=@{ root=$ProductIdentity.root; branch=$ProductIdentity.branch; commit=$ProductIdentity.commit; canonical=($ProductIdentity.root -ieq $CanonicalProductIdentity.root -and $ProductIdentity.commit -ieq $CanonicalProductIdentity.commit) }; $state.requestedPlugin=@{ root=$PluginIdentity.root; branch=$PluginIdentity.branch; commit=$PluginIdentity.commit; canonical=($PluginIdentity.root -ieq $CanonicalPluginIdentity.root -and $PluginIdentity.commit -ieq $CanonicalPluginIdentity.commit) }; $state.canonical_product_root=$CanonicalProductIdentity.root; $state.canonical_plugin_root=$CanonicalPluginIdentity.root; if (-not $state.ownerCheckout) { $state.ownerCheckout=$ProjectRoot }; $contract=@{ canonical_product_root=$CanonicalProductIdentity.root; canonical_plugin_root=$CanonicalPluginIdentity.root; runtime_instance_id=$Config.ComposeProjectName; requested_product_root=$ProductIdentity.root; requested_product_commit=$ProductIdentity.commit; requested_plugin_root=$PluginIdentity.root; requested_plugin_commit=$PluginIdentity.commit; updated_at=(Get-Date).ToUniversalTime().ToString('o') }; $contract | ConvertTo-Json | Set-Content -Encoding UTF8 $ContractFile; $temporary="$StateFile.$PID.tmp"; $state | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $temporary; Move-Item -LiteralPath $temporary -Destination $StateFile -Force }
function Acquire-RuntimeLock {
  Ensure-RuntimeFolders
  try {
    $script:RuntimeLock = [IO.File]::Open($LockFile, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::Read)
    $bytes = [Text.Encoding]::UTF8.GetBytes([string]$PID)
    $script:RuntimeLock.Write($bytes, 0, $bytes.Length)
    $script:RuntimeLock.Flush()
  } catch {
    $ownerPid = $null
    try { $ownerPid = [int](Get-Content -Raw $LockFile -ErrorAction Stop).Trim() } catch {}
    $lockAge = if (Test-Path $LockFile) { ((Get-Date) - (Get-Item $LockFile).LastWriteTime).TotalSeconds } else { 0 }
    if (($ownerPid -and -not (Get-Process -Id $ownerPid -ErrorAction SilentlyContinue)) -or (-not $ownerPid -and $lockAge -gt 120)) {
      Remove-Item -LiteralPath $LockFile -Force -ErrorAction SilentlyContinue
      try {
        $script:RuntimeLock = [IO.File]::Open($LockFile, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::Read)
        $bytes = [Text.Encoding]::UTF8.GetBytes([string]$PID)
        $script:RuntimeLock.Write($bytes, 0, $bytes.Length)
        $script:RuntimeLock.Flush()
        return
      } catch {}
    }
    throw 'Another OJPlatform Runtime Manager operation is already running.'
  }
}
function Release-RuntimeLock { if ($script:RuntimeLock) { $script:RuntimeLock.Dispose(); Remove-Item -LiteralPath $LockFile -Force -ErrorAction SilentlyContinue } }
function Quote-Arg([string]$Value) { if ($Value -notmatch '[\s"]') { return $Value }; return '"' + ($Value -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"' }
function Invoke-ProcessCommand([string]$FilePath, [string[]]$Arguments, [hashtable]$Environment = @{}, [int]$TimeoutMs = 30000, [string]$WorkingDirectory = $null) {
  $psi = [Diagnostics.ProcessStartInfo]::new(); $psi.FileName = $FilePath; $psi.Arguments = (($Arguments | ForEach-Object { Quote-Arg $_ }) -join ' '); $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  $psi.WorkingDirectory = if ($WorkingDirectory) { $WorkingDirectory } else { (Get-Location).Path }
  foreach ($key in $Environment.Keys) { $psi.Environment[$key] = [string]$Environment[$key] }
  $p = [Diagnostics.Process]::new(); $p.StartInfo = $psi; if (-not $p.Start()) { throw "Unable to start $FilePath" }; if (-not $p.WaitForExit($TimeoutMs)) { try { $p.Kill() } catch {}; throw "Timed out running $FilePath" }; $stdout = $p.StandardOutput.ReadToEnd(); $stderr = $p.StandardError.ReadToEnd(); if ($p.ExitCode -ne 0) { throw "Command failed ($($p.ExitCode)): $FilePath $($Arguments -join ' ')`n$stderr" }; return $stdout.Trim()
}
function Start-ProcessDetached([string]$FilePath, [string[]]$Arguments, [hashtable]$Environment, [string]$Stdout, [string]$Stderr) { $json = $Environment | ConvertTo-Json -Compress; $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)); return (Invoke-ProcessCommand 'node' (@('scripts/runtime-spawn.mjs','--cwd',$ProjectRoot,'--stdout',$Stdout,'--stderr',$Stderr,'--env-b64',$b64,'--',$FilePath) + $Arguments) @{} 15000 | ConvertFrom-Json) }
function Test-TcpPort([int]$Port) { try { $client = [Net.Sockets.TcpClient]::new(); $task = $client.ConnectAsync('127.0.0.1', $Port); $ok = $task.Wait(500); $client.Dispose(); return $ok -and $task.IsCompleted -and -not $task.IsFaulted } catch { return $false } }
function Get-HttpJson([string]$Url, [hashtable]$Headers = @{}) { try { $response = Invoke-WebRequest -Uri $Url -Headers $Headers -UseBasicParsing -TimeoutSec 3; return @{ status = [int]$response.StatusCode; body = ($response.Content | ConvertFrom-Json) } } catch { return $null } }
function Wait-Http([string]$Url, [int]$TimeoutSec = 60, [hashtable]$Headers = @{}) { $deadline = (Get-Date).AddSeconds($TimeoutSec); do { $result = Get-HttpJson $Url $Headers; if ($result -and $result.status -eq 200) { return $result.body }; Start-Sleep -Milliseconds 250 } while ((Get-Date) -lt $deadline); throw "Timed out waiting for $Url" }
function Wait-HttpStatus([string]$Url, [int]$TimeoutSec = 60) { $deadline=(Get-Date).AddSeconds($TimeoutSec); do { try { if ([int](Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) { return } } catch {}; Start-Sleep -Milliseconds 250 } while ((Get-Date) -lt $deadline); throw "Timed out waiting for $Url" }
function Get-ProcessInfo([int]$ProcessId) { try { return Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" } catch { return $null } }
function Get-ProcessStartTime([int]$ProcessId) { try { return (Get-Process -Id $ProcessId -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o') } catch { return $null } }
function Get-PortOwner([int]$Port) {
  try { return @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1) } catch { return @() }
}
function Get-ServiceCommandPattern([string]$Name) {
  switch ($Name) {
    'api' { 'apps[\\/]api[\\/]src[\\/]server\.ts' }
    'web' { 'apps[\\/]web[\\/].*vite|vite.*apps[\\/]web' }
    'judge-service' { 'apps[\\/]judge-service[\\/]src[\\/]server\.ts' }
    'host-agent' { 'apps[\\/]judge-host-agent[\\/]src[\\/]server\.ts' }
    default { '(?!)' }
  }
}
function Test-ServiceProcessIdentity($Process, [string]$Name, [string]$Root = '') {
  if (-not $Process -or -not $Process.CommandLine -or $Process.Name -notin @('node','node.exe')) { return $false }
  if ($Process.CommandLine -notmatch (Get-ServiceCommandPattern $Name)) { return $false }
  return -not $Root -or $Process.CommandLine -match [regex]::Escape([IO.Path]::GetFullPath($Root).TrimEnd('\'))
}
function Get-ServicePort([string]$Name) { switch($Name){'web'{$Config.WebPort};'api'{$Config.ApiPort};'judge-service'{$Config.JudgeServicePort};'host-agent'{$Config.HostAgentPort};'supervisor'{$Config.SupervisorPort}} }
function Get-ServiceSignature([string]$Name) { switch($Name){'web'{'@ojplatform/web'};'api'{'apps/api/src/server.ts'};'judge-service'{'apps/judge-service/src/server.ts'};'host-agent'{'apps/judge-host-agent/src/server.ts'};'supervisor'{$Config.SupervisorLinuxBinary}} }
function Get-ServiceHealthUrl([string]$Name) { switch($Name){'web'{"$($Config.WebOrigin)/"};'api'{"$($Config.ApiOrigin)/health"};'judge-service'{"$($Config.JudgeOrigin)/health"};'host-agent'{"$($Config.HostOrigin)/health"};'supervisor'{"$($Config.SupervisorOrigin)/v1/health"}} }
function Resolve-OJPlatformProcessOwnership([string]$Name, [int]$Port, $state) {
  $listener = Get-PortOwner $Port | Select-Object -First 1
  $shared = if ($state -and $state.processes) { $state.processes[$Name] } else { $null }
  if (-not $listener) { return @{ classification=if($shared){'STALE_RECORD'}else{'NOT_RUNNING'}; pid=$null; ownerCheckout=''; evidence='no listener'; record=$shared } }
  $pidValue = [int]$listener.OwningProcess
  $processStartTime = Get-ProcessStartTime $pidValue
  if ($shared -and [int]$shared.pid -eq $pidValue -and [int]$shared.port -eq $Port -and $shared.processStartTime -and $processStartTime -eq [string]$shared.processStartTime) {
    return @{ classification='PROVEN_OWNED'; pid=$pidValue; ownerCheckout=if($shared.ownerCheckout){$shared.ownerCheckout}else{$shared.cwd}; evidence='shared PID + port + process start time'; record=$shared }
  }
  $process = Get-ProcessInfo $pidValue
  foreach ($legacyEntry in Get-LegacyProcessRecords $Name) {
    $root=$legacyEntry.root;$record=$legacyEntry.record
    if ($record -and [int]$record.pid -eq $pidValue -and [int]$record.port -eq $Port -and $record.processStartTime -and $processStartTime -eq [string]$record.processStartTime -and (Test-ServiceProcessIdentity $process $Name)) {
      return @{ classification='PROVEN_OWNED'; pid=$pidValue; ownerCheckout=$root; evidence='legacy PID + port + process start time'; record=$record }
    }
  }
  if (-not $process -or -not $process.CommandLine) { return @{ classification='UNKNOWN'; pid=$pidValue; ownerCheckout=''; evidence='process identity unavailable'; record=$null } }
  foreach ($root in Get-KnownOJPlatformRoots) {
    if (Test-ServiceProcessIdentity $process $Name $root) {
      return @{ classification='PROVEN_OWNED'; pid=$pidValue; ownerCheckout=$root; evidence='registered worktree + service command identity'; record=$null }
    }
  }
  return @{ classification='EXTERNAL'; pid=$pidValue; ownerCheckout=''; evidence='listener command is not a known OJPlatform service'; record=$null }
}
function Test-RecordedPortOwnership($record) {
  if (-not $record -or -not $record.pid -or -not $record.port -or -not $record.processStartTime) { return $false }
  $listener = Get-PortOwner ([int]$record.port) | Select-Object -First 1
  if (-not $listener -or [int]$listener.OwningProcess -ne [int]$record.pid) { return $false }
  return (Get-ProcessStartTime ([int]$record.pid)) -eq [string]$record.processStartTime
}
function Get-RequestedSourceIdentity { return $ProductIdentity }
function Get-RecordSourceIdentity($record) {
  if ($record -and $record.sourceRoot -and $record.gitCommit) { return [pscustomobject]@{ root=[string]$record.sourceRoot; branch=[string]$record.branch; commit=[string]$record.gitCommit } }
  $owner = if ($record.ownerCheckout) { [string]$record.ownerCheckout } elseif ($record.cwd) { [string]$record.cwd } else { '' }
  if ($owner) { try { return Get-GitIdentity $owner } catch {} }
  return $null
}
function Test-VersionCompatible($record) {
  $identity = Get-RecordSourceIdentity $record
  $requested = Get-RequestedSourceIdentity
  if (-not $identity) {
    $owner = if ($record.ownerCheckout) { [string]$record.ownerCheckout } else { '' }
    return $owner -and -not (Test-Path $owner)
  }
  return $identity -and $identity.root -ieq $requested.root -and $identity.commit -ieq $requested.commit
}
function Test-PluginVersionCompatible($record) {
  if (-not $record.pluginRoot) { return -not (Test-Path ([string]$record.ownerCheckout)) }
  return $record -and $record.pluginRoot -ieq $PluginIdentity.root -and $record.pluginCommit -ieq $PluginIdentity.commit
}
function Get-ActiveJudgeJobs {
  try {
    $headers=@{'x-judge-service-token'=$script:Secrets.judgeServiceToken}; $nodes=Get-HttpJson "$($Config.JudgeOrigin)/v1/admin/nodes" $headers
    if (-not $nodes) { return 0 }
    return [int](@($nodes.body.items | Measure-Object -Property activeJobs -Sum).Sum)
  } catch { return 0 }
}
function Test-RecordServiceAtPort($record) {
  if (-not $record -or -not $record.port) { return $false }
  $listener = Get-PortOwner ([int]$record.port) | Select-Object -First 1
  if (-not $listener) { return $false }
  $process = Get-ProcessInfo ([int]$listener.OwningProcess)
  if (-not $process -or -not $process.CommandLine) { return $false }
  if ($record.signature -and $process.CommandLine -match [regex]::Escape([string]$record.signature)) { return $true }
  $owner = if ($record.ownerCheckout) { [string]$record.ownerCheckout } else { [string]$record.cwd }
  return $owner -and $process.CommandLine -match [regex]::Escape($owner)
}
function Find-ProcessByPortIdentity([string]$Signature, [int]$Port, [string]$OwnerCheckout = $ProjectRoot) {
  $listener = Get-PortOwner $Port | Select-Object -First 1
  if (-not $listener) { return $null }
  $process = Get-ProcessInfo ([int]$listener.OwningProcess)
  if (-not $process -or -not $process.CommandLine) { return $null }
  if ($process.CommandLine -match [regex]::Escape($Signature) -or $process.CommandLine -match [regex]::Escape($OwnerCheckout)) { return $process }
  return $null
}
function Test-OwnedProcess($record) {
  if (-not $record -or -not $record.pid) { return $false }
  # PID plus listener port plus immutable process start time is sufficient
  # ownership evidence even when CIM command-line inspection is unavailable.
  if (Test-RecordedPortOwnership $record) { return $true }
  $p = Get-ProcessInfo ([int]$record.pid)
  if ($null -eq $p) { return $false }
  if ($record.processStartTime -and (Get-ProcessStartTime ([int]$record.pid)) -ne [string]$record.processStartTime) { return $false }
  if ($p.CommandLine -and $p.CommandLine -match [regex]::Escape([string]$record.signature)) { return $true }
  # pnpm.cmd is represented by cmd.exe and the command line may omit the
  # workspace path. The recorded PID, canonical port and pnpm invocation are
  # still required together before treating it as owned.
  if ($p.CommandLine -and $record.port -and $p.CommandLine -match 'pnpm' -and $p.CommandLine -match [regex]::Escape([string]$record.port)) { return $true }
  return Test-RecordedPortOwnership $record
}
function New-Token { return ([Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')) }
function Get-Secrets([switch]$Create) { $file = Join-Path $RuntimeRoot 'secrets.json'; if (Test-Path $file) { return Convert-ToHashtable (Get-Content -Raw $file | ConvertFrom-Json) }; if (-not $Create) { return $null }; Ensure-RuntimeFolders; $secrets = @{ judgeServiceToken = New-Token; judgeNodeToken = New-Token; hostAgentToken = New-Token; judgeDatabasePassword = New-Token }; $secrets | ConvertTo-Json | Set-Content -Encoding UTF8 $file; return $secrets }
function Start-Managed([string]$Name, [string]$FilePath, [string[]]$Arguments, [hashtable]$Environment, [int]$Port, [string]$HealthUrl, [string]$Signature, $state, [hashtable]$HealthHeaders = @{}) {
  $old = $state.processes[$Name]; $healthy = if ($HealthUrl.EndsWith('/')) { Test-HttpOk $HealthUrl } else { [bool](Get-HttpJson $HealthUrl $HealthHeaders) }
  $ownership = Resolve-OJPlatformProcessOwnership $Name $Port $state
  if ($ownership.classification -eq 'PROVEN_OWNED' -and $healthy) {
    $record = if ($ownership.record) { $ownership.record } else { New-PortProcessRecord $Name $Port $HealthUrl $Signature $ownership.ownerCheckout }
    $versionMatch = (Test-VersionCompatible $record) -and ($Name -ne 'web' -or (Test-PluginVersionCompatible $record))
    if (-not $versionMatch) {
      $active = Get-ActiveJudgeJobs
      if ($active -gt 0) { throw "RUNNING_VERSION_MISMATCH_ACTIVE_JOBS: $Name activeJobs=$active current=$([string](Get-RecordSourceIdentity $record).commit) requested=$($ProductIdentity.commit) owner=$($ownership.ownerCheckout)" }
      $currentIdentity = Get-RecordSourceIdentity $record
      Write-Host "$Name RUNNING_VERSION_MISMATCH (current $([string]$currentIdentity.commit), requested $($ProductIdentity.commit)); stopping old owned runtime"
      $state.processes[$Name] = $record; Save-State $state; Stop-Managed $Name $state; $ownership = @{ classification = 'NOT_RUNNING' }; $old = $null; $healthy = $false
    } else { $state.processes[$Name]=$record;Save-State $state;Write-Host "$Name REUSE ($($ownership.evidence))";return }
  }
  if ($ownership.classification -eq 'PROVEN_OWNED') { $state.processes[$Name]=New-PortProcessRecord $Name $Port $HealthUrl $Signature $ownership.ownerCheckout;Save-State $state;Stop-Managed $Name $state;$old=$null }
  elseif (@('EXTERNAL','UNKNOWN') -contains $ownership.classification) { throw "$Name port $Port owner is $($ownership.classification); refusing reconciliation." }
  if ($old -and $healthy) {
    if ((Test-OwnedProcess $old) -or (Test-RecordServiceAtPort $old)) { if (-not (Test-RecordedPortOwnership $old)) { $state.processes[$Name] = New-PortProcessRecord $Name $Port $HealthUrl $Signature $old.ownerCheckout; Save-State $state }; Write-Host "$Name REUSE (healthy)"; return }
    $adopted = Find-ProcessBySignature $Signature $Port
    if ($adopted) {
      $state.processes[$Name] = New-ProcessRecord $adopted $Name $Port $HealthUrl $Signature 'OJPlatform-Local-Runtime-Manager-V1-adopted'
      Save-State $state; Write-Host "$Name REUSE (adopted healthy process)"; return
    }
    throw "$Name is healthy but Runtime Manager cannot prove process ownership; refusing to start a duplicate."
  }
  if (-not $old -and $healthy) {
    $adopted = Find-ProcessByPortIdentity $Signature $Port
    if ($adopted) {
      $state.processes[$Name] = New-ProcessRecord $adopted $Name $Port $HealthUrl $Signature 'OJPlatform-Local-Runtime-Manager-V1-adopted'
      Save-State $state; Write-Host "$Name REUSE (adopted healthy process)"; return
    }
    throw "$Name is healthy but Runtime Manager cannot prove process ownership; refusing to start a duplicate."
  }
  if ($old -and (Test-OwnedProcess $old)) { Stop-Managed $Name $state }
  if ((Test-TcpPort $Port) -and -not $healthy) { throw "$Name port $Port is occupied by an unknown process." }
  $out = Join-Path $LogRoot "$Name.log"; $err = Join-Path $LogRoot "$Name.error.log"; $result = Start-ProcessDetached $FilePath $Arguments $Environment $out $err; $deadline=(Get-Date).AddSeconds(15); do { Start-Sleep -Milliseconds 200; $ready = if ($HealthUrl.EndsWith('/')) { Test-HttpOk $HealthUrl } else { [bool](Get-HttpJson $HealthUrl $HealthHeaders) }; $listener=Get-PortOwner $Port|Select-Object -First 1; if($ready -and $listener){$candidate=New-PortProcessRecord $Name $Port $HealthUrl $Signature $ProjectRoot;if(-not(Test-RecordServiceAtPort $candidate)){throw "$Name START REFUSED: port $Port is healthy but listener PID $($listener.OwningProcess) does not match OJPlatform source identity."};$state.processes[$Name]=$candidate;$state.ownerCheckout=$ProjectRoot;Save-State $state;Write-Host "$Name START (pid $($listener.OwningProcess))";return} }while((Get-Date)-lt $deadline); $state.processes[$Name]=New-ProcessRecord (Get-ProcessInfo ([int]$result.pid)) $Name $Port $HealthUrl $Signature 'OJPlatform-Local-Runtime-Manager-V1';$state.ownerCheckout=$ProjectRoot;Save-State $state;Write-Host "$Name START PENDING (pid $($result.pid))"
}
function New-ProcessRecord($process, [string]$Name, [int]$Port, [string]$HealthUrl, [string]$Signature, [string]$Authority) { $processIdentifier = if ($process) { [int]$process.ProcessId } else { 0 }; return @{ pid=$processIdentifier; port=$Port; health=$HealthUrl; startedAt=(Get-Date).ToUniversalTime().ToString('o'); processStartTime=(Get-ProcessStartTime $processIdentifier); processStartTimeUtc=(Get-ProcessStartTime $processIdentifier); processName=if($process){$process.Name}else{$null}; executablePath=if($process){$process.ExecutablePath}else{$null}; command=if($process){$process.CommandLine}else{$null}; cwd=$ProjectRoot; ownerCheckout=$ProjectRoot; sourceRoot=$ProductIdentity.root; branch=$ProductIdentity.branch; gitCommit=$ProductIdentity.commit; pluginRoot=$PluginIdentity.root; pluginBranch=$PluginIdentity.branch; pluginCommit=$PluginIdentity.commit; signature=$Signature; log=(Join-Path $LogRoot "$Name.log"); errorLog=(Join-Path $LogRoot "$Name.error.log"); sourceAuthority=$Authority } }
function New-PortProcessRecord([string]$Name, [int]$Port, [string]$HealthUrl, [string]$Signature, [string]$OwnerCheckout) { $listener=Get-PortOwner $Port|Select-Object -First 1; $record=New-ProcessRecord (Get-ProcessInfo ([int]$listener.OwningProcess)) $Name $Port $HealthUrl $Signature 'OJPlatform-Local-Runtime-Manager-V1';$record.ownerCheckout=$OwnerCheckout;$record.cwd=$OwnerCheckout;try{$identity=Get-GitIdentity $OwnerCheckout;$record.sourceRoot=$identity.root;$record.branch=$identity.branch;$record.gitCommit=$identity.commit}catch{};return $record }
function Find-ProcessBySignature([string]$Signature, [int]$Port) {
  $escaped = [regex]::Escape($Signature)
  $candidates = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'wsl.exe' -and $_.CommandLine -and $_.CommandLine -match $escaped -and $_.CommandLine -match "127\.0\.0\.1:$Port" })
  if ($candidates.Count -gt 0) { return $candidates[0] }
  return $null
}
function Stop-ProvenProcess($record) {
  $targets = @([int]$record.pid)
  $listener = Get-PortOwner ([int]$record.port) | Select-Object -First 1
  if ($listener) { $targets += [int]$listener.OwningProcess }
  foreach ($target in @($targets | Select-Object -Unique)) { try { Stop-Process -Id $target -Force -ErrorAction Stop } catch {} }
  if (-not $record.port) { return $true }
  $deadline=(Get-Date).AddSeconds(5); do { if (-not (Get-PortOwner ([int]$record.port) | Select-Object -First 1)) { return $true }; Start-Sleep -Milliseconds 100 } while ((Get-Date)-lt $deadline)
  return $false
}
function Stop-Managed([string]$Name, $state) {
  $record = $state.processes[$Name]
  if ($Name -ne 'supervisor') {
    $servicePort=[int](Get-ServicePort $Name)
    $ownership = Resolve-OJPlatformProcessOwnership $Name $servicePort $state
    if ($ownership.classification -eq 'PROVEN_OWNED') { $record=New-PortProcessRecord $Name $servicePort (Get-ServiceHealthUrl $Name) (Get-ServiceSignature $Name) $ownership.ownerCheckout;$state.processes[$Name]=$record;Save-State $state }
    elseif (@('EXTERNAL','UNKNOWN') -contains $ownership.classification) { Write-Warning "$Name STOP REFUSED: port owner is $($ownership.classification), PID $($ownership.pid).";return }
    elseif ($record) { $state.processes.Remove($Name);Save-State $state;return }
  }
  if ($record -and -not (Test-OwnedProcess $record) -and (Test-RecordServiceAtPort $record)) { $record=New-PortProcessRecord $Name ([int]$record.port) $record.health $record.signature $record.ownerCheckout; $state.processes[$Name]=$record; Save-State $state }
  $stopped = $false
  if ($record -and (Test-OwnedProcess $record)) { $stopped = Stop-ProvenProcess $record }
  elseif ($record -and $record.pid -and $Name -ne 'supervisor') { Write-Warning "$Name STOP REFUSED: ownership cannot be proven for PID $($record.pid), port $($record.port)."; return }
  if ($Name -eq 'supervisor') {
    if (-not $record) { Write-Warning 'supervisor STOP REFUSED: no shared ownership record.'; return }
    try { Invoke-Wsl @('-d',$Config.WslDistro,'--user','oj-sandbox','--','env','XDG_RUNTIME_DIR=/run/user/1000','DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus','systemctl','--user','stop',$Config.SupervisorSystemdUnit) 10000 | Out-Null } catch {}
    foreach ($process in @(Find-ProcessBySignature $Config.SupervisorLinuxBinary $Config.SupervisorPort)) {
      if ([int]$process.ProcessId -le 4) { continue }
      try { Stop-Process -Id ([int]$process.ProcessId) -Force -ErrorAction Stop } catch { Write-Warning "supervisor WSL process could not be stopped: $($_.Exception.Message)" }
    }
  }
  if ($Name -eq 'supervisor') { $stopped = -not (Get-HttpJson "$($Config.SupervisorOrigin)/v1/health") }
  if ($record -and $stopped) { $state.processes.Remove($Name); Save-State $state; Write-Host "$Name STOP" }
  elseif ($record) { Write-Warning "$Name STOP did not complete; shared state retained." }
}
function Invoke-Wsl([string[]]$Arguments, [int]$TimeoutMs = 30000) { return ((Invoke-ProcessCommand 'wsl.exe' $Arguments @{} $TimeoutMs) -replace "`0", '') }
function Get-ComposePath { return '/mnt/' + ($ProjectRoot.Substring(0,1).ToLower()) + $ProjectRoot.Substring(2).Replace('\','/') + '/deploy/docker/compose.yml' }
function Invoke-Compose([string[]]$Arguments, [int]$TimeoutMs = 120000) {
  $compose = Get-ComposePath
  return Invoke-Wsl (@('-d',$Config.WslDistro,'--','docker','compose','-p',$Config.ComposeProjectName,'-f',$compose) + $Arguments) $TimeoutMs
}
function Ensure-DockerPreflight($state) {
  if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) { throw 'WSL_PREFLIGHT_FAILED: wsl.exe is unavailable.' }
  try {
    $distros = Invoke-Wsl @('-l','-q') 15000
    if ($distros -notmatch [regex]::Escape([string]$Config.WslDistro)) { throw "distro $($Config.WslDistro) not registered" }
  } catch { throw "WSL_PREFLIGHT_FAILED: $($_.Exception.Message)" }
  try { Invoke-Wsl @('-d',$Config.WslDistro,'--','true') 15000 | Out-Null } catch { throw "WSL_PREFLIGHT_FAILED: could not start $($Config.WslDistro): $($_.Exception.Message)" }
  $marker = 'ojplatform-local-runtime-keepalive'
  $keepalive = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'wsl.exe' -and $_.CommandLine -and $_.CommandLine -match [regex]::Escape($marker) } | Select-Object -First 1)
  if (-not $keepalive) {
    try {
      $result = Start-ProcessDetached 'wsl.exe' @('-d',$Config.WslDistro,'--','bash','-lc',"exec -a $marker sleep infinity") @{} (Join-Path $LogRoot 'wsl-keepalive.log') (Join-Path $LogRoot 'wsl-keepalive.error.log')
      $state.processes['wsl-keepalive'] = @{ pid=[int]$result.pid; port=0; health=''; startedAt=(Get-Date).ToUniversalTime().ToString('o'); command="wsl.exe -d $($Config.WslDistro) -- bash -lc exec -a $marker sleep infinity"; cwd=$ProjectRoot; signature=$marker; log=(Join-Path $LogRoot 'wsl-keepalive.log'); errorLog=(Join-Path $LogRoot 'wsl-keepalive.error.log'); sourceAuthority='OJPlatform-Local-Runtime-Manager-V1' }
    } catch { throw "WSL_PREFLIGHT_FAILED: could not keep $($Config.WslDistro) alive: $($_.Exception.Message)" }
  }
  $dockerReady = $false
  try { Invoke-Wsl @('-d',$Config.WslDistro,'--','docker','info') 15000 | Out-Null; $dockerReady = $true } catch {}
  if (-not $dockerReady) {
    foreach ($startArgs in @(@('systemctl','start','docker'),@('sudo','-n','systemctl','start','docker'),@('service','docker','start'))) {
      try { Invoke-Wsl (@('-d',$Config.WslDistro,'--') + $startArgs) 15000 | Out-Null; break } catch {}
    }
    try { Invoke-Wsl @('-d',$Config.WslDistro,'--','docker','info') 15000 | Out-Null; $dockerReady = $true } catch {}
  }
  if (-not $dockerReady) { throw 'DOCKER_DAEMON_UNAVAILABLE: Docker daemon is not reachable in WSL.' }
  try { Invoke-Wsl @('-d',$Config.WslDistro,'--','docker','compose','version') 15000 | Out-Null } catch { throw "COMPOSE_UNAVAILABLE: Docker Compose is unavailable in $($Config.WslDistro)." }
  Write-Host "Docker preflight PASS ($($Config.WslDistro), WSL-native Docker)"
}
function Get-ComposeInspection([string]$Service) {
  $container = "$($Config.ComposeProjectName)-$Service-1"
  try {
    $format = '{"State":{"Status":"{{.State.Status}}","Health":{"Status":"{{if .State.Health}}{{.State.Health.Status}}{{end}}"}},"HostConfig":{"PortBindings":{{json .HostConfig.PortBindings}}},"NetworkSettings":{"Networks":{{if index .NetworkSettings.Networks "ojplatform-local"}}{"ojplatform-local":{}}{{else}}{}{{end}}},"Config":{"Labels":{"com.docker.compose.project":"{{index .Config.Labels "com.docker.compose.project"}}","com.docker.compose.service":"{{index .Config.Labels "com.docker.compose.service"}}"}}}'
    return (ConvertFrom-Json -InputObject (Invoke-Wsl @('-d',$Config.WslDistro,'--','docker','inspect','--format',$format,$container) 15000))
  } catch { return $null }
}
function Get-ContainerLabel($Inspection, [string]$Name) {
  if (-not $Inspection -or -not $Inspection.Config -or -not $Inspection.Config.Labels) { return $null }
  $property = $Inspection.Config.Labels.PSObject.Properties | Where-Object { $_.Name -eq $Name } | Select-Object -First 1
  if ($property) { return [string]$property.Value }
  return $null
}
function Test-ContainerPortMapping($Inspection, [string]$ContainerPort, [int]$HostPort) {
  if (-not $Inspection -or -not $Inspection.HostConfig -or -not $Inspection.HostConfig.PortBindings) { return $false }
  $property = $Inspection.HostConfig.PortBindings.PSObject.Properties | Where-Object { $_.Name -eq $ContainerPort } | Select-Object -First 1
  if (-not $property -or -not $property.Value) { return $false }
  return @($property.Value | Where-Object { [int]$_.HostPort -eq $HostPort }).Count -gt 0
}
function Test-ContainerNetwork($Inspection, [string]$NetworkName) {
  if (-not $Inspection -or -not $Inspection.NetworkSettings -or -not $Inspection.NetworkSettings.Networks) { return $false }
  return @($Inspection.NetworkSettings.Networks.PSObject.Properties | Where-Object { $_.Name -eq $NetworkName }).Count -gt 0
}
function Get-InfrastructureStatus([string]$Service, [string]$ContainerPort, [int]$HostPort) {
  $inspection = Get-ComposeInspection $Service
  $result = [ordered]@{ service=$Service; hostPort=$HostPort; container="$($Config.ComposeProjectName)-$Service-1"; exists=[bool]$inspection; running=$false; healthy=$false; mapping=$false; network=$false; hostReachable=$false; code='CONTAINER_DOWN'; detail='' ; inspection=$inspection }
  if (-not $inspection) { $result.detail = 'expected container is missing'; return [pscustomobject]$result }
  $result.running = [string]$inspection.State.Status -eq 'running'
  $result.healthy = $result.running -and $inspection.State.Health -and ([string]$inspection.State.Health.Status -eq 'healthy')
  $result.mapping = Test-ContainerPortMapping $inspection $ContainerPort $HostPort
  $result.network = Test-ContainerNetwork $inspection $Config.ComposeProjectName
  $projectLabel = Get-ContainerLabel $inspection 'com.docker.compose.project'
  $serviceLabel = Get-ContainerLabel $inspection 'com.docker.compose.service'
  if ($projectLabel -ne [string]$Config.ComposeProjectName -or $serviceLabel -ne $Service) { $result.code='NETWORK_CONFIGURATION_STALE'; $result.detail='Compose project/service labels do not match canonical identity'; return [pscustomobject]$result }
  if (-not $result.running) { $result.code='CONTAINER_DOWN'; $result.detail="container state=$($inspection.State.Status)"; return [pscustomobject]$result }
  if (-not $result.healthy) { $result.code='CONTAINER_UNHEALTHY'; $result.detail="health=$([string]$inspection.State.Health.Status)"; return [pscustomobject]$result }
  if (-not $result.mapping) { $result.code='PORT_MAPPING_MISSING'; $result.detail="expected host port $HostPort -> $ContainerPort"; return [pscustomobject]$result }
  if (-not $result.network) { $result.code='NETWORK_CONFIGURATION_STALE'; $result.detail="expected network $($Config.ComposeProjectName)"; return [pscustomobject]$result }
  $result.hostReachable = Test-TcpPort $HostPort
  if (-not $result.hostReachable) { $result.code='HOST_PORT_UNREACHABLE'; $result.detail="127.0.0.1:$HostPort is not reachable"; return [pscustomobject]$result }
  $result.code='READY'; $result.detail='container, health, mapping, network, and host reachability valid'; return [pscustomobject]$result
}
function Write-InfrastructureDiagnostics($Statuses) {
  $lines = @("$(Get-Date -Format o) infrastructure reconciliation")
  foreach ($status in $Statuses) { $lines += "$($status.service): $($status.code) - $($status.detail)"; Write-Host "Infrastructure $($status.service): $($status.code) ($($status.detail))" }
  Ensure-RuntimeFolders; Add-Content -LiteralPath (Join-Path $LogRoot 'infrastructure.log') -Value $lines
}
function Convert-WindowsPathToWsl([string]$Path) { if ($Path -match '^([A-Za-z]):\\(.*)$') { return "/mnt/$($Matches[1].ToLower())/$($Matches[2].Replace('\\','/'))" }; return $Path.Replace('\\','/') }
function Get-SourceIdentity([string]$Root, [string[]]$Patterns) {
  $hash = [Security.Cryptography.SHA256]::Create()
  $fileHash = [Security.Cryptography.SHA256]::Create()
  try {
    $entries = @(Get-ChildItem -LiteralPath $Root -Recurse -File | Where-Object { $Patterns -contains $_.Name -or ($Patterns -contains '*.go' -and $_.Extension -eq '.go') })
    $comparer = [System.Collections.Generic.Comparer[object]]::Create([Comparison[object]]{ param($left, $right) [StringComparer]::OrdinalIgnoreCase.Compare($left.FullName, $right.FullName) })
    [Array]::Sort($entries, $comparer)
    $manifest = [Text.StringBuilder]::new()
    foreach ($entry in $entries) {
      $relative = $entry.FullName.Substring($Root.TrimEnd('\').Length + 1) -replace '\\','/'
      $bytesForFile = [IO.File]::ReadAllBytes($entry.FullName)
      $fileDigest = [BitConverter]::ToString($fileHash.ComputeHash($bytesForFile)) -replace '-',''
      [void]$manifest.Append($relative).Append("`n").Append($fileDigest.ToLowerInvariant()).Append("`n")
    }
    $bytes = [Text.Encoding]::UTF8.GetBytes($manifest.ToString())
    return ([BitConverter]::ToString($hash.ComputeHash($bytes)) -replace '-','').ToLowerInvariant()
  } finally { $hash.Dispose(); $fileHash.Dispose() }
}
function Test-WslFile([string]$Path, [switch]$Executable, [switch]$Directory) { try { $test = if ($Executable) { 'test -x' } elseif ($Directory) { 'test -d' } else { 'test -f' }; Invoke-Wsl @('-d',$Config.WslDistro,'--','bash','-lc',"$test '$Path'") 10000 | Out-Null; return $true } catch { return $false } }
function Resolve-CompilerRootfsIdentity {
  $root = [string]$Config.CompilerRootfsLinuxPath
  if (-not $root) { throw 'Supervisor prerequisite missing: CompilerRootfsLinuxPath in config/dev-runtime.local.ps1.' }
  try {
    $identity = (Invoke-Wsl @('-d',$Config.WslDistro,'--','cat',"$root.identity") 10000).Trim()
    $manifestHash = ((Invoke-Wsl @('-d',$Config.WslDistro,'--','sha256sum',"$root.content-manifest.txt") 10000).Trim() -split '\s+')[0].ToLowerInvariant()
  } catch { throw "Compiler rootfs identity could not be read or manifest could not be hashed: $($_.Exception.Message)" }
  if ($identity -notmatch '^[0-9a-fA-F]{64}$') { throw "Compiler rootfs identity is invalid: $identity" }
  if ($manifestHash -ne $identity.ToLowerInvariant()) { throw "Compiler rootfs manifest identity mismatch: .identity=$identity manifest_sha256=$manifestHash" }
  if ($Config.CompilerRootfsIdentity -and ([string]$Config.CompilerRootfsIdentity).ToLowerInvariant() -ne $identity.ToLowerInvariant()) {
    throw "Compiler rootfs configured identity mismatch: configured=$($Config.CompilerRootfsIdentity) actual=$identity"
  }
  $Config.CompilerRootfsIdentity = $identity.ToLowerInvariant()
  return $Config.CompilerRootfsIdentity
}
function Ensure-SupervisorBinaries {
  $sourceRoot = Join-Path $ProjectRoot 'apps/sandbox-supervisor'
  $sourceWsl = Convert-WindowsPathToWsl $sourceRoot
  foreach ($item in @(@{path=$Config.SupervisorLinuxBinary; package='./cmd/supervisor'; label='supervisor'}, @{path=$Config.SupervisorProbeLinuxPath; package='./cmd/trusted-probe'; label='trusted-probe'})) {
    if (Test-WslFile $item.path -Executable) { Write-Host "$($item.label) REUSE ($($item.path))"; continue }
    $parent = [IO.Path]::GetDirectoryName($item.path.Replace('/','\\')) -replace '\\','/'
    $command = "mkdir -p '$parent'; cd '$sourceWsl'; go build -trimpath -o '$($item.path)' $($item.package); chmod 755 '$($item.path)'"
    Write-Host "$($item.label) BUILD (canonical source)"
    Invoke-Wsl @('-d',$Config.WslDistro,'--','bash','-lc',$command) 120000 | Out-Null
    if (-not (Test-WslFile $item.path -Executable)) { throw "$($item.label) build did not produce an executable at $($item.path)." }
  }
}
function Get-FileSha256([string]$Path) { if (-not (Test-Path $Path)) { return $null }; return ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash).ToLowerInvariant() }
function Ensure-WorkerBinary {
  $sourceRoot = Join-Path $ProjectRoot 'apps/judge-worker'
  $identity = Get-SourceIdentity $sourceRoot @('*.go','go.mod')
  $metadata = $null
  if (Test-Path $Config.WorkerBuildMetadata) { try { $metadata = Convert-ToHashtable (Get-Content -Raw $Config.WorkerBuildMetadata | ConvertFrom-Json) } catch {} }
  if ((Test-Path $Config.WorkerBinary) -and $metadata -and $metadata.sourceIdentity -eq $identity -and $metadata.gitCommit -eq $ProductIdentity.commit -and $metadata.binaryHash -eq (Get-FileSha256 $Config.WorkerBinary)) { Write-Host "worker binary REUSE ($($Config.WorkerBinary))"; return }
  Ensure-RuntimeFolders
  Write-Host "worker binary BUILD (source $identity)"
  $workerDir = Join-Path $ProjectRoot 'apps/judge-worker'
  Invoke-ProcessCommand 'go' @('build','-trimpath','-o',$Config.WorkerBinary,'./cmd/judge-worker') @{} 120000 $workerDir | Out-Null
  if (-not (Test-Path $Config.WorkerBinary)) { throw "Worker build did not produce $($Config.WorkerBinary)." }
  @{ schema = 2; sourceIdentity = $identity; sourceRoot = $ProductIdentity.root; branch = $ProductIdentity.branch; gitCommit = $ProductIdentity.commit; binaryPath = $Config.WorkerBinary; binaryHash = (Get-FileSha256 $Config.WorkerBinary); builtAt = (Get-Date).ToUniversalTime().ToString('o'); command = 'go build -trimpath -o .runtime/bin/judge-worker.exe ./cmd/judge-worker' } | ConvertTo-Json | Set-Content -Encoding UTF8 $Config.WorkerBuildMetadata
}
function Repair-SupervisorUserManager {
  $failed = Invoke-Wsl @('-d',$Config.WslDistro,'--user','oj-sandbox','--','env','XDG_RUNTIME_DIR=/run/user/1000','DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus','systemctl','--user','--failed','--no-legend','--plain') 10000
  foreach ($line in ($failed -split "`r?`n")) {
    $unit = (($line -split '\s+')[0]).Trim()
    if ($unit -and $unit -match '^(phase2b-|phase2c-|c2c2-|c2c4-|ojplatform-)') {
      Invoke-Wsl @('-d',$Config.WslDistro,'--user','oj-sandbox','--','env','XDG_RUNTIME_DIR=/run/user/1000','DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus','systemctl','--user','reset-failed',$unit) 10000 | Out-Null
      Write-Host "Supervisor stale scope RESET ($unit)"
    }
  }
  $state = (Invoke-Wsl @('-d',$Config.WslDistro,'--user','oj-sandbox','--','env','XDG_RUNTIME_DIR=/run/user/1000','DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus','systemctl','--user','is-system-running') 10000).Trim()
  if ($state -ne 'running') { throw "Supervisor systemd user manager is unavailable: $state" }
}
function Ensure-Infrastructure($state) {
  $started = Get-Date
  Ensure-DockerPreflight $state
  $compose = Get-ComposePath
  $services = @(
    @{ name='postgres'; containerPort='5432/tcp'; hostPort=55432 },
    @{ name='redis'; containerPort='6379/tcp'; hostPort=56379 },
    @{ name='minio'; containerPort='9000/tcp'; hostPort=59000 }
  )
  $statuses = @($services | ForEach-Object { Get-InfrastructureStatus $_.name $_.containerPort $_.hostPort })
  Write-InfrastructureDiagnostics $statuses
  if (@($statuses | Where-Object { $_.code -eq 'READY' }).Count -eq $services.Count) {
    $state.infrastructure = @{ managed=$true; project=$Config.ComposeProjectName; compose=$compose; startedAt=(Get-Date).ToUniversalTime().ToString('o') }
    $state.timings.infra = 0; Save-State $state; Write-Host 'Infrastructure REUSE (healthy, canonical project/mapping/network)'; return
  }
  foreach ($status in $statuses | Where-Object { $_.code -ne 'READY' }) {
    $recreate = $status.exists -and ((-not $status.mapping) -or (-not $status.network) -or ((Get-ContainerLabel $status.inspection 'com.docker.compose.project') -ne [string]$Config.ComposeProjectName) -or ((Get-ContainerLabel $status.inspection 'com.docker.compose.service') -ne $status.service))
    try {
      Invoke-ProcessCommand 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',$PortReconcileScript,'-Distro',$Config.WslDistro,'-Project',$Config.ComposeProjectName,'-Service',$status.service,'-Port',[string]$status.hostPort) @{} 30000 | ForEach-Object { if ($_){ Write-Host $_ } }
      if ($recreate) { Write-Host "Infrastructure $($status.service) RECREATE (stale configuration)"; Invoke-Compose @('up','-d','--force-recreate',$status.service) 120000 | Out-Null }
      else { Write-Host "Infrastructure $($status.service) START/REUSE"; Invoke-Compose @('up','-d',$status.service) 120000 | Out-Null }
    } catch {
      $message = $_.Exception.Message
      if ($message -match 'PORT_OWNED_BY_|PORT_OWNER_UNKNOWN|WSL_DOCKER_INSPECTION_FAILED') { throw $message }
      if ($message -match 'address already in use') {
        try { Write-Host "Infrastructure $($status.service) port state recovery"; if ($status.exists -and -not $status.running) { Invoke-Compose @('rm','-sf',$status.service) 30000 | Out-Null }; Invoke-ProcessCommand 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',$PortReconcileScript,'-Distro',$Config.WslDistro,'-Project',$Config.ComposeProjectName,'-Service',$status.service,'-Port',[string]$status.hostPort) @{} 30000 | Out-Null; Invoke-Compose @('up','-d',$status.service) 120000 | Out-Null }
        catch { $recoveryMessage=$_.Exception.Message; if ($recoveryMessage -match 'PORT_OWNED_BY_|PORT_OWNER_UNKNOWN|WSL_DOCKER_INSPECTION_FAILED') { throw $recoveryMessage }; throw "PORT_BIND_FAILED: OWNER=UNKNOWN SERVICE=$($status.service) PORT=$($status.hostPort) detail=$recoveryMessage" }
      } else { throw "COMPOSE_FAILURE: $($status.service): $message" }
    }
  }
  $deadline = (Get-Date).AddSeconds(90)
  do {
    $statuses = @($services | ForEach-Object { Get-InfrastructureStatus $_.name $_.containerPort $_.hostPort })
    if (@($statuses | Where-Object { $_.code -eq 'READY' }).Count -eq $services.Count) {
      $state.infrastructure = @{ managed=$true; project=$Config.ComposeProjectName; compose=$compose; startedAt=(Get-Date).ToUniversalTime().ToString('o') }
      $state.timings.infra = [int]((Get-Date)-$started).TotalMilliseconds; Save-State $state; Write-Host "Infrastructure START ($($state.timings.infra) ms)"; return
    }
    Start-Sleep -Milliseconds 750
  } while ((Get-Date) -lt $deadline)
  Write-InfrastructureDiagnostics $statuses
  $first = $statuses | Where-Object { $_.code -ne 'READY' } | Select-Object -First 1
  throw "Infrastructure readiness failed: $($first.code) [$($first.service)] $($first.detail)"
}
function Ensure-JudgeDatabase {
  Write-Host 'Judge DB bootstrap: checking'
  $password = if ($Config.JudgeDatabasePassword) { [string]$Config.JudgeDatabasePassword } else { [string]$script:Secrets.judgeDatabasePassword }
  if (-not $Config.JudgeDatabaseAdminUrl -or -not $Config.JudgeDatabaseName -or -not $Config.JudgeDatabaseRole) { throw 'Judge database bootstrap configuration is incomplete.' }
  $env = @{ JUDGE_DATABASE_ADMIN_URL = [string]$Config.JudgeDatabaseAdminUrl; JUDGE_DATABASE_NAME = [string]$Config.JudgeDatabaseName; JUDGE_DATABASE_ROLE = [string]$Config.JudgeDatabaseRole; JUDGE_DATABASE_PASSWORD = $password }
  Invoke-ProcessCommand 'node' @('scripts/judge-service-bootstrap.mjs') $env 30000 | Out-Null
  $Config.JudgeDatabaseUrl = "postgres://$($Config.JudgeDatabaseRole):$([uri]::EscapeDataString($password))@127.0.0.1:55432/$($Config.JudgeDatabaseName)"
  Write-Host "Judge DB bootstrap REUSE/READY ($($Config.JudgeDatabaseName))"
}
function Get-JudgeDatabaseUrl {
  if ($Config.JudgeDatabasePassword) { $password = [string]$Config.JudgeDatabasePassword }
  elseif ($script:Secrets -and $script:Secrets.judgeDatabasePassword) { $password = [string]$script:Secrets.judgeDatabasePassword }
  else { return $null }
  return "postgres://$($Config.JudgeDatabaseRole):$([uri]::EscapeDataString($password))@127.0.0.1:55432/$($Config.JudgeDatabaseName)"
}
function Invoke-Migrations($state) { Write-Host 'Migrations: checking Product DB and Judge DB'; $started=Get-Date; $productUrl=$Config.ProductDatabaseUrl; $judgeUrl=Get-JudgeDatabaseUrl; if (-not $judgeUrl) { throw 'Judge database password is unavailable.' }; $productDir=Join-Path $ProjectRoot 'packages/database/migrations'; $judgeDir=Join-Path $ProjectRoot 'packages/judge-runtime/migrations'; $jobs=@(); foreach($item in @(@{url=$productUrl;dir=$productDir;label='product'},@{url=$judgeUrl;dir=$judgeDir;label='judge'})){ $jobs += Start-Job -ScriptBlock { param($root,$url,$dir,$label); Set-Location $root; $env:RUNTIME_MIGRATION_DATABASE_URL=$url; $env:RUNTIME_MIGRATION_DIRECTORY=$dir; $env:RUNTIME_MIGRATION_LABEL=$label; node scripts/dev-runtime-migrate.mjs; if($LASTEXITCODE -ne 0){throw "$label migration failed"} } -ArgumentList $ProjectRoot,$item.url,$item.dir,$item.label }; $jobs|Wait-Job|Out-Null; $failed=$false; foreach($job in $jobs){ Receive-Job $job; if($job.State -ne 'Completed' -or $job.ChildJobs[0].JobStateInfo.State -ne 'Completed'){ $failed=$true }; Remove-Job $job -Force }; if($failed){throw 'Database migration failed; dependent services were not started.'}; $state.timings.migrations=[int]((Get-Date)-$started).TotalMilliseconds; Save-State $state; Write-Host 'Migrations PASS' }
function Start-Supervisor($state) {
  Resolve-CompilerRootfsIdentity | Out-Null
  Repair-SupervisorUserManager
  $health = Get-HttpJson "$($Config.SupervisorOrigin)/v1/health"
  if ($health) { Write-Host 'supervisor REUSE (healthy)'; return }
  if (Test-TcpPort $Config.SupervisorPort) { throw "supervisor port $($Config.SupervisorPort) is occupied by an unknown process." }
  $env=@{XDG_RUNTIME_DIR='/run/user/1000';DBUS_SESSION_BUS_ADDRESS='unix:path=/run/user/1000/bus';OJPLATFORM_SANDBOX_ROOT=$Config.SupervisorSandboxRoot;OJPLATFORM_RUNC_BIN=$Config.SupervisorRuncBinary;OJPLATFORM_SANDBOX_PROBE_PATH=$Config.SupervisorProbeLinuxPath;OJPLATFORM_REAL_EXECUTION_ENABLED='true';OJPLATFORM_CPP20_ROOTFS=$Config.CompilerRootfsLinuxPath;OJPLATFORM_CPP20_ROOTFS_IDENTITY=$Config.CompilerRootfsIdentity}
  $envArgs=($env.Keys|ForEach-Object { "$_=$($env[$_] -replace '"','\\"')" }) -join ' '
  $linux="exec systemd-run --user --unit=$($Config.SupervisorSystemdUnit) --collect --property=Delegate=yes --no-block -- /usr/bin/env $envArgs $($Config.SupervisorLinuxBinary) --listen 127.0.0.1:$($Config.SupervisorPort)"
  $started=Get-Date
  Invoke-Wsl @('-d',$Config.WslDistro,'--user','oj-sandbox','--','bash','-lc',$linux) 15000 | Out-Null
  $state.processes['supervisor'] = @{ pid = 0; port = $Config.SupervisorPort; health = "$($Config.SupervisorOrigin)/v1/health"; startedAt = (Get-Date).ToUniversalTime().ToString('o'); command = $linux; cwd = $ProjectRoot; sourceRoot=$ProductIdentity.root; branch=$ProductIdentity.branch; gitCommit=$ProductIdentity.commit; pluginRoot=$PluginIdentity.root; pluginBranch=$PluginIdentity.branch; pluginCommit=$PluginIdentity.commit; signature = $Config.SupervisorLinuxBinary; log = (Join-Path $LogRoot 'supervisor.log'); errorLog = (Join-Path $LogRoot 'supervisor.error.log'); sourceAuthority = 'OJPlatform-Local-Runtime-Manager-V1-systemd-user' }
  Save-State $state
  Wait-Http "$($Config.SupervisorOrigin)/v1/health" 60 | Out-Null
  $state.timings.supervisor=[int]((Get-Date)-$started).TotalMilliseconds; Save-State $state
}
function Start-HostAgent($state) { $template=@{templateId='cpp20-gcc-13-v1';displayName='Local C++20 GCC 13 (trusted)';executable=$Config.WorkerBinary;args=@();env=@{REDIS_URL=$Config.RedisUrl;QUEUE_PREFIX=$Config.JudgeRedisPrefix;REAL_SUBMISSION_EXECUTION='true';JUDGE_SERVICE_URL=$Config.JudgeOrigin;JUDGE_NODE_TOKEN=$script:Secrets.judgeNodeToken;OJPLATFORM_SANDBOX_SUPERVISOR_URL=$Config.SupervisorOrigin;OJPLATFORM_SOURCE_ROOT=$ProductIdentity.root;OJPLATFORM_SOURCE_BRANCH=$ProductIdentity.branch;OJPLATFORM_SOURCE_COMMIT=$ProductIdentity.commit;OJPLATFORM_WORKER_BINARY_HASH=(Get-FileSha256 $Config.WorkerBinary);MAX_CONCURRENCY=[string]$Config.WorkerMaxConcurrency;HEALTH_ADDR="127.0.0.1:$($Config.WorkerHealthPort)"};maxConcurrentJobs=[int]$Config.WorkerMaxConcurrency;cpuUnits=[double]$Config.HostCpuUnits;memoryMb=[double]$Config.HostMemoryMb;enabled=$true}; $templatesJson = ConvertTo-Json -InputObject @($template) -Compress; $env=@{JUDGE_HOST_AGENT_TOKEN=$script:Secrets.hostAgentToken;JUDGE_HOST_AGENT_PORT=[string]$Config.HostAgentPort;JUDGE_HOST_AGENT_STATE_PATH=(Join-Path $RuntimeRoot 'host-agent-state.json');JUDGE_HOST_AGENT_TEMPLATES_JSON=$templatesJson;JUDGE_HOST_CPU_UNITS=[string]$Config.HostCpuUnits;JUDGE_HOST_MEMORY_MB=[string]$Config.HostMemoryMb}; Start-Managed 'host-agent' 'node' @('--import','tsx','apps/judge-host-agent/src/server.ts') $env $Config.HostAgentPort "$($Config.HostOrigin)/health" 'apps/judge-host-agent/src/server.ts' $state @{'x-judge-host-agent-token'=$script:Secrets.hostAgentToken} }
function Start-JudgeService($state) { $env=@{JUDGE_SERVICE_HOST='127.0.0.1';JUDGE_SERVICE_PORT=[string]$Config.JudgeServicePort;JUDGE_DATABASE_URL=(Get-JudgeDatabaseUrl);JUDGE_REDIS_URL=$Config.RedisUrl;JUDGE_REDIS_PREFIX=$Config.JudgeRedisPrefix;JUDGE_SERVICE_TOKEN=$script:Secrets.judgeServiceToken;JUDGE_NODE_TOKEN=$script:Secrets.judgeNodeToken;JUDGE_HOST_AGENT_URL=$Config.HostOrigin;JUDGE_HOST_AGENT_TOKEN=$script:Secrets.hostAgentToken;JUDGE_AUTOSCALER_INTERVAL_MS='5000'}; Start-Managed 'judge-service' 'node' @('--import','tsx','apps/judge-service/src/server.ts') $env $Config.JudgeServicePort "$($Config.JudgeOrigin)/health" 'apps/judge-service/src/server.ts' $state }
function Ensure-Worker($state) { $started=Get-Date; $headers=@{'x-judge-service-token'=$script:Secrets.judgeServiceToken}; $nodes=Get-HttpJson "$($Config.JudgeOrigin)/v1/admin/nodes" $headers; if(-not $nodes){throw 'Judge Service node registry is unavailable.'}; $compatible=@($nodes.body.items|Where-Object{$_.desiredState -eq 'ONLINE' -and @('ONLINE','BUSY') -contains $_.observedState -and $_.capabilities.languageProfiles -contains 'cpp20-gcc-13-v1' -and $_.capabilities.executionModes -contains 'REAL_SANDBOXED_EXECUTION' -and $_.heartbeatAgeMs -lt 15000}); if($compatible.Count -gt 0){Write-Host "worker REUSE ($($compatible[0].nodeId))";$state.timings.worker=[int]((Get-Date)-$started).TotalMilliseconds;return}; $candidate=@($nodes.body.items|Where-Object{$_.capabilities.languageProfiles -contains 'cpp20-gcc-13-v1' -and $_.capabilities.executionModes -contains 'REAL_SANDBOXED_EXECUTION' -and $_.desiredState -ne 'ONLINE'}|Sort-Object heartbeatAgeMs|Select-Object -First 1); if($candidate){ try { $body=@{templateId='cpp20-gcc-13-v1'}|ConvertTo-Json; Invoke-WebRequest -Uri "$($Config.JudgeOrigin)/v1/admin/nodes/$([uri]::EscapeDataString($candidate.nodeId))/start" -Method Post -Headers $headers -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 15|Out-Null; Write-Host "worker START ($($candidate.nodeId))"; $nodes=Get-HttpJson "$($Config.JudgeOrigin)/v1/admin/nodes" $headers } catch { Write-Warning "Worker recovery start was rejected: $($_.Exception.Message)" } }; $compatible=@($nodes.body.items|Where-Object{$_.desiredState -eq 'ONLINE' -and @('ONLINE','BUSY') -contains $_.observedState -and $_.capabilities.languageProfiles -contains 'cpp20-gcc-13-v1' -and $_.capabilities.executionModes -contains 'REAL_SANDBOXED_EXECUTION' -and $_.heartbeatAgeMs -lt 15000}); if($compatible.Count -gt 0){Write-Host "worker REUSE ($($compatible[0].nodeId))";$state.timings.worker=[int]((Get-Date)-$started).TotalMilliseconds;return}; $body=@{templateId='cpp20-gcc-13-v1';count=1}|ConvertTo-Json; Invoke-WebRequest -Uri "$($Config.JudgeOrigin)/v1/admin/nodes" -Method Post -Headers $headers -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 10|Out-Null; $deadline=(Get-Date).AddSeconds(60); do{Start-Sleep -Milliseconds 500;$nodes=Get-HttpJson "$($Config.JudgeOrigin)/v1/admin/nodes" $headers;$compatible=@($nodes.body.items|Where-Object{$_.desiredState -eq 'ONLINE' -and @('ONLINE','BUSY') -contains $_.observedState -and $_.capabilities.languageProfiles -contains 'cpp20-gcc-13-v1' -and $_.capabilities.executionModes -contains 'REAL_SANDBOXED_EXECUTION' -and $_.heartbeatAgeMs -lt 15000});if($compatible.Count -gt 0){Write-Host "worker ONLINE ($($compatible[0].nodeId))";$state.timings.worker=[int]((Get-Date)-$started).TotalMilliseconds;Save-State $state;return}}while((Get-Date)-lt $deadline);throw 'No healthy REAL_SANDBOXED_EXECUTION worker became ONLINE within 60 seconds.' }
function Start-Api($state) { $env=@{PORT=[string]$Config.ApiPort;HOST='127.0.0.1';OJPLATFORM_INFRA='true';REAL_SUBMISSION_EXECUTION='true';OJPLATFORM_CORS_ORIGINS=$Config.WebOrigin;DATABASE_URL=$Config.ProductDatabaseUrl;REDIS_URL=$Config.RedisUrl;S3_ENDPOINT=$Config.MinioEndpoint;S3_REGION='us-east-1';S3_ACCESS_KEY='ojplatform';S3_SECRET_KEY='ojplatform_dev_secret';S3_BUCKET='ojplatform-dev';JUDGE_SERVICE_URL=$Config.JudgeOrigin;JUDGE_SERVICE_TOKEN=$script:Secrets.judgeServiceToken;OJPLATFORM_SANDBOX_SUPERVISOR_URL=$Config.SupervisorOrigin};Start-Managed 'api' 'node' @('--import','tsx','apps/api/src/server.ts') $env $Config.ApiPort "$($Config.ApiOrigin)/health" 'apps/api/src/server.ts' $state }
function Start-Web($state) { Start-Managed 'web' 'pnpm.cmd' @('--filter','@ojplatform/web','dev','--host','127.0.0.1','--port',[string]$Config.WebPort) @{OJPLATFORM_API_PORT=[string]$Config.ApiPort;OJPLATFORM_ONLINE_CODE_EDITOR_ROOT=$PluginIdentity.root;OJPLATFORM_PLUGIN_COMMIT=$PluginIdentity.commit} $Config.WebPort "$($Config.WebOrigin)/" '@ojplatform/web' $state }
function Stop-WorkerThroughControlPlane($state) { if(-not(Get-HttpJson "$($Config.JudgeOrigin)/health")){return};$headers=@{'x-judge-service-token'=$script:Secrets.judgeServiceToken};$nodes=Get-HttpJson "$($Config.JudgeOrigin)/v1/admin/nodes" $headers;foreach($node in @($nodes.body.items|Where-Object{$_.capabilities.languageProfiles -contains 'cpp20-gcc-13-v1' -and $_.desiredState -ne 'OFFLINE'})){try{Invoke-WebRequest -Uri "$($Config.JudgeOrigin)/v1/admin/nodes/$([uri]::EscapeDataString($node.nodeId))/stop" -Method Post -Headers $headers -ContentType 'application/json' -Body '{}' -UseBasicParsing -TimeoutSec 10|Out-Null}catch{Write-Warning "Worker $($node.nodeId) drain/stop was rejected: $($_.Exception.Message)"}} }
function Reconcile-RequestedRuntime($state) {
  $previous = if ($state.requestedSource) { [string]$state.requestedSource.commit } else { '' }
  if ($previous -and $previous -ne $ProductIdentity.commit) {
    $active = Get-ActiveJudgeJobs
    if ($active -gt 0) { throw "RUNNING_VERSION_MISMATCH_ACTIVE_JOBS: current=$previous requested=$($ProductIdentity.commit) activeJobs=$active owner=$($state.ownerCheckout)" }
    Stop-WorkerThroughControlPlane $state
  }
}
function Stop-Infrastructure($state) { if($state.infrastructure.managed -and $state.infrastructure.compose){$activePorts=@($Config.WebPort,$Config.ApiPort,$Config.JudgeServicePort,$Config.HostAgentPort,$Config.SupervisorPort|Where-Object{Test-TcpPort $_});if($activePorts.Count -gt 0){throw "Infrastructure STOP REFUSED: application ports still listening: $($activePorts -join ', ')."};Invoke-Compose @('stop') 60000|Out-Null;$keepalive=$state.processes['wsl-keepalive'];if($keepalive -and (Test-OwnedProcess $keepalive)){try{Stop-Process -Id ([int]$keepalive.pid) -Force -ErrorAction SilentlyContinue}catch{}};$state.processes.Remove('wsl-keepalive');$state.infrastructure.managed=$false;Save-State $state;Write-Host 'Infrastructure STOP'} }
function Assert-ApplicationPortsReleased { $activePorts=@($Config.WebPort,$Config.ApiPort,$Config.JudgeServicePort,$Config.HostAgentPort,$Config.SupervisorPort|Where-Object{Test-TcpPort $_});if($activePorts.Count -gt 0){throw "APPLICATION_PORT_REMAINS_OCCUPIED: $($activePorts -join ', ')."} }
function Test-HttpOk([string]$Url) { try { return ([int](Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3).StatusCode) -eq 200 } catch { return $false } }
function Test-DatabaseConnection([string]$Url) { if (-not $Url) { return $false }; try { $probe = "import pg from 'pg'; const c=new pg.Client({connectionString:process.env.RUNTIME_DATABASE_URL,connectionTimeoutMillis:3000}); await c.connect(); await c.query('select 1'); await c.end();"; Invoke-ProcessCommand 'node' @('--input-type=module','-e',$probe) @{ RUNTIME_DATABASE_URL = $Url } 10000 | Out-Null; return $true } catch { return $false } }
function Test-SupervisorUnit { try { return (Invoke-Wsl @('-d',$Config.WslDistro,'--user','oj-sandbox','--','env','XDG_RUNTIME_DIR=/run/user/1000','DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus','systemctl','--user','is-active',$Config.SupervisorSystemdUnit) 10000).Trim() -eq 'active' } catch { return $false } }
function Get-ApplicationStatus([string]$Name, $state) {
  $record = $state.processes[$Name]
  $port = switch ($Name) { 'api' {$Config.ApiPort}; 'web' {$Config.WebPort}; 'judge-service' {$Config.JudgeServicePort}; 'host-agent' {$Config.HostAgentPort}; 'supervisor' {$Config.SupervisorPort} }
  $health = switch ($Name) {
    'web' { Test-HttpOk $Config.WebOrigin }
    'host-agent' { [bool](Get-HttpJson "$($Config.HostOrigin)/health" @{ 'x-judge-host-agent-token' = $script:Secrets.hostAgentToken }) }
    'supervisor' { (Get-HttpJson "$($Config.SupervisorOrigin)/v1/health") -and (Test-SupervisorUnit) }
    default { [bool](Get-HttpJson "http://127.0.0.1:$port/health") }
  }
  $listener = Get-PortOwner $port | Select-Object -First 1
  $source = switch ($Name) { 'web' {'HTTP 200 + Windows listener'}; 'api' {'HTTP /health + Windows listener'}; 'judge-service' {'HTTP /health + Windows listener'}; 'host-agent' {'authenticated HTTP /health + Windows listener'}; 'supervisor' {'Supervisor HTTP health + WSL systemd user unit'} }
  $owner = if ($record -and $record.ownerCheckout) { [string]$record.ownerCheckout } elseif ($record -and $record.cwd) { [string]$record.cwd } else { '' }
  $status = 'DOWN'
  $ownership = if ($Name -ne 'supervisor') { Resolve-OJPlatformProcessOwnership $Name $port $state } else { $null }
  if ($Name -eq 'supervisor' -and $health -and $record) { $status = if ($owner -and $owner -ne $ProjectRoot) { 'RUNNING_OJPLATFORM_OTHER_CHECKOUT' } else { 'RUNNING_OWNED' } }
  elseif ($listener -and $ownership.classification -eq 'PROVEN_OWNED') {
    $sharedMatch=$record -and [int]$record.pid -eq [int]$listener.OwningProcess -and [int]$record.port -eq $port -and $record.processStartTime -and (Get-ProcessStartTime ([int]$listener.OwningProcess)) -eq [string]$record.processStartTime
    $owner=$ownership.ownerCheckout
    if ($sharedMatch) { $status=if(-not $health){'STALE'}elseif($owner -and $owner -ne $ProjectRoot){'RUNNING_OJPLATFORM_OTHER_CHECKOUT'}else{'RUNNING_OWNED'} }
    else { $status='RUNNING_LEGACY_OJPLATFORM' }
  } elseif ($listener) { $status = 'BLOCKED_BY_EXTERNAL_OWNER' }
  elseif ($record) { $status = 'STALE' }
  elseif ($health) { $status = 'UNKNOWN' }
  return [pscustomobject]@{ service=$Name; status=$status; ownerCheckout=$owner; pid=if($listener){$listener.OwningProcess}elseif($record){$record.pid}else{'-'}; port=$port; source=$source; ownership=if($ownership){$ownership.classification}else{'PROVEN_OWNED'} }
}
function Get-WorkerStatus {
  $headers = @{ 'x-judge-service-token' = $script:Secrets.judgeServiceToken }
  $nodes = Get-HttpJson "$($Config.JudgeOrigin)/v1/admin/nodes" $headers
  if (-not $nodes) { return [pscustomobject]@{ service='worker'; status='DOWN'; ownerCheckout=''; pid='-'; port='-'; source='Judge Service node registry + heartbeat'; binaryPath=$Config.WorkerBinary; binaryHash=(Get-FileSha256 $Config.WorkerBinary); commit=$ProductIdentity.commit; canonical=$false } }
  $node = @($nodes.body.items | Where-Object { $_.capabilities.languageProfiles -contains 'cpp20-gcc-13-v1' } | Sort-Object heartbeatAgeMs | Select-Object -First 1)[0]
  if (-not $node) { return [pscustomobject]@{ service='worker'; status='DOWN'; ownerCheckout=''; pid='-'; port='-'; source='Judge Service node registry + heartbeat'; binaryPath=$Config.WorkerBinary; binaryHash=(Get-FileSha256 $Config.WorkerBinary); commit=$ProductIdentity.commit; canonical=$false } }
  $online = $node.desiredState -eq 'ONLINE' -and @('ONLINE','BUSY') -contains $node.observedState -and $node.heartbeatAgeMs -lt 15000 -and $node.capabilities.executionModes -contains 'REAL_SANDBOXED_EXECUTION'
  return [pscustomobject]@{ service='worker'; status=if($online){'RUNNING_OWNED'}else{'STALE'}; ownerCheckout='Judge Service -> Host Agent'; pid=$node.nodeId; port='-'; source='Judge Service node registry + heartbeat'; binaryPath=$Config.WorkerBinary; binaryHash=(Get-FileSha256 $Config.WorkerBinary); commit=$ProductIdentity.commit; canonical=($online -and (Get-FileSha256 $Config.WorkerBinary)) }
}
function Show-Status($state) {
  $productCanonical = $ProductIdentity.root -ieq $CanonicalProductIdentity.root -and $ProductIdentity.commit -ieq $CanonicalProductIdentity.commit
  $pluginCanonical = $PluginIdentity.root -ieq $CanonicalPluginIdentity.root -and $PluginIdentity.commit -ieq $CanonicalPluginIdentity.commit
  Write-Host 'RUNTIME SOURCE'
  Write-Host "PRODUCT ROOT = $($ProductIdentity.root)"
  Write-Host "PRODUCT BRANCH = $($ProductIdentity.branch)"
  Write-Host "PRODUCT COMMIT = $($ProductIdentity.commit)"
  Write-Host "PRODUCT CANONICAL = $productCanonical"
  Write-Host "PLUGIN ROOT = $($PluginIdentity.root)"
  Write-Host "PLUGIN BRANCH = $($PluginIdentity.branch)"
  Write-Host "PLUGIN COMMIT = $($PluginIdentity.commit)"
  Write-Host "PLUGIN CANONICAL = $pluginCanonical"
  Write-Host "EXPLICIT DEVELOPMENT SOURCE = $([bool]($SourceRoot -or $UseCurrentCheckout -or $PluginSourceRoot))"
  $infra = @((Get-InfrastructureStatus 'postgres' '5432/tcp' 55432),(Get-InfrastructureStatus 'redis' '6379/tcp' 56379),(Get-InfrastructureStatus 'minio' '9000/tcp' 59000) | ForEach-Object { [pscustomobject]@{ service=$_.service; status=if($_.code -eq 'READY'){'RUNNING_OWNED'}else{$_.code}; port=$_.hostPort; source='Docker Compose project, container health, mapping, network, host reachability' } })
  Write-Host "Shared runtime: $RuntimeRoot  instance=$($state.runtimeInstanceId) owner=$($state.ownerCheckout)"; $infra | Format-Table -AutoSize
  $items = @('api','web','judge-service','host-agent','supervisor' | ForEach-Object { $item=Get-ApplicationStatus $_ $state; $record=$state.processes[$_]; $item | Add-Member -NotePropertyName sourceRoot -NotePropertyValue $(if($record){$record.sourceRoot}else{'-'}) -Force; $item | Add-Member -NotePropertyName commit -NotePropertyValue $(if($record){$record.gitCommit}else{'-'}) -Force; $item | Add-Member -NotePropertyName canonical -NotePropertyValue $(if($record){(Test-VersionCompatible $record)}else{$false}) -Force; $item }); $items += Get-WorkerStatus; $items | Format-Table -AutoSize
  $mixed = -not ($productCanonical -and $pluginCanonical -and @($items | Where-Object { $_.canonical -eq $false }).Count -eq 0)
  Write-Host "MIXED SOURCE = $mixed"
  Write-Host "WORKER BINARY = $Config.WorkerBinary"
  Write-Host "WORKER BINARY HASH = $(Get-FileSha256 $Config.WorkerBinary)"
  Write-Host "Web: $($Config.WebOrigin)  API: $($Config.ApiOrigin)  Judge Admin: $($Config.JudgeOrigin)/v1/admin"
}
function Show-Logs { Ensure-RuntimeFolders; Write-Host "Logs: $LogRoot"; foreach($file in (Get-ChildItem $LogRoot -Filter '*.log' -ErrorAction SilentlyContinue)){Write-Host "`n===== $($file.Name) =====";Get-Content $file.FullName -Tail 60} }
function Invoke-Doctor {
  $checks=[Collections.Generic.List[object]]::new()
  function Add-Check($name,$ok,$detail){$checks.Add([pscustomobject]@{check=$name;result=if($ok){'PASS'}else{'BLOCKED'};detail=$detail})}
  Add-Check 'project' (Test-Path (Join-Path $ProjectRoot 'package.json')) $ProjectRoot
  foreach($tool in @('node','pnpm.cmd','wsl.exe','go')){$found=Get-Command $tool -ErrorAction SilentlyContinue; $detail=if($found){$found.Source}else{'not found'}; Add-Check $tool ($null -ne $found) $detail}
  try{$list=Invoke-Wsl @('-l','-q') 10000;Add-Check 'wsl-distro' ($list -match [regex]::Escape($Config.WslDistro)) $Config.WslDistro}catch{Add-Check 'wsl-distro' $false $_.Exception.Message}
  try{$uid=Invoke-Wsl @('-d',$Config.WslDistro,'--','id','-u','oj-sandbox') 10000;Add-Check 'oj-sandbox' ($uid.Trim() -and $uid.Trim() -ne '0') $uid.Trim()}catch{Add-Check 'oj-sandbox' $false $_.Exception.Message}
  try{$runc=Invoke-Wsl @('-d',$Config.WslDistro,'--','command','-v',$Config.SupervisorRuncBinary) 10000;Add-Check 'runc' ($runc.Trim()) $runc.Trim()}catch{Add-Check 'runc' $false 'runc unavailable'}
  try{$controllers=Invoke-Wsl @('-d',$Config.WslDistro,'--','bash','-lc','test -r /sys/fs/cgroup/cgroup.controllers && cat /sys/fs/cgroup/cgroup.controllers') 10000;Add-Check 'cgroup-v2' ($controllers.Trim()) $controllers.Trim()}catch{Add-Check 'cgroup-v2' $false 'cgroup v2 controllers unavailable'}
  Add-Check 'docker' ((Get-Command wsl.exe -ErrorAction SilentlyContinue) -and (Test-TcpPort 55432)) 'WSL Docker/Compose and infrastructure'
  Add-Check 'postgres-product-db' (Test-DatabaseConnection $Config.ProductDatabaseUrl) $Config.ProductDatabaseUrl; Add-Check 'postgres-judge-db' (Test-DatabaseConnection (Get-JudgeDatabaseUrl)) $Config.JudgeDatabaseName; Add-Check 'redis' (Test-TcpPort 56379) $Config.RedisUrl; Add-Check 'minio' (Test-HttpOk "$($Config.MinioEndpoint)/minio/health/ready") $Config.MinioEndpoint
  $workerIdentity=$null;$metadata=$null;if(Test-Path $Config.WorkerBuildMetadata){try{$metadata=Convert-ToHashtable (Get-Content -Raw $Config.WorkerBuildMetadata|ConvertFrom-Json)}catch{}};try{$workerIdentity=Get-SourceIdentity (Join-Path $ProjectRoot 'apps/judge-worker') @('*.go','go.mod')}catch{};Add-Check 'worker-binary' ((Test-Path $Config.WorkerBinary) -and $metadata -and $metadata.sourceIdentity -eq $workerIdentity) "$($Config.WorkerBinary) source=$workerIdentity"
  $rootfs=$Config.CompilerRootfsLinuxPath;$rootfsIdentity='';$rootfsVersion='';$manifestHash='';$identityError='';try{Resolve-CompilerRootfsIdentity|Out-Null;$rootfsIdentity=$Config.CompilerRootfsIdentity;$manifestHash=((Invoke-Wsl @('-d',$Config.WslDistro,'--','sha256sum',"$rootfs.content-manifest.txt") 10000).Trim() -split '\s+')[0].ToLowerInvariant();$rootfsVersion=(Invoke-Wsl @('-d',$Config.WslDistro,'--','cat',"$rootfs.compiler-version.txt") 10000).Trim()}catch{$identityError=$_.Exception.Message;try{$rootfsIdentity=(Invoke-Wsl @('-d',$Config.WslDistro,'--','cat',"$rootfs.identity") 10000).Trim()}catch{}};$identityDetail="$rootfsIdentity expected=$($Config.CompilerRootfsIdentity)";if($identityError){$identityDetail=$identityError};Add-Check 'supervisor-binary' (Test-WslFile $Config.SupervisorLinuxBinary -Executable) $Config.SupervisorLinuxBinary;Add-Check 'trusted-probe' (Test-WslFile $Config.SupervisorProbeLinuxPath -Executable) $Config.SupervisorProbeLinuxPath;Add-Check 'compiler-rootfs' (Test-WslFile $rootfs -Directory) $rootfs;Add-Check 'compiler-rootfs-identity' (-not $identityError -and $rootfsIdentity -eq $Config.CompilerRootfsIdentity -and $Config.CompilerRootfsIdentity) $identityDetail;Add-Check 'compiler-rootfs-manifest' (-not $identityError -and $manifestHash -eq $rootfsIdentity -and $manifestHash) "$manifestHash expected=$rootfsIdentity";Add-Check 'compiler-version' (($rootfsVersion -split "`r?`n")[0] -eq $Config.CompilerRootfsVersion -and $Config.CompilerRootfsVersion) "$rootfsVersion expected=$($Config.CompilerRootfsVersion)";Add-Check 'canonical-origin' ($Config.WebOrigin -eq "http://127.0.0.1:$($Config.WebPort)") $Config.WebOrigin
  $checks|Format-Table -AutoSize|Out-Host;$blocked=@($checks|Where-Object result -eq 'BLOCKED').Count;if($blocked -gt 0){Write-Host "DOCTOR BLOCKED ($blocked checks)";return 2};Write-Host 'DOCTOR READY';return 0
}

if ($env:OJPLATFORM_RUNTIME_TEST_MODE -eq '1') { return }
$state=Read-State
$script:Secrets=Get-Secrets
if ($Command -ne 'status' -and $Command -ne 'logs') { Write-Host "Runtime Manager: $Command" }
try { if($Command -eq 'status'){Show-Status $state;exit 0};if($Command -eq 'logs'){Show-Logs;exit 0};Acquire-RuntimeLock;if($Command -eq 'doctor'){$code=Invoke-Doctor;exit $code};if($Command -eq 'start' -or $Command -eq 'restart'){$script:Secrets=Get-Secrets -Create;Reconcile-RequestedRuntime $state;if($Command -eq 'restart'){Stop-WorkerThroughControlPlane $state;foreach($name in @('web','api','host-agent','judge-service','supervisor')){Stop-Managed $name $state};Assert-ApplicationPortsReleased;if($All){Stop-Infrastructure $state}};$total=Get-Date;Ensure-Infrastructure $state;Ensure-JudgeDatabase;Invoke-Migrations $state;Ensure-SupervisorBinaries;Ensure-WorkerBinary;Start-Supervisor $state;Start-JudgeService $state;Start-Api $state;Wait-Http "$($Config.JudgeOrigin)/ready" 60|Out-Null;Start-HostAgent $state;Wait-Http "$($Config.HostOrigin)/health" 60 -Headers @{'x-judge-host-agent-token'=$script:Secrets.hostAgentToken}|Out-Null;Wait-Http "$($Config.ApiOrigin)/ready" 60|Out-Null;Ensure-Worker $state;Start-Web $state;Wait-HttpStatus $Config.WebOrigin 60;$state.timings.total=[int]((Get-Date)-$total).TotalMilliseconds;Save-State $state;Write-Host "OJPlatform $Command PASS: $($Config.WebOrigin)";if($Config.AutoOpenBrowser){Start-Process $Config.WebOrigin};if($Verify){Invoke-Doctor|Out-Null}}elseif($Command -eq 'stop'){$script:Secrets=Get-Secrets;Stop-WorkerThroughControlPlane $state;foreach($name in @('web','api','host-agent','judge-service','supervisor')){Stop-Managed $name $state};Assert-ApplicationPortsReleased;if($All){Stop-Infrastructure $state};Write-Host 'OJPlatform STOP PASS'}} finally {Release-RuntimeLock}
