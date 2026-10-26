$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$packageTokens = $null
$packageErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $repositoryRoot 'scripts/package-botkeep.ps1'), [ref]$packageTokens, [ref]$packageErrors) | Out-Null
if ($packageErrors) { $packageErrors | ForEach-Object { Write-Error $_ }; exit 1 }
foreach ($relativeScript in @('apps/mobile/scripts/configure-dev-firewall.ps1', 'apps/mobile/scripts/run-android.ps1', 'apps/mobile/scripts/check-native-android.ps1', 'apps/mobile/scripts/collect-phone-metrics.ps1', 'services/torrent-daemon/build-android-aar.ps1', 'services/torrent-daemon/verify-android-aar.ps1', 'scripts/setup-backend-test-runtime.ps1', 'scripts/validate-backend-integration.ps1')) {
  $scriptTokens = $null
  $scriptErrors = $null
  [System.Management.Automation.Language.Parser]::ParseFile(
    (Join-Path $repositoryRoot $relativeScript), [ref]$scriptTokens, [ref]$scriptErrors
  ) | Out-Null
  if ($scriptErrors) { $scriptErrors | ForEach-Object { Write-Error $_ }; exit 1 }
}
Write-Host 'Android and backend test scripts parsed successfully. No build script was executed.'
