[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('start', 'stop', 'restart', 'status', 'logs', 'doctor')]
  [string]$Command = 'status',
  [switch]$All,
  [switch]$Verify
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot
# Explorer-launched BAT files may not inherit the npm user-bin directory.
# Add it only to this manager process so detached Web processes can resolve pnpm.
$UserNpmBin = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'npm'
$UserPnpm = Join-Path $UserNpmBin 'pnpm.cmd'
if ((Test-Path -LiteralPath $UserPnpm) -and (($env:Path -split ';') -notcontains $UserNpmBin)) {
  $env:Path = "$UserNpmBin;$env:Path"
}
$RuntimeRoot = Join-Path $ProjectRoot '.runtime'
$StateFile = Join-Path $RuntimeRoot 'state.json'
$LockFile = Join-Path $RuntimeRoot 'runtime.lock'
$LogRoot = Join-Path $RuntimeRoot 'logs'

$Config = @{
  WebPort = 5173; ApiPort = 3010; JudgeServicePort = 3100; HostAgentPort = 3180; SupervisorPort = 19092
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

function Ensure-RuntimeFolders { New-Item -ItemType Directory -Force -Path $RuntimeRoot, $LogRoot, (Join-Path $RuntimeRoot 'bin') | Out-Null }
function Convert-ToHashtable($value) { if ($null -eq $value) { return $null }; if ($value -is [System.Collections.IDictionary]) { $result=@{}; foreach($key in $value.Keys){$result[$key]=Convert-ToHashtable $value[$key]}; return $result }; if ($value -is [System.Collections.IEnumerable] -and -not ($value -is [string])) { return @($value | ForEach-Object { Convert-ToHashtable $_ }) }; if ($value -is [psobject]) { $result=@{}; foreach($property in $value.PSObject.Properties){$result[$property.Name]=Convert-ToHashtable $property.Value}; return $result }; return $value }
function Read-State { if (-not (Test-Path $StateFile)) { return @{ version = 1; processes = @{}; infrastructure = @{ managed = $false }; timings = @{} } }; try { return Convert-ToHashtable (Get-Content -Raw $StateFile | ConvertFrom-Json) } catch { throw 'Runtime state is unreadable; inspect .runtime/state.json before continuing.' } }
function Save-State($state) { Ensure-RuntimeFolders; $state | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $StateFile }
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
function Test-OwnedProcess($record) {
  if (-not $record -or -not $record.pid) { return $false }
  $p = Get-ProcessInfo ([int]$record.pid)
  if ($null -eq $p -or -not $p.CommandLine) { return $false }
  if ($p.CommandLine -match [regex]::Escape([string]$record.signature)) { return $true }
  # pnpm.cmd is represented by cmd.exe and the command line may omit the
  # workspace path. The recorded PID, canonical port and pnpm invocation are
  # still required together before treating it as owned.
  return $record.port -and $p.CommandLine -match 'pnpm' -and $p.CommandLine -match [regex]::Escape([string]$record.port)
}
function New-Token { return ([Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')) }
function Get-Secrets([switch]$Create) { $file = Join-Path $RuntimeRoot 'secrets.json'; if (Test-Path $file) { return Convert-ToHashtable (Get-Content -Raw $file | ConvertFrom-Json) }; if (-not $Create) { return $null }; Ensure-RuntimeFolders; $secrets = @{ judgeServiceToken = New-Token; judgeNodeToken = New-Token; hostAgentToken = New-Token; judgeDatabasePassword = New-Token }; $secrets | ConvertTo-Json | Set-Content -Encoding UTF8 $file; return $secrets }
function Start-Managed([string]$Name, [string]$FilePath, [string[]]$Arguments, [hashtable]$Environment, [int]$Port, [string]$HealthUrl, [string]$Signature, $state, [hashtable]$HealthHeaders = @{}) {
  $old = $state.processes[$Name]; $healthy = if ($HealthUrl.EndsWith('/')) { Test-HttpOk $HealthUrl } else { [bool](Get-HttpJson $HealthUrl $HealthHeaders) }
  if ($old -and $healthy) {
    if (Test-OwnedProcess $old) { Write-Host "$Name REUSE (healthy)"; return }
    $adopted = Find-ProcessBySignature $Signature $Port
    if ($adopted) {
      $state.processes[$Name] = New-ProcessRecord $adopted $Name $Port $HealthUrl $Signature 'OJPlatform-Local-Runtime-Manager-V1-adopted'
      Save-State $state; Write-Host "$Name REUSE (adopted healthy process)"; return
    }
    throw "$Name is healthy but Runtime Manager cannot prove process ownership; refusing to start a duplicate."
  }
  if (-not $old -and $healthy) {
    $adopted = Find-ProcessBySignature $Signature $Port
    if ($adopted) {
      $state.processes[$Name] = New-ProcessRecord $adopted $Name $Port $HealthUrl $Signature 'OJPlatform-Local-Runtime-Manager-V1-adopted'
      Save-State $state; Write-Host "$Name REUSE (adopted healthy process)"; return
    }
  }
  if ($old -and (Test-OwnedProcess $old)) { Stop-Managed $Name $state }
  if ((Test-TcpPort $Port) -and -not $healthy) { throw "$Name port $Port is occupied by an unknown process." }
  $out = Join-Path $LogRoot "$Name.log"; $err = Join-Path $LogRoot "$Name.error.log"; $result = Start-ProcessDetached $FilePath $Arguments $Environment $out $err; $state.processes[$Name] = @{ pid = [int]$result.pid; port = $Port; health = $HealthUrl; startedAt = (Get-Date).ToUniversalTime().ToString('o'); command = "$FilePath $($Arguments -join ' ')"; cwd = $ProjectRoot; signature = $Signature; log = $out; errorLog = $err; sourceAuthority = 'OJPlatform-Local-Runtime-Manager-V1' }; Save-State $state; Write-Host "$Name START (pid $($result.pid))"
}
function New-ProcessRecord($process, [string]$Name, [int]$Port, [string]$HealthUrl, [string]$Signature, [string]$Authority) { return @{ pid=[int]$process.ProcessId; port=$Port; health=$HealthUrl; startedAt=(Get-Date).ToUniversalTime().ToString('o'); command=$process.CommandLine; cwd=$ProjectRoot; signature=$Signature; log=(Join-Path $LogRoot "$Name.log"); errorLog=(Join-Path $LogRoot "$Name.error.log"); sourceAuthority=$Authority } }
function Find-ProcessBySignature([string]$Signature, [int]$Port) {
  $escaped = [regex]::Escape($Signature)
  $candidates = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'wsl.exe' -and $_.CommandLine -and $_.CommandLine -match $escaped -and $_.CommandLine -match "127\.0\.0\.1:$Port" })
  if ($candidates.Count -gt 0) { return $candidates[0] }
  return $null
}
function Stop-Managed([string]$Name, $state) {
  $record = $state.processes[$Name]
  if ($record -and (Test-OwnedProcess $record)) { try { Stop-Process -Id ([int]$record.pid) -Force -ErrorAction Stop } catch { Write-Warning "$Name process could not be stopped: $($_.Exception.Message)" } }
  if ($Name -eq 'supervisor') {
    try { Invoke-Wsl @('-d',$Config.WslDistro,'--user','oj-sandbox','--','env','XDG_RUNTIME_DIR=/run/user/1000','DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus','systemctl','--user','stop',$Config.SupervisorSystemdUnit) 10000 | Out-Null } catch {}
    foreach ($process in @(Find-ProcessBySignature $Config.SupervisorLinuxBinary $Config.SupervisorPort)) {
      if ([int]$process.ProcessId -le 4) { continue }
      try { Stop-Process -Id ([int]$process.ProcessId) -Force -ErrorAction Stop } catch { Write-Warning "supervisor WSL process could not be stopped: $($_.Exception.Message)" }
    }
  }
  if ($record) { $state.processes.Remove($Name); Save-State $state }
  Write-Host "$Name STOP"
}
function Invoke-Wsl([string[]]$Arguments, [int]$TimeoutMs = 30000) { return ((Invoke-ProcessCommand 'wsl.exe' $Arguments @{} $TimeoutMs) -replace "`0", '') }
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
function Ensure-WorkerBinary {
  $sourceRoot = Join-Path $ProjectRoot 'apps/judge-worker'
  $identity = Get-SourceIdentity $sourceRoot @('*.go','go.mod')
  $metadata = $null
  if (Test-Path $Config.WorkerBuildMetadata) { try { $metadata = Convert-ToHashtable (Get-Content -Raw $Config.WorkerBuildMetadata | ConvertFrom-Json) } catch {} }
  if ((Test-Path $Config.WorkerBinary) -and $metadata -and $metadata.sourceIdentity -eq $identity) { Write-Host "worker binary REUSE ($($Config.WorkerBinary))"; return }
  Ensure-RuntimeFolders
  Write-Host "worker binary BUILD (source $identity)"
  $workerDir = Join-Path $ProjectRoot 'apps/judge-worker'
  Invoke-ProcessCommand 'go' @('build','-trimpath','-o',$Config.WorkerBinary,'./cmd/judge-worker') @{} 120000 $workerDir | Out-Null
  if (-not (Test-Path $Config.WorkerBinary)) { throw "Worker build did not produce $($Config.WorkerBinary)." }
  @{ schema = 1; sourceIdentity = $identity; builtAt = (Get-Date).ToUniversalTime().ToString('o'); command = 'go build -trimpath -o .runtime/bin/judge-worker.exe ./cmd/judge-worker'; sourceRoot = $workerDir } | ConvertTo-Json | Set-Content -Encoding UTF8 $Config.WorkerBuildMetadata
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
function Ensure-Infrastructure($state) { $started = Get-Date; if ((Test-TcpPort 55432) -and (Test-TcpPort 56379) -and (Test-TcpPort 59000)) { Write-Host 'Infrastructure REUSE (reachable)'; $state.timings.infra = 0; return }; $compose = '/mnt/' + ($ProjectRoot.Substring(0,1).ToLower()) + $ProjectRoot.Substring(2).Replace('\','/') + '/deploy/docker/compose.yml'; Invoke-Wsl @('-d',$Config.WslDistro,'--','docker','compose','-f',$compose,'up','-d') 120000 | Out-Null; $deadline = (Get-Date).AddSeconds(90); do { if ((Test-TcpPort 55432) -and (Test-TcpPort 56379) -and (Test-TcpPort 59000)) { $state.infrastructure = @{ managed = $true; compose = $compose; startedAt = (Get-Date).ToUniversalTime().ToString('o') }; $state.timings.infra = [int]((Get-Date)-$started).TotalMilliseconds; Save-State $state; Write-Host "Infrastructure START ($($state.timings.infra) ms)"; return }; Start-Sleep -Milliseconds 500 } while ((Get-Date) -lt $deadline); throw 'Infrastructure did not become reachable within 90 seconds.' }
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
  $state.processes['supervisor'] = @{ pid = 0; port = $Config.SupervisorPort; health = "$($Config.SupervisorOrigin)/v1/health"; startedAt = (Get-Date).ToUniversalTime().ToString('o'); command = $linux; cwd = $ProjectRoot; signature = $Config.SupervisorLinuxBinary; log = (Join-Path $LogRoot 'supervisor.log'); errorLog = (Join-Path $LogRoot 'supervisor.error.log'); sourceAuthority = 'OJPlatform-Local-Runtime-Manager-V1-systemd-user' }
  Save-State $state
  Wait-Http "$($Config.SupervisorOrigin)/v1/health" 60 | Out-Null
  $state.timings.supervisor=[int]((Get-Date)-$started).TotalMilliseconds; Save-State $state
}
function Start-HostAgent($state) { $template=@{templateId='cpp20-gcc-13-v1';displayName='Local C++20 GCC 13 (trusted)';executable=$Config.WorkerBinary;args=@();env=@{REDIS_URL=$Config.RedisUrl;QUEUE_PREFIX=$Config.JudgeRedisPrefix;REAL_SUBMISSION_EXECUTION='true';JUDGE_SERVICE_URL=$Config.JudgeOrigin;JUDGE_NODE_TOKEN=$script:Secrets.judgeNodeToken;OJPLATFORM_SANDBOX_SUPERVISOR_URL=$Config.SupervisorOrigin;MAX_CONCURRENCY=[string]$Config.WorkerMaxConcurrency;HEALTH_ADDR="127.0.0.1:$($Config.WorkerHealthPort)"};maxConcurrentJobs=[int]$Config.WorkerMaxConcurrency;cpuUnits=[double]$Config.HostCpuUnits;memoryMb=[double]$Config.HostMemoryMb;enabled=$true}; $env=@{JUDGE_HOST_AGENT_TOKEN=$script:Secrets.hostAgentToken;JUDGE_HOST_AGENT_PORT=[string]$Config.HostAgentPort;JUDGE_HOST_AGENT_STATE_PATH=(Join-Path $RuntimeRoot 'host-agent-state.json');JUDGE_HOST_AGENT_TEMPLATES_JSON=('[' + ($template|ConvertTo-Json -Compress) + ']');JUDGE_HOST_CPU_UNITS=[string]$Config.HostCpuUnits;JUDGE_HOST_MEMORY_MB=[string]$Config.HostMemoryMb}; Start-Managed 'host-agent' 'node' @('--import','tsx','apps/judge-host-agent/src/server.ts') $env $Config.HostAgentPort "$($Config.HostOrigin)/health" 'apps/judge-host-agent/src/server.ts' $state @{'x-judge-host-agent-token'=$script:Secrets.hostAgentToken} }
function Start-JudgeService($state) { $env=@{JUDGE_SERVICE_HOST='127.0.0.1';JUDGE_SERVICE_PORT=[string]$Config.JudgeServicePort;JUDGE_DATABASE_URL=(Get-JudgeDatabaseUrl);JUDGE_REDIS_URL=$Config.RedisUrl;JUDGE_REDIS_PREFIX=$Config.JudgeRedisPrefix;JUDGE_SERVICE_TOKEN=$script:Secrets.judgeServiceToken;JUDGE_NODE_TOKEN=$script:Secrets.judgeNodeToken;JUDGE_HOST_AGENT_URL=$Config.HostOrigin;JUDGE_HOST_AGENT_TOKEN=$script:Secrets.hostAgentToken;JUDGE_AUTOSCALER_INTERVAL_MS='5000'}; Start-Managed 'judge-service' 'node' @('--import','tsx','apps/judge-service/src/server.ts') $env $Config.JudgeServicePort "$($Config.JudgeOrigin)/health" 'apps/judge-service/src/server.ts' $state }
function Ensure-Worker($state) { $started=Get-Date; $headers=@{'x-judge-service-token'=$script:Secrets.judgeServiceToken}; $nodes=Get-HttpJson "$($Config.JudgeOrigin)/v1/admin/nodes" $headers; if(-not $nodes){throw 'Judge Service node registry is unavailable.'}; $compatible=@($nodes.body.items|Where-Object{$_.desiredState -eq 'ONLINE' -and @('ONLINE','BUSY') -contains $_.observedState -and $_.capabilities.languageProfiles -contains 'cpp20-gcc-13-v1' -and $_.capabilities.executionModes -contains 'REAL_SANDBOXED_EXECUTION' -and $_.heartbeatAgeMs -lt 15000}); if($compatible.Count -gt 0){Write-Host "worker REUSE ($($compatible[0].nodeId))";$state.timings.worker=[int]((Get-Date)-$started).TotalMilliseconds;return}; $candidate=@($nodes.body.items|Where-Object{$_.capabilities.languageProfiles -contains 'cpp20-gcc-13-v1' -and $_.capabilities.executionModes -contains 'REAL_SANDBOXED_EXECUTION' -and $_.desiredState -ne 'ONLINE'}|Sort-Object heartbeatAgeMs|Select-Object -First 1); if($candidate){ try { $body=@{templateId='cpp20-gcc-13-v1'}|ConvertTo-Json; Invoke-WebRequest -Uri "$($Config.JudgeOrigin)/v1/admin/nodes/$([uri]::EscapeDataString($candidate.nodeId))/start" -Method Post -Headers $headers -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 15|Out-Null; Write-Host "worker START ($($candidate.nodeId))"; $nodes=Get-HttpJson "$($Config.JudgeOrigin)/v1/admin/nodes" $headers } catch { Write-Warning "Worker recovery start was rejected: $($_.Exception.Message)" } }; $compatible=@($nodes.body.items|Where-Object{$_.desiredState -eq 'ONLINE' -and @('ONLINE','BUSY') -contains $_.observedState -and $_.capabilities.languageProfiles -contains 'cpp20-gcc-13-v1' -and $_.capabilities.executionModes -contains 'REAL_SANDBOXED_EXECUTION' -and $_.heartbeatAgeMs -lt 15000}); if($compatible.Count -gt 0){Write-Host "worker REUSE ($($compatible[0].nodeId))";$state.timings.worker=[int]((Get-Date)-$started).TotalMilliseconds;return}; $body=@{templateId='cpp20-gcc-13-v1';count=1}|ConvertTo-Json; Invoke-WebRequest -Uri "$($Config.JudgeOrigin)/v1/admin/nodes" -Method Post -Headers $headers -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 10|Out-Null; $deadline=(Get-Date).AddSeconds(60); do{Start-Sleep -Milliseconds 500;$nodes=Get-HttpJson "$($Config.JudgeOrigin)/v1/admin/nodes" $headers;$compatible=@($nodes.body.items|Where-Object{$_.desiredState -eq 'ONLINE' -and @('ONLINE','BUSY') -contains $_.observedState -and $_.capabilities.languageProfiles -contains 'cpp20-gcc-13-v1' -and $_.capabilities.executionModes -contains 'REAL_SANDBOXED_EXECUTION' -and $_.heartbeatAgeMs -lt 15000});if($compatible.Count -gt 0){Write-Host "worker ONLINE ($($compatible[0].nodeId))";$state.timings.worker=[int]((Get-Date)-$started).TotalMilliseconds;Save-State $state;return}}while((Get-Date)-lt $deadline);throw 'No healthy REAL_SANDBOXED_EXECUTION worker became ONLINE within 60 seconds.' }
function Start-Api($state) { $env=@{PORT=[string]$Config.ApiPort;HOST='127.0.0.1';OJPLATFORM_INFRA='true';REAL_SUBMISSION_EXECUTION='true';OJPLATFORM_CORS_ORIGINS=$Config.WebOrigin;DATABASE_URL=$Config.ProductDatabaseUrl;REDIS_URL=$Config.RedisUrl;S3_ENDPOINT=$Config.MinioEndpoint;S3_REGION='us-east-1';S3_ACCESS_KEY='ojplatform';S3_SECRET_KEY='ojplatform_dev_secret';S3_BUCKET='ojplatform-dev';JUDGE_SERVICE_URL=$Config.JudgeOrigin;JUDGE_SERVICE_TOKEN=$script:Secrets.judgeServiceToken;OJPLATFORM_SANDBOX_SUPERVISOR_URL=$Config.SupervisorOrigin};Start-Managed 'api' 'node' @('--import','tsx','apps/api/src/server.ts') $env $Config.ApiPort "$($Config.ApiOrigin)/health" 'apps/api/src/server.ts' $state }
function Start-Web($state) { Start-Managed 'web' 'pnpm.cmd' @('--filter','@ojplatform/web','dev','--host','127.0.0.1','--port',[string]$Config.WebPort) @{OJPLATFORM_API_PORT=[string]$Config.ApiPort} $Config.WebPort "$($Config.WebOrigin)/" '@ojplatform/web' $state }
function Stop-WorkerThroughControlPlane($state) { if(-not(Get-HttpJson "$($Config.JudgeOrigin)/health")){return};$headers=@{'x-judge-service-token'=$script:Secrets.judgeServiceToken};$nodes=Get-HttpJson "$($Config.JudgeOrigin)/v1/admin/nodes" $headers;foreach($node in @($nodes.body.items|Where-Object{$_.capabilities.languageProfiles -contains 'cpp20-gcc-13-v1' -and $_.desiredState -ne 'OFFLINE'})){try{Invoke-WebRequest -Uri "$($Config.JudgeOrigin)/v1/admin/nodes/$([uri]::EscapeDataString($node.nodeId))/stop" -Method Post -Headers $headers -ContentType 'application/json' -Body '{}' -UseBasicParsing -TimeoutSec 10|Out-Null}catch{Write-Warning "Worker $($node.nodeId) drain/stop was rejected: $($_.Exception.Message)"}} }
function Stop-Infrastructure($state) { if($state.infrastructure.managed -and $state.infrastructure.compose){Invoke-Wsl @('-d',$Config.WslDistro,'--','docker','compose','-f',$state.infrastructure.compose,'stop') 60000|Out-Null;$state.infrastructure.managed=$false;Save-State $state;Write-Host 'Infrastructure STOP'} }
function Test-HttpOk([string]$Url) { try { return ([int](Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3).StatusCode) -eq 200 } catch { return $false } }
function Test-DatabaseConnection([string]$Url) { if (-not $Url) { return $false }; try { $probe = "import pg from 'pg'; const c=new pg.Client({connectionString:process.env.RUNTIME_DATABASE_URL,connectionTimeoutMillis:3000}); await c.connect(); await c.query('select 1'); await c.end();"; Invoke-ProcessCommand 'node' @('--input-type=module','-e',$probe) @{ RUNTIME_DATABASE_URL = $Url } 10000 | Out-Null; return $true } catch { return $false } }
function Show-Status($state) {
  $judgeUrl = Get-JudgeDatabaseUrl
  $infra = @(
    [pscustomobject]@{ service = 'PostgreSQL'; health = if (Test-DatabaseConnection $Config.ProductDatabaseUrl) { 'READY' } elseif (Test-TcpPort 55432) { 'REACHABLE' } else { 'DOWN' }; port = 55432 },
    [pscustomobject]@{ service = 'Judge DB'; health = if (Test-DatabaseConnection $judgeUrl) { 'READY' } elseif (Test-TcpPort 55432) { 'REACHABLE' } else { 'DOWN' }; port = 55432 },
    [pscustomobject]@{ service = 'Redis'; health = if (Test-TcpPort 56379) { 'HEALTHY' } else { 'DOWN' }; port = 56379 },
    [pscustomobject]@{ service = 'MinIO'; health = if (Test-HttpOk "$($Config.MinioEndpoint)/minio/health/ready") { 'READY' } elseif (Test-TcpPort 59000) { 'REACHABLE' } else { 'DOWN' }; port = 59000 }
  ); $infra | Format-Table -AutoSize
  $items = @(); foreach ($name in @('api','web','supervisor','judge-service','host-agent')) { $r = $state.processes[$name]; $healthy = $false; if ($r) { if ($name -eq 'web') { $healthy = Test-HttpOk ([string]$r.health) } elseif ($name -eq 'host-agent') { $healthy = [bool](Get-HttpJson ([string]$r.health) @{ 'x-judge-host-agent-token' = $script:Secrets.hostAgentToken }) } else { $healthy = [bool](Get-HttpJson ([string]$r.health)) } }; $items += [pscustomobject]@{ service = $name; status = if ($healthy) { 'RUNNING' } else { 'DOWN' }; pid = if ($r) { $r.pid } else { '-' }; port = if ($r) { $r.port } else { '-' } } }; $items | Format-Table -AutoSize
  $headers = @{ 'x-judge-service-token' = $script:Secrets.judgeServiceToken }; $nodes = Get-HttpJson "$($Config.JudgeOrigin)/v1/admin/nodes" $headers
  if ($nodes) { $node = $nodes.body.items | Where-Object { $_.capabilities.languageProfiles -contains 'cpp20-gcc-13-v1' -and $_.desiredState -eq 'ONLINE' } | Sort-Object heartbeatAgeMs | Select-Object -First 1; if (-not $node) { $node = $nodes.body.items | Where-Object { $_.capabilities.languageProfiles -contains 'cpp20-gcc-13-v1' } | Select-Object -First 1 }; if ($node) { $heartbeat = if ($node.heartbeatAgeMs -lt 15000) { 'HEALTHY' } else { 'STALE' }; Write-Host "Judge Worker template=cpp20-gcc-13-v1 desiredState=$($node.desiredState) observedState=$($node.observedState) heartbeat=$heartbeat sandbox=REAL_SANDBOXED_EXECUTION activeJobs=$($node.activeJobs)" } else { Write-Host 'Judge Worker DOWN (no registered cpp20 worker)' } }
  Write-Host "Web: $($Config.WebOrigin)  API: $($Config.ApiOrigin)  Judge Admin: $($Config.JudgeOrigin)/v1/admin"; if ($state.timings) { Write-Host "Timings(ms): $($state.timings | ConvertTo-Json -Compress)" }
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

$script:Secrets=Get-Secrets
$state=Read-State
if ($Command -ne 'status' -and $Command -ne 'logs') { Write-Host "Runtime Manager: $Command" }
try { if($Command -eq 'status'){Show-Status $state;exit 0};if($Command -eq 'logs'){Show-Logs;exit 0};Acquire-RuntimeLock;if($Command -eq 'doctor'){$code=Invoke-Doctor;exit $code};if($Command -eq 'start' -or $Command -eq 'restart'){$script:Secrets=Get-Secrets -Create;if($Command -eq 'restart'){Stop-WorkerThroughControlPlane $state;foreach($name in @('web','api','host-agent','judge-service','supervisor')){Stop-Managed $name $state};if($All){Stop-Infrastructure $state}};$total=Get-Date;Ensure-Infrastructure $state;Ensure-JudgeDatabase;Invoke-Migrations $state;Ensure-SupervisorBinaries;Ensure-WorkerBinary;Start-Supervisor $state;Start-JudgeService $state;Start-Api $state;Wait-Http "$($Config.JudgeOrigin)/ready" 60|Out-Null;Start-HostAgent $state;Wait-Http "$($Config.HostOrigin)/health" 60 -Headers @{'x-judge-host-agent-token'=$script:Secrets.hostAgentToken}|Out-Null;Wait-Http "$($Config.ApiOrigin)/ready" 60|Out-Null;Ensure-Worker $state;Start-Web $state;Wait-HttpStatus $Config.WebOrigin 60;$state.timings.total=[int]((Get-Date)-$total).TotalMilliseconds;Save-State $state;Write-Host "OJPlatform $Command PASS: $($Config.WebOrigin)";if($Config.AutoOpenBrowser){Start-Process $Config.WebOrigin};if($Verify){Invoke-Doctor|Out-Null}}elseif($Command -eq 'stop'){$script:Secrets=Get-Secrets;Stop-WorkerThroughControlPlane $state;foreach($name in @('web','api','host-agent','judge-service','supervisor')){Stop-Managed $name $state};if($All){Stop-Infrastructure $state};Write-Host 'OJPlatform STOP PASS'}} finally {Release-RuntimeLock}
