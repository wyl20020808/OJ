#Requires -Version 5.1
[CmdletBinding()]
param(
  [string]$Destination = (Join-Path $HOME 'OJPlatform'),
  [switch]$NoReboot
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$repositoryUrl = 'https://github.com/wyl20020808/OJ.git'

function Resolve-Git {
  $command = Get-Command git.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw 'Git and winget are unavailable. Install Git for Windows from https://git-scm.com/download/win, then rerun this script. No third-party package manager or untrusted binary will be used.'
  }

  Write-Host 'Git is missing. Installing Git.Git through the official Windows Package Manager source...'
  & $winget.Source install --id Git.Git --exact --scope user --accept-package-agreements --accept-source-agreements --disable-interactivity
  if ($LASTEXITCODE -ne 0) { throw "winget could not install Git.Git (exit $LASTEXITCODE)." }

  foreach ($candidate in @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe'),
    (Join-Path $env:ProgramFiles 'Git\cmd\git.exe')
  )) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  $command = Get-Command git.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  throw 'Git installation completed but git.exe was not found. Open a new PowerShell window and rerun this script.'
}

$git = Resolve-Git
if (Test-Path -LiteralPath $Destination) {
  if (-not (Test-Path -LiteralPath (Join-Path $Destination '.git'))) {
    throw "Destination exists but is not a Git checkout: $Destination"
  }
  $origin = (& $git -C $Destination remote get-url origin).Trim()
  if ($LASTEXITCODE -ne 0 -or $origin -ne $repositoryUrl) {
    throw "Existing checkout origin is not the official OJPlatform repository: $Destination"
  }
  Write-Host "Reusing existing OJPlatform checkout: $Destination"
  & $git -C $Destination submodule update --init --recursive
} else {
  Write-Host "Cloning OJPlatform into $Destination..."
  & $git clone --recurse-submodules $repositoryUrl $Destination
}
if ($LASTEXITCODE -ne 0) { throw 'OJPlatform repository acquisition failed.' }

$installer = Join-Path $Destination 'deploy\install-windows.ps1'
if (-not (Test-Path -LiteralPath $installer)) { throw "Windows installer is missing: $installer" }
$arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $installer)
if ($NoReboot) { $arguments += '-NoReboot' }
& powershell.exe @arguments
exit $LASTEXITCODE
