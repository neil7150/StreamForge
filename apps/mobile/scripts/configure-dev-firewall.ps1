param([switch]$Undo)
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  # Deliberately interactive one-time setup: show the change and result to the user.
  $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  if ($Undo) { $arguments += ' -Undo' }
  Start-Process -FilePath powershell.exe -ArgumentList $arguments -Verb RunAs -WindowStyle Normal -Wait
  exit
}

$mobileDirectory = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backupPath = Join-Path $mobileDirectory '.expo\dev-firewall-backup.json'
$ruleName = 'StreamForge-Metro-WiFi-8081'
$changed = @()
try {
  if ($Undo) {
    if (Test-Path -LiteralPath $backupPath) {
      $backup = Get-Content -LiteralPath $backupPath -Raw | ConvertFrom-Json
      foreach ($entry in $backup.changedRules) {
        $rule = Get-NetFirewallRule -Name $entry.name -ErrorAction Stop
        if ($rule.Action.ToString() -ne 'Block' -or $rule.Profile.ToString() -ne 'Public') { throw "The original rule was changed elsewhere. Inspect it before undoing: $($entry.name)" }
        $filter = $rule | Get-NetFirewallPortFilter
        if (($filter.LocalPort -join ',') -eq ($entry.localPort -join ',')) { continue }
        if (($filter.LocalPort -join ',') -ne '1-8080,8082-65535') { throw "The original port rule changed elsewhere: $($entry.name)" }
        $filter | Set-NetFirewallPortFilter -LocalPort @($entry.localPort) | Out-Null
      }
      Remove-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
      Remove-Item -LiteralPath $backupPath
      Write-Host 'Restored the original Node.js Public-network blocks and removed the Metro exception.'
    } else {
      Remove-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
      Write-Host 'No saved rule adjustments remain. Metro exception removed if present.'
    }
  } else {
    $nodeProgram = (Get-Command node -ErrorAction Stop).Source
    $wifi = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and ($_.Name -match 'Wi-Fi|Wireless' -or $_.InterfaceDescription -match 'Wi-Fi|Wireless') } | Select-Object -First 1
    if (-not $wifi) { throw 'Connect the PC to Wi-Fi first.' }
    Write-Host 'Restricted StreamForge development connection:'
    Write-Host "  Program: $nodeProgram"
    Write-Host "  Interface: $($wifi.Name); network profile stays Public."
    Write-Host '  Allow TCP 8081 only, from LocalSubnet. No tunnel or router forwarding.'
    Write-Host '  Other TCP ports and the existing UDP block stay blocked.'
    if (Test-Path -LiteralPath $backupPath) {
      if (-not (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue)) { throw 'Saved setup exists but its allow rule is missing. Run Undo before setting it up again.' }
      Write-Host 'The restricted exception is already configured.'
    } else {
      if (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue) { throw 'A Metro rule already exists without a saved setup record. Inspect it before applying changes.' }
      $blocks = @(Get-NetFirewallApplicationFilter -Program $nodeProgram -ErrorAction SilentlyContinue | Get-NetFirewallRule | Where-Object {
        $_.Enabled.ToString() -eq 'True' -and $_.Direction.ToString() -eq 'Inbound' -and $_.Action.ToString() -eq 'Block' -and ($_.Profile.ToString() -match 'Public|Any')
      })
      # An allow cannot override an explicit block. Validate before changing any rule.
      foreach ($rule in $blocks) {
        $filter = $rule | Get-NetFirewallPortFilter
        if ($filter.Protocol.ToString() -in @('UDP', '17')) { continue }
        if ($rule.Profile.ToString() -ne 'Public' -or $filter.Protocol.ToString() -notin @('TCP', '6') -or ($filter.LocalPort -join ',') -ne 'Any') {
          throw "An unexpected blocking rule needs manual inspection; no rules were changed: $($rule.DisplayName)"
        }
        $changed += [pscustomobject]@{ name = $rule.Name; localPort = @($filter.LocalPort) }
      }
      New-Item -ItemType Directory -Path (Split-Path -Parent $backupPath) -Force | Out-Null
      [pscustomobject]@{ changedRules = $changed; program = $nodeProgram; interface = $wifi.Name } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $backupPath -Encoding UTF8
      try {
        foreach ($entry in $changed) {
          Get-NetFirewallRule -Name $entry.name | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -LocalPort @('1-8080','8082-65535') | Out-Null
        }
        New-NetFirewallRule -Name $ruleName -DisplayName 'StreamForge Metro - Wi-Fi local subnet TCP 8081' -Direction Inbound -Action Allow -Profile Public -Program $nodeProgram -Protocol TCP -LocalPort 8081 -RemoteAddress LocalSubnet -InterfaceAlias $wifi.Name -EdgeTraversalPolicy Block | Out-Null
        Write-Host 'Done. Restart the live server if needed, then connect StreamForge Dev on the phone.'
      } catch {
        foreach ($entry in $changed) { Get-NetFirewallRule -Name $entry.name | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -LocalPort @($entry.localPort) | Out-Null }
        Remove-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $backupPath -ErrorAction SilentlyContinue
        throw
      }
    }
  }
} catch {
  Write-Host "Setup could not finish: $($_.Exception.Message)" -ForegroundColor Red
} finally {
  Read-Host 'Press Enter to close this setup window' | Out-Null
}
