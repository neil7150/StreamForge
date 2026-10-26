[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$ServerAddress,
    [Parameter(Mandatory=$true)][string]$CAFile,
    [string]$Username = 'botkeep',
    [switch]$TlsOnly,
    [switch]$ConnectionOnly,
    [switch]$NoPause
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$probe = Join-Path $repoRoot '.cache\botkeep\redis-probe.exe'
if (-not (Test-Path -LiteralPath $probe)) { throw 'Read-only probe has not been built.' }
if (-not (Test-Path -LiteralPath $CAFile)) { throw 'CA certificate file not found.' }
if ($ConnectionOnly) {
    Write-Host 'Cache Redis connection check: verified TLS, authentication and PING only.'
} else {
    Write-Host 'Read-only Redis check: TLS, PING, CONFIG GET and INFO persistence.'
}
$password = $null
if (-not $TlsOnly) {
    Write-Host 'Password is hidden and is not saved or passed in command arguments.'
    $password = Read-Host 'Paste the Redis password from Botkeep, then press Enter' -AsSecureString
}
$pointer = [IntPtr]::Zero
$process = New-Object System.Diagnostics.Process
try {
    $plain = ''
    if ($null -ne $password) {
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    $inputData = @{ Address=$ServerAddress; Username=$Username; Password=$plain; CAFile=$CAFile } | ConvertTo-Json -Compress
    $process.StartInfo.FileName = $probe
    $process.StartInfo.UseShellExecute = $false
    $process.StartInfo.RedirectStandardInput = $true
    $process.StartInfo.RedirectStandardOutput = $true
    $process.StartInfo.RedirectStandardError = $true
    $process.StartInfo.StandardOutputEncoding = New-Object System.Text.UTF8Encoding($false)
    $process.StartInfo.StandardErrorEncoding = New-Object System.Text.UTF8Encoding($false)
    $process.StartInfo.CreateNoWindow = $true
    if ($TlsOnly) { $process.StartInfo.Arguments = '-tls-only' }
    elseif ($ConnectionOnly) { $process.StartInfo.Arguments = '-connection-only' }
    if (-not $process.Start()) { throw 'Probe did not start.' }
    $outputTask = $process.StandardOutput.ReadToEndAsync()
    $errorTask = $process.StandardError.ReadToEndAsync()
    # Write bytes directly: Windows PowerShell's .NET Framework lacks
    # StandardInputEncoding and its default StreamWriter may emit a BOM.
    $inputBytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes($inputData)
    $inputStream = $process.StandardInput.BaseStream
    $inputStream.Write($inputBytes, 0, $inputBytes.Length)
    $inputStream.Close()
    [Array]::Clear($inputBytes, 0, $inputBytes.Length)
    $inputBytes = $null
    $plain = $null
    $inputData = $null
    if (-not $process.WaitForExit(90000)) {
        $process.Kill()
        $process.WaitForExit()
        throw 'Probe exceeded its timeout; no configuration was changed.'
    }
    $probeOutput = $outputTask.GetAwaiter().GetResult()
    $probeError = $errorTask.GetAwaiter().GetResult()
    if ($probeOutput) { Write-Host $probeOutput.TrimEnd() }
    if ($probeError) { Write-Host $probeError.TrimEnd() }
    if (-not $probeOutput -and -not $probeError) { Write-Host 'Probe returned no diagnostic text.' }
    Write-Host "Probe exit code: $($process.ExitCode)"
} finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $plain = $null
    $inputData = $null
    if ($null -ne $inputBytes) { [Array]::Clear($inputBytes, 0, $inputBytes.Length) }
    if ($null -ne $password) { $password.Dispose() }
    $process.Dispose()
}
if (-not $NoPause) {
    Read-Host 'Keep this window open to share the check results. Press Enter to close' | Out-Null
}
