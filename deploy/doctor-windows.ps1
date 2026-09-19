#Requires -Version 5.1
[CmdletBinding()]
param(
  [ValidatePattern('^[A-Za-z0-9._-]+$')]
  [string]$DistroName = 'Ubuntu-24.04',
  [ValidatePattern('^/[A-Za-z0-9._/-]+$')]
  [string]$LinuxRepoPath = '/home/ojplatform/OJ'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version 2.0
$failures = 0

function Write-Section([string]$Name) { Write-Host "`n== $Name ==" }
function Write-Ok([string]$Message) { Write-Host "  OK    $Message" -ForegroundColor Green }
function Write-Fail([string]$Message) { Write-Host "  FAIL  $Message" -ForegroundColor Red; $script:failures++ }
function Write-Info([string]$Message) { Write-Host "  -     $Message" }

function Get-WslText([string[]]$Arguments) {
  $output = & wsl.exe @Arguments 2>&1
  return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Text = ((($output -join "`n") -replace "`0", '').Trim()) }
}

function Test-Endpoint([string]$Name, [string]$Url) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 8 -Uri $Url
    if ([int]$response.StatusCode -eq 200) { Write-Ok "$Name $Url -> 200" } else { Write-Fail "$Name $Url -> $($response.StatusCode)" }
  } catch { Write-Fail "$Name $Url is unavailable" }
}

Write-Section 'Windows host'
try {
  $os = Get-CimInstance Win32_OperatingSystem
  Write-Info "$($os.Caption), build $($os.BuildNumber), $env:PROCESSOR_ARCHITECTURE"
  if ($env:PROCESSOR_ARCHITECTURE -eq 'AMD64' -and [int]$os.BuildNumber -ge 22000) { Write-Ok 'supported Windows 11 x86_64 baseline' } else { Write-Fail 'unsupported Windows version or architecture' }
} catch { Write-Fail "cannot inspect Windows: $($_.Exception.Message)" }

Write-Section 'WSL2 and Ubuntu'
if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
  Write-Fail 'wsl.exe is not installed'
} else {
  $version = Get-WslText @('--version')
  if ($version.ExitCode -eq 0) { Write-Ok 'WSL is installed'; Write-Info (($version.Text -split "`n")[0]) } else { Write-Fail 'WSL version query failed' }
  $list = Get-WslText @('--list', '--verbose')
  $distroLine = @(($list.Text -split "`n") | Where-Object { $_ -match [regex]::Escape($DistroName) }) | Select-Object -First 1
  if ($distroLine -and $distroLine -match '\s2\s*$') { Write-Ok "$DistroName is installed as WSL2" } else { Write-Fail "$DistroName is missing or is not WSL2" }

  if ($distroLine) {
    $pidOne = Get-WslText @('-d', $DistroName, '-u', 'root', '--exec', '/bin/bash', '-lc', 'ps -p 1 -o comm=')
    if ($pidOne.ExitCode -eq 0 -and $pidOne.Text.Trim() -eq 'systemd') { Write-Ok 'systemd is PID 1' } else { Write-Fail 'systemd is not PID 1' }
    $disk = Get-WslText @('-d', $DistroName, '-u', 'root', '--exec', '/bin/bash', '-lc', "df -h /var/lib | tail -n 1 | tr -s ' '")
    if ($disk.ExitCode -eq 0) { Write-Info "WSL disk: $($disk.Text)" } else { Write-Fail 'cannot inspect WSL disk' }
  }
}

Write-Section 'Linux deployment'
if (Get-Command wsl.exe -ErrorAction SilentlyContinue) {
  $doctor = Get-WslText @('-d', $DistroName, '-u', 'root', '--exec', '/bin/bash', '-lc', "cd '$LinuxRepoPath' && ./deploy/doctor.sh")
  if ($doctor.ExitCode -eq 0 -and $doctor.Text -match 'DEPLOY_DOCTOR=PASS') {
    Write-Ok 'Linux deployment doctor passed'
  } else {
    Write-Fail 'Linux deployment doctor failed'
    @($doctor.Text -split "`n" | Select-Object -Last 12) | ForEach-Object { Write-Info $_ }
  }
}

Write-Section 'Windows localhost'
Test-Endpoint 'Web' 'http://localhost:8080/'
Test-Endpoint 'API' 'http://localhost:8080/ready'

Write-Section 'Automatic startup'
try {
  $task = Get-ScheduledTask -TaskName 'OJPlatform-WSL-Startup' -ErrorAction Stop
  if ($task.State -ne 'Disabled') { Write-Ok 'OJPlatform-WSL-Startup task is registered' } else { Write-Fail 'OJPlatform-WSL-Startup task is disabled' }
} catch { Write-Fail 'OJPlatform-WSL-Startup task is missing' }

Write-Host ''
if ($failures -eq 0) {
  Write-Host 'WINDOWS_DEPLOY_DOCTOR=PASS' -ForegroundColor Green
  exit 0
}
Write-Host "WINDOWS_DEPLOY_DOCTOR=FAIL ($failures finding(s))" -ForegroundColor Red
exit 1
