param(
  [string]$AndroidApi = '24',
  [ValidateSet('android/arm64', 'android/arm')]
  [string]$Target = 'android/arm64',
  [string]$NdkVersion = '27.1.12297006',
  [switch]$StripSymbols
)

$ErrorActionPreference = 'Stop'
# Keep native runtime security patches reproducible without changing the global Go installation.
$env:GOTOOLCHAIN = 'go1.27.3'
$daemonDirectory = $PSScriptRoot
$repositoryRoot = Resolve-Path (Join-Path $daemonDirectory '..\..')
$outputDirectory = Join-Path $repositoryRoot 'apps\mobile\modules\streamforge-torrent-daemon\android\libs'
$daemonAar = Join-Path $daemonDirectory 'streamforge.aar'
$moduleAar = Join-Path $outputDirectory 'streamforge.aar'

if (-not $env:ANDROID_HOME) {
  $defaultAndroidSdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
  if (Test-Path -LiteralPath $defaultAndroidSdk) {
    $env:ANDROID_HOME = $defaultAndroidSdk
  }
}

if (-not $env:ANDROID_NDK_HOME -and $env:ANDROID_HOME) {
  $env:ANDROID_NDK_HOME = Join-Path $env:ANDROID_HOME "ndk\$NdkVersion"
}
if (-not $env:ANDROID_HOME -or -not (Test-Path -LiteralPath $env:ANDROID_HOME)) { throw 'An installed Android SDK is required.' }
if (-not $env:ANDROID_NDK_HOME -or -not (Test-Path -LiteralPath (Join-Path $env:ANDROID_NDK_HOME 'source.properties'))) { throw "Android NDK $NdkVersion is required, or set ANDROID_NDK_HOME explicitly." }
if ([int]$AndroidApi -lt 24) { throw 'The mobile application requires Android API 24 or newer.' }
$gomobileVersion = 'v0.0.0-20260908204917-8b95e45f8d3e'
$goBinary = Get-Command go -ErrorAction Stop

$gomobile = Get-Command gomobile -ErrorAction SilentlyContinue
if (-not $gomobile) {
  $goPath = (& $goBinary.Source env GOPATH).Trim()
  $candidate = Join-Path $goPath 'bin\gomobile.exe'
  if (-not (Test-Path -LiteralPath $candidate)) {
    throw "gomobile is not installed. Run: go install golang.org/x/mobile/cmd/gomobile@$gomobileVersion"
  }
  $gomobilePath = $candidate
} else {
  $gomobilePath = $gomobile.Source
}
$installedBindingTool = & $goBinary.Source version -m $gomobilePath
if ($LASTEXITCODE -ne 0 -or -not ($installedBindingTool -match ([regex]::Escape($gomobileVersion)))) {
  throw "Install the pinned gomobile version: go install golang.org/x/mobile/cmd/gomobile@$gomobileVersion"
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
Push-Location $daemonDirectory
try {
  $bindingArguments = @('bind', "-target=$Target", "-androidapi=$AndroidApi", '-o', $daemonAar)
  # NDK r27 needs both flags for LOAD and RELRO alignment on 16 KiB devices.
  # Pion transport's pinned anet Android interface workaround uses private Go
  # zone-cache symbols. Its documented Go 1.23+ build flag is required; keep the
  # Go toolchain pinned and verify Android interface behavior on the test phone.
  $linkerFlags = '-checklinkname=0 -extldflags=-Wl,-z,max-page-size=16384,-z,common-page-size=16384'
  if ($StripSymbols) { $linkerFlags = "-s -w $linkerFlags" }
  $bindingArguments += "-ldflags=$linkerFlags"
  $bindingArguments += './mobile'
  & $gomobilePath @bindingArguments
  if ($LASTEXITCODE -ne 0) {
    throw "gomobile bind failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

& (Join-Path $daemonDirectory 'verify-android-aar.ps1') -Path $daemonAar -Target $Target
Copy-Item -LiteralPath $daemonAar -Destination $moduleAar -Force
Write-Host "Android AAR ready: $moduleAar"
