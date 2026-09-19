$ErrorActionPreference = 'Stop'

# v0.9.13 Rev C: keep the portable build runtime OUTSIDE the source tree.
# Teachers often extract the source under a long Downloads folder name. The
# official Node ZIP contains nested npm documentation paths, so extracting it
# beneath the project can exceed legacy Win32 path limits on PowerShell 5.1.
$version = 'v22.19.0'
$expectedSha256 = 'ea3fad0e67a991d8477d8c01344b56e69c676ccb733f065b22436994b1253f86'
$zipName = "node-$version-win-x64.zip"
$url = "https://nodejs.org/dist/$version/$zipName"

$cacheParent = $env:LOCALAPPDATA
if (-not $cacheParent) { $cacheParent = $env:TEMP }
if (-not $cacheParent) { throw 'Windows did not provide LOCALAPPDATA or TEMP for the portable build runtime.' }

$CacheBase = Join-Path $cacheParent 'CATI-Build'
$NodeDir = Join-Path $CacheBase ("node-$version")
$NodeExe = Join-Path $NodeDir 'node.exe'

function Remove-Safely([string]$Path) {
  if ($Path -and (Test-Path -LiteralPath $Path)) {
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
  }
}

if (Test-Path -LiteralPath $NodeExe) {
  $cachedVersion = $null
  try { $cachedVersion = ((& $NodeExe --version 2>$null) | Select-Object -First 1) } catch { $cachedVersion = $null }
  if ($cachedVersion) { $cachedVersion = $cachedVersion.Trim() }
  if ($cachedVersion -eq $version) {
    Write-Output $NodeExe
    exit 0
  }
  Write-Host "Cached portable Node is not the pinned $version; replacing it."
  Remove-Safely $NodeDir
}

New-Item -ItemType Directory -Force -Path $CacheBase | Out-Null

# Use a short, unique staging path under LOCALAPPDATA. Do not derive any
# extraction path from the project/source directory.
$nonce = "{0}-{1}" -f $PID, ([DateTime]::UtcNow.Ticks)
$stage = Join-Path $CacheBase ("stage-$nonce")
$download = Join-Path $stage $zipName
$extract = Join-Path $stage 'x'
$expandedDir = Join-Path $extract ("node-$version-win-x64")

try {
  New-Item -ItemType Directory -Force -Path $extract | Out-Null

  Write-Host "Using pinned Node.js $version for Windows x64..."
  Write-Host "Downloading Node.js $version..."
  Invoke-WebRequest -Uri $url -OutFile $download -UseBasicParsing

  $actualSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $download).Hash.ToLowerInvariant()
  if ($actualSha256 -ne $expectedSha256) {
    throw "Portable Node download failed SHA-256 verification. Expected $expectedSha256 but got $actualSha256."
  }

  # PowerShell 5.1 Expand-Archive has cleanup bugs on some school Windows
  # images. .NET extraction is reliable here because the destination is now
  # deliberately short and independent of the source folder depth.
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::ExtractToDirectory($download, $extract)

  $expandedNodeExe = Join-Path $expandedDir 'node.exe'
  if (-not (Test-Path -LiteralPath $expandedNodeExe)) {
    throw 'Portable Node extraction failed: node.exe was not found in the expected archive folder.'
  }

  Remove-Safely $NodeDir
  Move-Item -LiteralPath $expandedDir -Destination $NodeDir

  if (-not (Test-Path -LiteralPath $NodeExe)) {
    throw 'Portable Node node.exe was not found after installation.'
  }

  $installedVersion = ((& $NodeExe --version 2>$null) | Select-Object -First 1)
  if (-not $installedVersion -or $installedVersion.Trim() -ne $version) {
    throw "Portable Node verification failed after extraction. Expected $version."
  }

  Write-Output $NodeExe
}
finally {
  Remove-Safely $stage
}
