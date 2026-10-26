param([string]$Serial)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$adb = Get-Command adb -ErrorAction SilentlyContinue
$adbPath = if ($adb) { $adb.Source } elseif ($env:ANDROID_HOME) { Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe' } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe' }
if (-not (Test-Path -LiteralPath $adbPath -PathType Leaf)) { throw 'ADB is unavailable. Pair wireless debugging after the authorized APK is installed.' }
$deviceArgs = if ($Serial) { @('-s', $Serial) } else { @() }
$state = & $adbPath @deviceArgs get-state 2>$null
if ($LASTEXITCODE -ne 0 -or $state.Trim() -ne 'device') { throw 'Connect exactly one authorized phone, or supply -Serial when multiple devices are paired.' }
$processId = (& $adbPath @deviceArgs shell pidof com.streamforge.app).Trim()
if (-not $processId) { throw 'Open the installed StreamForge app before collecting measurements.' }
$output = Join-Path $repo ('.cache\phone-metrics\' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $output -Force | Out-Null
# Read-only process/performance counters only. No app install, settings changes,
# credentials, device-wide logcat or automatic sharing.
foreach ($entry in @(
  @{ Name='memory.txt'; Args=@('shell','dumpsys','meminfo','com.streamforge.app') },
  @{ Name='frames.txt'; Args=@('shell','dumpsys','gfxinfo','com.streamforge.app') },
  @{ Name='battery.txt'; Args=@('shell','dumpsys','battery') }
)) {
  & $adbPath @deviceArgs @($entry.Args) | Set-Content -LiteralPath (Join-Path $output $entry.Name) -Encoding UTF8
  if ($LASTEXITCODE -ne 0) { throw "Could not collect $($entry.Name)." }
}
Write-Host "Read-only phone measurements saved locally: $output"
