param(
  [switch]$AssembleOnly
)

$ErrorActionPreference = 'Stop'
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
$env:NODE_ENV = 'development'
if (-not $env:ANDROID_HOME) {
  $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
}

$androidDirectory = Join-Path $mobileDirectory 'android'
if (-not (Test-Path -LiteralPath $androidDirectory)) {
  Push-Location $mobileDirectory
  try {
    & npx expo prebuild --platform android --no-install
    if ($LASTEXITCODE -ne 0) {
      throw "Expo prebuild failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
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
    & .\gradlew.bat assembleDebug
    exit $LASTEXITCODE
  } finally {
    Pop-Location
  }
}

Push-Location $mobileDirectory
try {
  & npx expo run:android
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
