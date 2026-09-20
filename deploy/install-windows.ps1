#Requires -Version 5.1
[CmdletBinding()]
param(
  [ValidatePattern('^[A-Za-z0-9._-]+$')]
  [string]$DistroName = 'Ubuntu-24.04',
  [ValidatePattern('^[a-z_][a-z0-9_-]*$')]
  [string]$LinuxUser = 'ojplatform',
  [ValidatePattern('^/[A-Za-z0-9._/-]+$')]
  [string]$LinuxRepoPath = '/home/ojplatform/OJ',
  [switch]$Resume,
  [switch]$NoReboot,
  [switch]$StartupOnly
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version 2.0

$script:RepositoryUrl = 'https://github.com/wyl20020808/OJ.git'
$script:StateRoot = Join-Path $env:ProgramData 'OJPlatform'
$script:StateFile = Join-Path $script:StateRoot 'windows-bootstrap-state.json'
$script:LogFile = Join-Path $script:StateRoot 'install-windows.log'
$script:ResumeTaskName = 'OJPlatform-Phase7C-Resume'
$script:StartupTaskName = 'OJPlatform-WSL-Startup'
$script:MaxResumeAttempts = 3
$script:WebUrl = 'http://localhost:8080/'
$script:ApiUrl = 'http://localhost:8080/ready'
$script:ScriptPath = $PSCommandPath

function Write-Step([int]$Number, [string]$Message) {
  Write-Host "[$Number/8] $Message" -ForegroundColor Cyan
}

function Write-Log([string]$Message) {
  if (-not (Test-Path $script:StateRoot)) {
    New-Item -ItemType Directory -Force -Path $script:StateRoot | Out-Null
  }
  "$(Get-Date -Format o) $Message" | Add-Content -LiteralPath $script:LogFile -Encoding UTF8
}

function Test-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function ConvertTo-QuotedArgument([string]$Value) {
  return '"' + ($Value -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"'
}

function Get-RelaunchArguments {
  $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $script:ScriptPath)
  foreach ($name in @('DistroName', 'LinuxUser', 'LinuxRepoPath')) {
    $arguments += "-$name"
    $arguments += [string](Get-Variable -Name $name -ValueOnly)
  }
  if ($Resume) { $arguments += '-Resume' }
  if ($NoReboot) { $arguments += '-NoReboot' }
  if ($StartupOnly) { $arguments += '-StartupOnly' }
  return (($arguments | ForEach-Object { ConvertTo-QuotedArgument $_ }) -join ' ')
}

function Invoke-SelfElevation {
  if (Test-Administrator) { return }
  Write-Host 'Administrator access is required. Requesting one Windows UAC confirmation...' -ForegroundColor Yellow
  $process = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList (Get-RelaunchArguments) -WorkingDirectory (Split-Path -Parent $script:ScriptPath) -PassThru -Wait
  exit $process.ExitCode
}

function Invoke-Native([string]$FilePath, [string[]]$Arguments, [switch]$AllowFailure) {
  Write-Log "$FilePath $($Arguments -join ' ')"
  $previousErrorPreference = $ErrorActionPreference
  try {
    # PowerShell 5 wraps native stderr as ErrorRecord. With the script-wide Stop
    # preference, normal progress written to stderr (Git/Docker) would abort the
    # pipeline before the native exit code can be read.
    $ErrorActionPreference = 'Continue'
    & $FilePath @Arguments 2>&1 | ForEach-Object { Write-Log ([string]$_) }
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorPreference
  }
  if ($exitCode -ne 0 -and -not $AllowFailure) {
    throw "Command failed with exit code ${exitCode}: $FilePath $($Arguments -join ' ')"
  }
  return $exitCode
}

function Invoke-Wsl([string]$User, [string]$Command, [switch]$Capture, [switch]$AllowFailure) {
  # Passing a multiline shell program directly through wsl.exe lets the Windows
  # native argument parser reinterpret quotes and command substitutions. Encode
  # the program so only a fixed, non-secret wrapper crosses that boundary.
  $encodedCommand = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Command))
  $wrapper = "printf '%s' '$encodedCommand' | base64 -d | /bin/bash"
  $arguments = @('-d', $DistroName, '-u', $User, '--exec', '/bin/bash', '-lc', $wrapper)
  Write-Log "wsl.exe -d $DistroName -u $User --exec /bin/bash -lc <base64-encoded-command>"
  if ($Capture) {
    $previousErrorPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      $output = & wsl.exe @arguments 2>&1
      $exitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $previousErrorPreference
    }
    if ($exitCode -ne 0 -and -not $AllowFailure) {
      $safeOutput = (($output | Select-Object -Last 8) -join [Environment]::NewLine)
      throw "WSL command failed with exit code ${exitCode}. See $script:LogFile`n$safeOutput"
    }
    return (((($output -join "`n") -replace "`0", '')).Trim())
  }

  $previousErrorPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & wsl.exe @arguments 2>&1 | ForEach-Object {
      $line = ([string]$_) -replace "`0", ''
      Write-Host $line
      Write-Log $line
    }
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorPreference
  }
  if ($exitCode -ne 0 -and -not $AllowFailure) {
    throw "WSL command failed with exit code ${exitCode}. See $script:LogFile"
  }
  return $exitCode
}

