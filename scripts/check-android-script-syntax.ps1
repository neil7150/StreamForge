$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
foreach ($relativeScript in @('apps/mobile/scripts/run-android.ps1', 'apps/mobile/scripts/check-native-android.ps1', 'services/torrent-daemon/build-android-aar.ps1', 'services/torrent-daemon/verify-android-aar.ps1')) {
  $scriptTokens = $null
  $scriptErrors = $null
  [System.Management.Automation.Language.Parser]::ParseFile(
    (Join-Path $repositoryRoot $relativeScript), [ref]$scriptTokens, [ref]$scriptErrors
  ) | Out-Null
  if ($scriptErrors) { $scriptErrors | ForEach-Object { Write-Error $_ }; exit 1 }
}
Write-Host 'Android scripts parsed successfully. No build script was executed.'
