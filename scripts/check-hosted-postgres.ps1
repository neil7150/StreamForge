[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$ServerAddress,
    [Parameter(Mandatory=$true)][int]$Port,
    [Parameter(Mandatory=$true)][string]$CAFile,
    [string]$Username = 'botkeep',
    [string]$Database = 'app',
    [switch]$TlsPreflight,
    [switch]$NoPause
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$client = Join-Path $repoRoot '.cache\backend-tools\postgresql-16.15-5\pgsql\bin\psql.exe'
$queryFile = Join-Path $repoRoot 'deployments\botkeep\check-postgres.sql'
foreach ($file in @($client, $queryFile, $CAFile)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'A required PostgreSQL client, query or CA file is missing.' }
}
$certificatePath = (Resolve-Path -LiteralPath $CAFile).Path
$encodedCA = [Uri]::EscapeDataString($certificatePath)
$encodedUser = [Uri]::EscapeDataString($Username)
$encodedDatabase = [Uri]::EscapeDataString($Database)
$connection = "postgresql://${encodedUser}@${ServerAddress}:${Port}/${encodedDatabase}?sslmode=verify-full&sslrootcert=${encodedCA}&connect_timeout=8"
$password = $null
$pointer = [IntPtr]::Zero
$process = New-Object System.Diagnostics.Process
try {
    $process.StartInfo.FileName = $client
    $process.StartInfo.UseShellExecute = $false
    $process.StartInfo.CreateNoWindow = $true
    $process.StartInfo.RedirectStandardOutput = $true
    $process.StartInfo.RedirectStandardError = $true
    $process.StartInfo.StandardOutputEncoding = New-Object System.Text.UTF8Encoding($false)
    $process.StartInfo.StandardErrorEncoding = New-Object System.Text.UTF8Encoding($false)
    $process.StartInfo.EnvironmentVariables.Remove('PGPASSWORD')
    $process.StartInfo.EnvironmentVariables['PGPASSFILE'] = Join-Path $repoRoot ('.cache\botkeep\unused-password-' + [guid]::NewGuid().ToString('N'))
    $process.StartInfo.EnvironmentVariables['PGOPTIONS'] = '-c default_transaction_read_only=on -c statement_timeout=10000'
    $process.StartInfo.EnvironmentVariables['PGCLIENTENCODING'] = 'UTF8'
    $clientArgs = @('--no-psqlrc', '--no-password', '--set=ON_ERROR_STOP=1', '--pset=pager=off', "--dbname=$connection")
    if ($TlsPreflight) {
        Write-Host 'TLS preflight without password. A password-required error is expected after certificate verification.'
        $clientArgs += '--command=SELECT 1;'
    } else {
        Write-Host 'Read-only PostgreSQL permission and extension check. TLS identity verification is required.'
        Write-Host 'Paste the POSTGRESQL password, then press Enter. Stars confirm that input is received.'
        $password = Read-Host 'PostgreSQL password' -AsSecureString
        if ($password.Length -eq 0) { throw 'No password was entered. Reopen the checker and paste the PostgreSQL password.' }
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
        # Temporary child-process environment only: never a file, URI, argument,
        # parent environment variable or log entry.
        $process.StartInfo.EnvironmentVariables['PGPASSWORD'] = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        $clientArgs += "--file=$queryFile"
    }
    $quotedArgs = foreach ($argument in $clientArgs) {
        $escaped = [regex]::Replace($argument, '(\\*)"', '$1$1\"')
        $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
        '"' + $escaped + '"'
    }
    $process.StartInfo.Arguments = $quotedArgs -join ' '
    if (-not $process.Start()) { throw 'PostgreSQL checker did not start.' }
    $process.StartInfo.EnvironmentVariables.Remove('PGPASSWORD')
    $outputTask = $process.StandardOutput.ReadToEndAsync()
    $errorTask = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit(45000)) {
        $process.Kill()
        $process.WaitForExit()
        throw 'Database check timed out; no database changes were requested.'
    }
    $resultText = $outputTask.GetAwaiter().GetResult()
    $errorText = $errorTask.GetAwaiter().GetResult()
    if ($resultText) { Write-Host $resultText.TrimEnd() }
    if ($errorText) { Write-Host $errorText.TrimEnd() }
    Write-Host "PostgreSQL client exit code: $($process.ExitCode)"
} finally {
    $process.StartInfo.EnvironmentVariables.Remove('PGPASSWORD')
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ($null -ne $password) { $password.Dispose() }
    $process.Dispose()
}
if (-not $NoPause) { Read-Host 'Keep this window open to share the results. Press Enter when finished' | Out-Null }