function Get-WslNames {
  if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) { return @() }
  $raw = (& wsl.exe --list --quiet 2>$null) -join "`n"
  return @(($raw -replace "`0", '') -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

function Test-DistroInstalled {
  return @((Get-WslNames) | Where-Object { $_ -eq $DistroName }).Count -gt 0
}

function Get-DistroVersion {
  $raw = ((& wsl.exe --list --verbose 2>$null) -join "`n") -replace "`0", ''
  foreach ($line in ($raw -split "`r?`n")) {
    if ($line -match ('^\s*\*?\s*' + [regex]::Escape($DistroName) + '\s+\S+\s+(\d+)\s*$')) {
      return [int]$Matches[1]
    }
  }
  return 0
}

function Test-PendingReboot {
  $paths = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending',
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired'
  )
  if (@($paths | Where-Object { Test-Path $_ }).Count -gt 0) { return $true }
  try {
    $value = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager' -Name PendingFileRenameOperations -ErrorAction Stop).PendingFileRenameOperations
    return $null -ne $value
  } catch { return $false }
}

function Get-BootstrapState {
  if (-not (Test-Path $script:StateFile)) { return $null }
  return Get-Content -LiteralPath $script:StateFile -Raw | ConvertFrom-Json
}

function Save-BootstrapState([string]$Stage, [int]$Attempts) {
  if (-not (Test-Path $script:StateRoot)) {
    New-Item -ItemType Directory -Force -Path $script:StateRoot | Out-Null
  }
  [ordered]@{
    version = 1
    stage = $Stage
    attempts = $Attempts
    repositoryPath = (Split-Path -Parent (Split-Path -Parent $script:ScriptPath))
    installerPath = $script:ScriptPath
    distro = $DistroName
    linuxUser = $LinuxUser
    linuxRepoPath = $LinuxRepoPath
    updatedAt = (Get-Date).ToUniversalTime().ToString('o')
  } | ConvertTo-Json | Set-Content -LiteralPath $script:StateFile -Encoding UTF8
}

function Register-ResumeTask {
  $arguments = "-NoProfile -ExecutionPolicy Bypass -File $(ConvertTo-QuotedArgument $script:ScriptPath) -DistroName $(ConvertTo-QuotedArgument $DistroName) -LinuxUser $(ConvertTo-QuotedArgument $LinuxUser) -LinuxRepoPath $(ConvertTo-QuotedArgument $LinuxRepoPath) -Resume"
  if ($NoReboot) { $arguments += ' -NoReboot' }
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
  $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 6) -StartWhenAvailable
  Register-ScheduledTask -TaskName $script:ResumeTaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
}

function Remove-ResumeArtifacts {
  Unregister-ScheduledTask -TaskName $script:ResumeTaskName -Confirm:$false -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $script:StateFile -Force -ErrorAction SilentlyContinue
}

function Request-RebootResume {
  $state = Get-BootstrapState
  $attempts = if ($state) { [int]$state.attempts } else { 0 }
  Save-BootstrapState -Stage 'windows-reboot-required' -Attempts $attempts
  Register-ResumeTask
  if ($NoReboot) {
    Write-Host 'Windows restart required. Restart Windows, then the installer will resume at sign-in.' -ForegroundColor Yellow
    exit 10
  }
  Write-Host 'Windows restart required. Automatic restart begins in 30 seconds; run shutdown /a to postpone.' -ForegroundColor Yellow
  & shutdown.exe /r /t 30 /c 'OJPlatform WSL2 setup will resume automatically after sign-in.' | Out-Null
  exit 10
}

