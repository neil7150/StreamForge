param(
  [switch]$AssembleOnly,
  [switch]$Release,
  [switch]$StandaloneTest,
  [switch]$AuthorizeApkBuild
)

$ErrorActionPreference = 'Stop'
if (-not $AuthorizeApkBuild) {
  throw 'APK generation requires explicit user permission. Pass -AuthorizeApkBuild only after that permission is given.'
}
if ($Release -and $StandaloneTest) { throw 'Choose either delivery Release or StandaloneTest, not both.' }
if ($StandaloneTest -and -not $AssembleOnly) { throw 'StandaloneTest requires -AssembleOnly; this builds a local APK without installing it.' }
if ($Release) {
  foreach ($signingName in @('STREAMFORGE_KEYSTORE_PATH', 'STREAMFORGE_KEYSTORE_PASSWORD', 'STREAMFORGE_KEY_ALIAS', 'STREAMFORGE_KEY_PASSWORD')) {
    if (-not [Environment]::GetEnvironmentVariable($signingName)) { throw "Required release signing variable is missing: $signingName" }
  }
  if (-not (Test-Path -LiteralPath $env:STREAMFORGE_KEYSTORE_PATH -PathType Leaf)) { throw 'The release keystore does not exist.' }
  if ($env:STREAMFORGE_KEY_ALIAS -eq 'androiddebugkey' -or (Split-Path -Leaf $env:STREAMFORGE_KEYSTORE_PATH) -eq 'debug.keystore') {
    throw 'Release delivery requires a private release signing identity; Android debug keys are not allowed.'
  }
  $mobileConfig = Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\app.json') -Raw | ConvertFrom-Json
  if ($mobileConfig.expo.extra.runtimeMode -ne 'device-local') { throw 'Review release prerequisites before enabling a server-backed mobile mode.' }
}
$mobileDirectory = Resolve-Path (Join-Path $PSScriptRoot '..')
$localJdkRoot = Join-Path $mobileDirectory '.expo\jdk17'
$localJdk = Get-ChildItem -LiteralPath $localJdkRoot -Directory -ErrorAction SilentlyContinue |
  Where-Object Name -Like 'jdk-17*' |
  Select-Object -First 1
$installedJdk = Get-ChildItem -LiteralPath 'C:\Program Files\Eclipse Adoptium' -Directory -ErrorAction SilentlyContinue |
  Where-Object Name -Like 'jdk-17*' |
  Select-Object -First 1
$jdk = if ($localJdk) { $localJdk } else { $installedJdk }

if (-not $jdk) {
  throw 'Java 17 is required. Run: npm run setup:android --workspace=apps/mobile'
}

$env:JAVA_HOME = $jdk.FullName
$env:NODE_ENV = if ($Release -or $StandaloneTest) { 'production' } else { 'development' }
if (-not $env:ANDROID_HOME) {
  $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
}

$androidDirectory = Join-Path $mobileDirectory 'android'
$nativeBindingOptions = @{ StripSymbols = [bool]($Release -or $StandaloneTest) }
& (Join-Path $mobileDirectory '..\..\services\torrent-daemon\build-android-aar.ps1') @nativeBindingOptions
if ($LASTEXITCODE -ne 0) { throw 'Native torrent binding generation failed.' }

# Apply tracked config plugins to existing generated projects as well.
Push-Location $mobileDirectory
try {
  & npx expo prebuild --platform android --no-install
  if ($LASTEXITCODE -ne 0) {
    throw "Expo prebuild failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

# The local Gradle archive avoids a wrapper download that Java cannot complete
# on some Windows networks. Expo regenerates this ignored file during prebuild.
$wrapperProperties = Join-Path $androidDirectory 'gradle\wrapper\gradle-wrapper.properties'
$wrapper = Get-Content -LiteralPath $wrapperProperties -Raw
if ($wrapper -match 'distributionUrl=https\\?://[^\r\n]*/(gradle-[^/\r\n]+\.zip)') {
  $archivePath = Join-Path $mobileDirectory ".expo\$($Matches[1])"
  if (Test-Path -LiteralPath $archivePath) {
    $archiveUrl = ([System.Uri]$archivePath).AbsoluteUri -replace ':', '\:'
    $wrapper = [regex]::Replace($wrapper, '(?m)^distributionUrl=.*$', "distributionUrl=$archiveUrl")
    Set-Content -LiteralPath $wrapperProperties -Value $wrapper.TrimEnd("`r", "`n") -NoNewline
    Write-Host "Using cached Gradle archive: $archivePath"
  }
}

if ($AssembleOnly) {

  Push-Location $androidDirectory
  try {
    $assemblyTask = if ($StandaloneTest) { 'assembleStandaloneTest' } elseif ($Release) { 'assembleRelease' } else { 'assembleDebug' }
    & .\gradlew.bat $assemblyTask '-PreactNativeArchitectures=arm64-v8a'
    exit $LASTEXITCODE
  } finally {
    Pop-Location
  }
}

Push-Location $mobileDirectory
try {
  $variant = if ($Release) { 'release' } else { 'debug' }
  & npx expo run:android --variant $variant
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
