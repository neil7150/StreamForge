param([switch]$Offline, [switch]$StripSymbols)

$ErrorActionPreference = 'Stop'
$mobileDirectory = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$androidDirectory = Join-Path $mobileDirectory 'android'
if (-not (Test-Path -LiteralPath (Join-Path $androidDirectory 'gradlew.bat'))) {
  throw 'The generated Android project is missing. This check does not run prebuild or create an APK.'
}

$localJdk = Get-ChildItem -LiteralPath (Join-Path $mobileDirectory '.expo\jdk17') -Directory -ErrorAction SilentlyContinue |
  Where-Object Name -Like 'jdk-17*' | Select-Object -First 1
if ($localJdk) { $env:JAVA_HOME = $localJdk.FullName }
if (-not $env:JAVA_HOME -or -not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin\javac.exe'))) {
  throw 'A JDK is required for library compilation. Set JAVA_HOME or use the existing local JDK setup.'
}
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$env:NODE_ENV = 'development'

$nativeBindingOptions = @{ StripSymbols = [bool]$StripSymbols }
& (Join-Path $mobileDirectory '..\..\services\torrent-daemon\build-android-aar.ps1') @nativeBindingOptions
if ($LASTEXITCODE -ne 0) { throw 'Go library binding failed.' }

$tasks = @(':streamforge-torrent-daemon:compileDebugKotlin', ':streamforge-torrent-daemon:testDebugUnitTest')
$arguments = $tasks + @('-I', (Join-Path $PSScriptRoot 'native-check.init.gradle'), '--no-daemon', '--console=plain', '-PreactNativeArchitectures=arm64-v8a')
if ($Offline) { $arguments += '--offline' }
# Reuse the existing verified local distribution after Expo regeneration.
$wrapperProperties = Join-Path $androidDirectory 'gradle\wrapper\gradle-wrapper.properties'
$wrapper = Get-Content -LiteralPath $wrapperProperties -Raw
if ($wrapper -match 'distributionUrl=https\\?://[^\r\n]*/(gradle-[^/\r\n]+\.zip)') {
  $archivePath = Join-Path $mobileDirectory ".expo\$($Matches[1])"
  if (Test-Path -LiteralPath $archivePath) {
    $archiveUrl = ([Uri]$archivePath).AbsoluteUri -replace ':', '\:'
    $wrapper = [regex]::Replace($wrapper, '(?m)^distributionUrl=.*$', "distributionUrl=$archiveUrl")
    Set-Content -LiteralPath $wrapperProperties -Value $wrapper.TrimEnd("`r", "`n") -NoNewline
  }
}
Push-Location $androidDirectory
try {
  & .\gradlew.bat @arguments
  if ($LASTEXITCODE -ne 0) { throw 'Kotlin library compilation or lifecycle tests failed.' }
} finally { Pop-Location }
Write-Host 'Native library compilation and lifecycle tests passed. No APK was generated or installed.'