function Assert-WindowsPreflight {
  $os = Get-CimInstance Win32_OperatingSystem
  $computer = Get-CimInstance Win32_ComputerSystem
  $processor = Get-CimInstance Win32_Processor | Select-Object -First 1
  $architecture = $env:PROCESSOR_ARCHITECTURE
  if (Test-DistroInstalled) {
    $storageLabel = "$DistroName root filesystem"
    $availableBytes = [double](Invoke-Wsl 'root' "df -B1 --output=avail / | tail -n 1 | tr -d ' '" -Capture)
  } else {
    $storageLabel = $env:SystemDrive
    $storageDrive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($env:SystemDrive)'"
    if (-not $storageDrive) { throw "Cannot inspect the default WSL storage drive: $($env:SystemDrive)" }
    $availableBytes = [double]$storageDrive.FreeSpace
  }
  $memoryGiB = [math]::Floor([double]$computer.TotalPhysicalMemory / 1GB)
  $diskGiB = [math]::Floor($availableBytes / 1GB)

  Write-Host "  Windows: $($os.Caption), build $($os.BuildNumber)"
  Write-Host "  Architecture: $architecture; memory: ${memoryGiB} GiB; $storageLabel free: ${diskGiB} GiB"
  if ($architecture -ne 'AMD64') { throw 'Unsupported architecture. Phase 7C supports Windows 11 x86_64 only; Windows ARM64 is NOT QUALIFIED.' }
  if ([int]$os.BuildNumber -lt 22000) { throw 'Unsupported Windows build. Phase 7C supports Windows 11 x86_64 (build 22000 or newer).' }
  if ($memoryGiB -lt 4) { throw "At least 4 GiB RAM is required; found ${memoryGiB} GiB." }
  if ($diskGiB -lt 25) { throw "At least 25 GiB free on $storageLabel is required; found ${diskGiB} GiB." }
  $virtualizationReady = [bool]$computer.HypervisorPresent -or [bool]$processor.VirtualizationFirmwareEnabled -or (Test-DistroInstalled)
  if (-not $virtualizationReady) { throw 'Hardware virtualization is unavailable. Enable virtualization in firmware before installing WSL2.' }
  Write-Host "  Pending reboot: $(Test-PendingReboot)"
}

function Ensure-WslAndDistro {
  $wslCommand = Get-Command wsl.exe -ErrorAction SilentlyContinue
  if (-not $wslCommand) { throw 'wsl.exe is unavailable on this Windows build.' }

  if (-not (Test-DistroInstalled)) {
    Invoke-Native 'wsl.exe' @('--update') -AllowFailure | Out-Null
    Invoke-Native 'wsl.exe' @('--set-default-version', '2') | Out-Null
    $online = (((& wsl.exe --list --online 2>$null) -join "`n") -replace "`0", '')
    if ($online -notmatch ('(?m)^\s*' + [regex]::Escape($DistroName) + '\s')) {
      throw "Microsoft WSL does not currently advertise '$DistroName'. Run 'wsl --list --online' and use a supported Ubuntu 24.04 distro name."
    }
    Register-ResumeTask
    Save-BootstrapState -Stage 'installing-wsl' -Attempts 0
    Write-Host "  Installing $DistroName from Microsoft's supported WSL source..."
    Invoke-Native 'wsl.exe' @('--install', $DistroName, '--version', '2', '--no-launch') -AllowFailure | Out-Null
    if (-not (Test-DistroInstalled)) { Request-RebootResume }
    $launchProbe = Invoke-Wsl 'root' 'true' -AllowFailure
    if ($launchProbe -ne 0) { Request-RebootResume }
  }

  if ((Get-DistroVersion) -ne 2) {
    Invoke-Native 'wsl.exe' @('--set-version', $DistroName, '2') | Out-Null
  }
  if ((Get-DistroVersion) -ne 2) { throw "$DistroName is not running as WSL2." }
}

