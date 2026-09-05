param([string]$OutputPath = (Join-Path $PSScriptRoot '../.runtime/artifact-100m.zip'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
$resolved = [IO.Path]::GetFullPath($OutputPath)
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($resolved)) | Out-Null
$file = [IO.File]::Open($resolved, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
$archive = [IO.Compression.ZipArchive]::new($file, [IO.Compression.ZipArchiveMode]::Create, $false)
try {
  $entry = $archive.CreateEntry('01.in', [IO.Compression.CompressionLevel]::NoCompression)
  $entry.LastWriteTime = [DateTimeOffset]::new(2026, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
  $input = $entry.Open()
  try {
    $chunk = [Text.Encoding]::ASCII.GetBytes(('0123456789abcdef' * 65536))
    for ($index = 0; $index -lt 100; $index++) { $input.Write($chunk, 0, $chunk.Length) }
  } finally { $input.Dispose() }
  $entry = $archive.CreateEntry('01.out', [IO.Compression.CompressionLevel]::NoCompression)
  $entry.LastWriteTime = [DateTimeOffset]::new(2026, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
  $output = $entry.Open()
  try {
    $bytes = [Text.Encoding]::ASCII.GetBytes("104857600`n")
    $output.Write($bytes, 0, $bytes.Length)
  } finally { $output.Dispose() }
} finally { $archive.Dispose(); $file.Dispose() }
$hashStream = [IO.File]::OpenRead($resolved)
$hasher = [Security.Cryptography.SHA256]::Create()
try { $digest = [BitConverter]::ToString($hasher.ComputeHash($hashStream)).Replace('-', '').ToLowerInvariant() }
finally { $hashStream.Dispose(); $hasher.Dispose() }
[pscustomobject]@{
  path = $resolved
  compressedBytes = (Get-Item -LiteralPath $resolved).Length
  expandedInputBytes = 104857600
  expandedOutputBytes = 10
  testcaseCount = 1
  sha256 = $digest
} | ConvertTo-Json
