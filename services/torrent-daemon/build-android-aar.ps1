param(
  [string]$AndroidApi = '21'
)

$ErrorActionPreference = 'Stop'
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
  $ndkRoot = Join-Path $env:ANDROID_HOME 'ndk'
  $latestNdk = Get-ChildItem -LiteralPath $ndkRoot -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    Select-Object -First 1
  if ($latestNdk) {
    $env:ANDROID_NDK_HOME = $latestNdk.FullName
  }
}

$gomobile = Get-Command gomobile -ErrorAction SilentlyContinue
if (-not $gomobile) {
  $goBinary = Get-Command go -ErrorAction Stop
  $goPath = (& $goBinary.Source env GOPATH).Trim()
  $candidate = Join-Path $goPath 'bin\gomobile.exe'
  if (-not (Test-Path -LiteralPath $candidate)) {
    throw 'gomobile is not installed. Run: go install golang.org/x/mobile/cmd/gomobile@latest'
  }
  $gomobilePath = $candidate
} else {
  $gomobilePath = $gomobile.Source
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
Push-Location $daemonDirectory
try {
  & $gomobilePath bind -target=android "-androidapi=$AndroidApi" -o $daemonAar ./mobile
  if ($LASTEXITCODE -ne 0) {
    throw "gomobile bind failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

Copy-Item -LiteralPath $daemonAar -Destination $moduleAar -Force
Write-Host "Android AAR ready: $moduleAar"