function Ensure-LinuxInitialization {
  $prerequisitesReady = Invoke-Wsl 'root' "command -v git >/dev/null && command -v curl >/dev/null && test -s /etc/ssl/certs/ca-certificates.crt && echo ready || echo missing" -Capture
  if ($prerequisitesReady -match '(?m)^ready$') {
    Write-Host '  Git, curl, and CA certificates are already installed; skipping package download.'
  } else {
    Write-Host '  Updating Ubuntu package metadata (network progress follows; timeout: 10 minutes)...'
    Invoke-Wsl 'root' "export DEBIAN_FRONTEND=noninteractive; timeout --foreground 600 apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 update" | Out-Null
    Write-Host '  Installing Git and TLS prerequisites (timeout: 10 minutes)...'
    Invoke-Wsl 'root' "export DEBIAN_FRONTEND=noninteractive; timeout --foreground 600 apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 install -y git ca-certificates curl" | Out-Null
  }
  $linuxParent = $LinuxRepoPath.Substring(0, $LinuxRepoPath.LastIndexOf('/'))
  Invoke-Wsl 'root' "id -u '$LinuxUser' >/dev/null 2>&1 || useradd --create-home --shell /bin/bash '$LinuxUser'; install -d -o '$LinuxUser' -g '$LinuxUser' '$linuxParent'" | Out-Null

  $systemdState = Invoke-Wsl 'root' "test -f /etc/wsl.conf && grep -Eq '^[[:space:]]*systemd[[:space:]]*=[[:space:]]*true[[:space:]]*$' /etc/wsl.conf && echo enabled || echo missing" -Capture
  if ($systemdState -notmatch '(?m)^enabled$') {
    Invoke-Wsl 'root' "if grep -Eq '^[[:space:]]*systemd[[:space:]]*=' /etc/wsl.conf 2>/dev/null; then sed -i -E 's/^[[:space:]]*systemd[[:space:]]*=.*/systemd=true/' /etc/wsl.conf; elif grep -q '^\[boot\]' /etc/wsl.conf 2>/dev/null; then sed -i '/^\[boot\]/a systemd=true' /etc/wsl.conf; else printf '\n[boot]\nsystemd=true\n' >> /etc/wsl.conf; fi" | Out-Null
    Invoke-Native 'wsl.exe' @('--shutdown') | Out-Null
  }

  $pidOne = Invoke-Wsl 'root' 'ps -p 1 -o comm=' -Capture
  if ($pidOne -notmatch '(?m)^systemd$') { throw "WSL systemd initialization failed; PID 1 is '$pidOne'." }
  $systemState = Invoke-Wsl 'root' 'systemctl is-system-running --wait 2>/dev/null || systemctl is-system-running 2>/dev/null || true' -Capture
  Write-Host "  Ubuntu systemd: $systemState"
}

function Ensure-LinuxCheckout {
  $parent = $LinuxRepoPath.Substring(0, $LinuxRepoPath.LastIndexOf('/'))
  $command = @'
set -e
install -d -o '__USER__' -g '__USER__' '__PARENT__'
if [ ! -d '__REPO__/.git' ]; then
  test ! -e '__REPO__' || { echo 'Checkout path exists but is not a Git repository; refusing to overwrite it.' >&2; exit 1; }
  for attempt in 1 2 3; do
    echo "Git clone attempt $attempt/3..."
    if runuser -u '__USER__' -- env GIT_TERMINAL_PROMPT=0 git clone --progress --recurse-submodules '__URL__' '__REPO__'; then break; fi
    test ! -e '__REPO__' || { echo 'A failed clone left an unexpected checkout path; refusing to remove it.' >&2; exit 1; }
    [ "$attempt" -lt 3 ] || exit 1
    sleep $((attempt * 3))
  done
else
  test "$(runuser -u '__USER__' -- git -C '__REPO__' remote get-url origin)" = '__URL__'
  runuser -u '__USER__' -- git -C '__REPO__' submodule update --init --recursive
fi
test -f '__REPO__/deploy/install.sh'
expected=$(runuser -u '__USER__' -- git -C '__REPO__' ls-tree HEAD plugins/OnlineCodeEditor | awk '{print $3}')
actual=$(runuser -u '__USER__' -- git -C '__REPO__/plugins/OnlineCodeEditor' rev-parse HEAD)
test "$expected" = "$actual"
git config --global --get-all safe.directory | grep -Fxq '__REPO__' || git config --global --add safe.directory '__REPO__'
git config --global --get-all safe.directory | grep -Fxq '__REPO__/plugins/OnlineCodeEditor' || git config --global --add safe.directory '__REPO__/plugins/OnlineCodeEditor'
'@
  $command = $command.Replace('__USER__', $LinuxUser).Replace('__PARENT__', $parent).Replace('__REPO__', $LinuxRepoPath).Replace('__URL__', $script:RepositoryUrl)
  Invoke-Wsl 'root' $command | Out-Null
}

