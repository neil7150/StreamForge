param(
    [string]$PostgresBin = '',
    [switch]$KeepData
)

$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $PostgresBin) {
    $PostgresBin = Join-Path $repoRoot '.cache\backend-tools\postgresql-16.15-5\pgsql\bin'
}
$PostgresBin = [System.IO.Path]::GetFullPath($PostgresBin)
foreach ($binary in @('initdb.exe', 'pg_ctl.exe', 'postgres.exe')) {
    $binaryPath = Join-Path $PostgresBin $binary
    if (-not (Test-Path -LiteralPath $binaryPath) -or (Get-Item -LiteralPath $binaryPath).Length -eq 0) {
        throw "A portable PostgreSQL 16 runtime is required: $binaryPath. See docs/backend-integration-tests.md."
    }
}
$postgresVersion = & (Join-Path $PostgresBin 'postgres.exe') --version
if ($LASTEXITCODE -ne 0 -or $postgresVersion -notmatch 'PostgreSQL\) 16\.') { throw 'This check expects PostgreSQL 16.' }
$nodePath = (Get-Command node -ErrorAction Stop).Source
$runRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot '.cache\backend-tests'))
New-Item -ItemType Directory -Path $runRoot -Force | Out-Null
$runDirectory = Join-Path $runRoot ('run-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $runDirectory | Out-Null
$clusterPath = Join-Path $runDirectory 'data'
$passwordFile = Join-Path $runDirectory 'password.tmp'
$logFile = Join-Path $runDirectory 'postgres.log'
$testPassword = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
[System.IO.File]::WriteAllText($passwordFile, $testPassword, [System.Text.Encoding]::ASCII)
$portReservation = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$portReservation.Start()
$testPort = $portReservation.LocalEndpoint.Port
$portReservation.Stop()
$started = $false
$oldWork = $env:GOWORK
$oldCgo = $env:CGO_ENABLED
$oldDatabase = $env:STREAMFORGE_TEST_POSTGRES_URL
$oldNode = $env:STREAMFORGE_TEST_NODE
$checkExit = 1
try {
    Write-Output "Preparing an isolated $postgresVersion cluster on 127.0.0.1:$testPort"
    & (Join-Path $PostgresBin 'initdb.exe') -D $clusterPath -U streamforge_test --encoding=UTF8 --locale=C --auth=scram-sha-256 "--pwfile=$passwordFile" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL initialization failed.' }
    Remove-Item -LiteralPath $passwordFile
    $serverOptions = "-h 127.0.0.1 -p $testPort -c max_connections=30 -c shared_buffers=32MB -c fsync=off -c synchronous_commit=off"
    $started = $true
    & (Join-Path $PostgresBin 'pg_ctl.exe') -D $clusterPath -l $logFile -o $serverOptions -w -t 30 start
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL startup failed; inspect $logFile" }
    $env:GOWORK = 'off'
    $env:CGO_ENABLED = '0'
    $env:STREAMFORGE_TEST_POSTGRES_URL = "postgres://streamforge_test:${testPassword}@127.0.0.1:${testPort}/postgres?sslmode=disable"
    $env:STREAMFORGE_TEST_NODE = $nodePath
    Push-Location (Join-Path $repoRoot 'tests\backend')
    try {
        & go test -mod=readonly -count=1 -timeout=90s -v ./...
        $checkExit = $LASTEXITCODE
    } finally { Pop-Location }
} finally {
    $env:GOWORK = $oldWork
    $env:CGO_ENABLED = $oldCgo
    $env:STREAMFORGE_TEST_POSTGRES_URL = $oldDatabase
    $env:STREAMFORGE_TEST_NODE = $oldNode
    if (Test-Path -LiteralPath $passwordFile) { Remove-Item -LiteralPath $passwordFile }
    $stopped = -not $started
    if ($started) {
        & (Join-Path $PostgresBin 'pg_ctl.exe') -D $clusterPath -m immediate -w -t 30 stop
        $stopped = $LASTEXITCODE -eq 0
        if (-not $stopped) { Write-Warning "Test PostgreSQL did not stop; inspect $runDirectory" }
    }
    if ($stopped -and $checkExit -eq 0 -and -not $KeepData) {
        # Remove only this invocation's verified directory, after server shutdown.
        $resolvedRun = [System.IO.Path]::GetFullPath($runDirectory)
        $expectedPrefix = $runRoot + [System.IO.Path]::DirectorySeparatorChar
        if (-not $resolvedRun.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
            [System.IO.Path]::GetFileName($resolvedRun) -notmatch '^run-[a-f0-9]{32}$') { throw 'Unexpected integration cleanup target.' }
        Remove-Item -LiteralPath $resolvedRun -Recurse -Force
    } else { Write-Output "Integration diagnostics retained at $runDirectory" }
}
if ($checkExit -ne 0) { throw "Backend integration checks failed (exit $checkExit)." }
if (-not $stopped) { throw 'Backend tests passed, but the test server did not stop.' }
Write-Output 'Live PostgreSQL/HTTPS integration passed. Redis used a test-only TCP emulator. No APK was generated.'
