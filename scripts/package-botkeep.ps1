[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = Join-Path $repoRoot '.cache\botkeep'
$stage = Join-Path $outputRoot ('package-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'bin') | Out-Null
$saved = @{}
foreach ($key in @('GOWORK', 'GOTOOLCHAIN', 'CGO_ENABLED', 'GOOS', 'GOARCH')) {
    $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
}
try {
    $env:GOWORK = 'off'
    $env:GOTOOLCHAIN = 'go1.27.3'
    $env:CGO_ENABLED = '0'
    $env:GOOS = 'linux'
    Push-Location (Join-Path $repoRoot 'services\api')
    try {
        foreach ($architecture in @('amd64', 'arm64')) {
            $env:GOARCH = $architecture
            $binary = Join-Path $stage "bin\streamforge-api-linux-$architecture"
            & go build -mod=readonly -trimpath -ldflags='-s -w' -o $binary ./cmd/server
            if ($LASTEXITCODE -ne 0) { throw "Backend $architecture compilation failed." }
            $header = [System.IO.File]::ReadAllBytes($binary)
            $machine = [BitConverter]::ToUInt16($header, 18)
            if ($header[0] -ne 127 -or $header[1] -ne 69 -or $header[2] -ne 76 -or $header[3] -ne 70 -or
                $header[4] -ne 2 -or $header[5] -ne 1 -or
                ($architecture -eq 'amd64' -and $machine -ne 62) -or
                ($architecture -eq 'arm64' -and $machine -ne 183)) { throw "Unexpected executable format: $architecture" }
            $metadata = & go version -m $binary
            if ($LASTEXITCODE -ne 0 -or -not ($metadata -match 'go1\.27\.3') -or -not ($metadata -match 'CGO_ENABLED=0')) {
                throw 'Unexpected backend toolchain or dynamic C dependency.'
            }
            Write-Output "$architecture static backend: $($header.Length) bytes"
        }
    } finally { Pop-Location }
    $template = Join-Path $repoRoot 'deployments\botkeep'
    foreach ($name in @('start.sh', '.env.example', 'README.txt', 'certs')) {
        Copy-Item -LiteralPath (Join-Path $template $name) -Destination $stage -Recurse
    }
    # Shell source must retain LF line endings, even on Windows checkouts.
    $startPath = Join-Path $stage 'start.sh'
    $startText = [System.IO.File]::ReadAllText($startPath).Replace("`r`n", "`n")
    [System.IO.File]::WriteAllText($startPath, $startText, (New-Object System.Text.UTF8Encoding($false)))
    $hashes = foreach ($architecture in @('amd64', 'arm64')) {
        $name = "bin/streamforge-api-linux-$architecture"
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try {
            $digest = [BitConverter]::ToString($sha.ComputeHash([System.IO.File]::ReadAllBytes((Join-Path $stage $name)))).Replace('-', '').ToLowerInvariant()
        } finally { $sha.Dispose() }
        "$digest  $name"
    }
    [System.IO.File]::WriteAllLines((Join-Path $stage 'SHA256SUMS.txt'), $hashes)
    $archive = Join-Path $outputRoot 'streamforge-backend-botkeep.zip'
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive }
    $zip = [System.IO.Compression.ZipFile]::Open($archive, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        # Windows .NET otherwise writes backslash entries that Linux extractors
        # may treat as literal filenames. Also allowlist public package contents.
        foreach ($name in @('bin/streamforge-api-linux-amd64', 'bin/streamforge-api-linux-arm64', 'start.sh', '.env.example', 'README.txt', 'certs/README.txt', 'SHA256SUMS.txt')) {
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $stage $name), $name) | Out-Null
        }
    } finally { $zip.Dispose() }
    Write-Output "Backend ZIP: $archive ($((Get-Item -LiteralPath $archive).Length) bytes)"
    Write-Output 'No APK, upload, server creation or deployment was performed.'
} finally {
    foreach ($key in $saved.Keys) { [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process') }
}