function Register-StartupTask {
  $startupScript = Join-Path $script:StateRoot 'Start-OJPlatformWSL.ps1'
  @"
`$ErrorActionPreference = 'SilentlyContinue'
& wsl.exe -d '$DistroName' -u root --exec /bin/true | Out-Null
for (`$attempt = 0; `$attempt -lt 60; `$attempt++) {
  try { if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri '$script:WebUrl').StatusCode -eq 200) { exit 0 } } catch {}
  Start-Sleep -Seconds 2
}
exit 1
"@ | Set-Content -LiteralPath $startupScript -Encoding UTF8
  $arguments = "-NoProfile -ExecutionPolicy Bypass -File $(ConvertTo-QuotedArgument $startupScript)"
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
  $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -StartWhenAvailable -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $script:StartupTaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
}

function Wait-WindowsEndpoint([string]$Url, [int]$TimeoutSeconds = 180) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri $Url
      if ([int]$response.StatusCode -eq 200) { return }
    } catch {}
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)
  throw "Windows localhost health check timed out: $Url"
}

try {
  Invoke-SelfElevation

  if ($StartupOnly) {
    & wsl.exe -d $DistroName -u root --exec /bin/true | Out-Null
    exit $LASTEXITCODE
  }

  if ($Resume) {
    $state = Get-BootstrapState
    if (-not $state) { throw 'Resume state is missing; rerun install-windows.ps1 normally.' }
    $attempts = [int]$state.attempts + 1
    if ($attempts -gt $script:MaxResumeAttempts) {
      Remove-ResumeArtifacts
      throw "Resume attempt limit ($script:MaxResumeAttempts) exceeded. Automatic resume was disabled; inspect $script:LogFile."
    }
    Save-BootstrapState -Stage 'resuming' -Attempts $attempts
  }

  Write-Step 1 'Checking Windows'
  Assert-WindowsPreflight

  Write-Step 2 'Preparing WSL2'
  Ensure-WslAndDistro

  Write-Step 3 'Installing Ubuntu 24.04'
  Write-Host "  Distro: $DistroName (WSL$(Get-DistroVersion))"

  Write-Step 4 'Preparing Linux environment'
  Ensure-LinuxInitialization

  Write-Step 5 'Acquiring OJPlatform'
  Ensure-LinuxCheckout

  Write-Step 6 'Running production installer'
  Invoke-Wsl 'root' "cd '$LinuxRepoPath' && ./deploy/install.sh --non-interactive" | Out-Null

  Write-Step 7 'Verifying Judge and services'
  $doctorCommand = "cd '$LinuxRepoPath'; for attempt in 1 2 3; do ./deploy/doctor.sh && exit 0; [ `"`$attempt`" -eq 3 ] && exit 1; echo 'Linux doctor is not ready yet; retrying in 5 seconds...'; sleep 5; done"
  $doctor = Invoke-Wsl 'root' $doctorCommand -Capture
  if ($doctor -notmatch 'DEPLOY_DOCTOR=PASS') { throw 'Linux deployment doctor did not pass.' }
  Wait-WindowsEndpoint $script:WebUrl
  Wait-WindowsEndpoint $script:ApiUrl

  Write-Step 8 'Finalizing'
  Register-StartupTask
  Remove-ResumeArtifacts

  Write-Host ''
  Write-Host 'OJPlatform installation completed.' -ForegroundColor Green
  Write-Host ''
  Write-Host 'Platform: Windows 11 + WSL2 Ubuntu 24.04'
  Write-Host "Web: $script:WebUrl"
  Write-Host 'API: healthy'
  Write-Host 'Judge: healthy'
  Write-Host 'OnlineCodeEditor: healthy'
  Write-Host 'Linux deployment: PASS'
  Write-Host 'Windows bootstrap: PASS'
  Write-Host ''
  Write-Host "Detailed log: $script:LogFile"
} catch {
  Write-Log "FAILED: $($_.Exception.Message)"
  Write-Error "$($_.Exception.Message)`nDetailed log: $script:LogFile"
  exit 1
}
