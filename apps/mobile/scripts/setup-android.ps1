$ErrorActionPreference = 'Stop'

$mobileDirectory = Resolve-Path (Join-Path $PSScriptRoot '..')
$toolsDirectory = Join-Path $mobileDirectory '.expo'
$jdkDirectory = Join-Path $toolsDirectory 'jdk17'
$apiUrl = 'https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse'

$existingJdk = Get-ChildItem -LiteralPath $jdkDirectory -Directory -ErrorAction SilentlyContinue |
  Where-Object Name -Like 'jdk-17*' |
  Select-Object -First 1
if ($existingJdk) {
  Write-Host "Temurin 17 is already available: $($existingJdk.FullName)"
  exit 0
}

New-Item -ItemType Directory -Path $toolsDirectory -Force | Out-Null
$asset = (Invoke-RestMethod -Uri $apiUrl -TimeoutSec 60)[0].binary.package
$archivePath = Join-Path $toolsDirectory $asset.name

Write-Host "Downloading $($asset.name)..."
Invoke-WebRequest -UseBasicParsing -Uri $asset.link -OutFile $archivePath -TimeoutSec 300

$actualChecksum = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
if ($actualChecksum -ne $asset.checksum.ToLowerInvariant()) {
  throw "Temurin archive checksum mismatch: $actualChecksum"
}

New-Item -ItemType Directory -Path $jdkDirectory -Force | Out-Null
Expand-Archive -LiteralPath $archivePath -DestinationPath $jdkDirectory -Force
$installedJdk = Get-ChildItem -LiteralPath $jdkDirectory -Directory |
  Where-Object Name -Like 'jdk-17*' |
  Select-Object -First 1
if (-not $installedJdk) {
  throw 'Temurin 17 extraction completed without a JDK directory'
}

Write-Host "Temurin 17 ready: $($installedJdk.FullName)"
