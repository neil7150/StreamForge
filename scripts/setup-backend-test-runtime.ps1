$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$toolRoot = Join-Path $repoRoot '.cache\backend-tools'
$version = '16.15-5'
$archiveName = "postgresql-$version-windows-x64-binaries.zip"
$archivePath = Join-Path $toolRoot $archiveName
$runtimeRoot = Join-Path $toolRoot "postgresql-$version"
# Recorded SHA-256 pins the exact archive used by the verified local run.
$expectedHash = '43BB45F173A6F08CF1D29A97A6D8DEB119E8E8093A24C00D2D1001A0CCAA8281'
function Get-ArchiveHash([string]$Path) {
    $stream = [System.IO.File]::OpenRead($Path)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return [System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
    finally { $sha.Dispose(); $stream.Dispose() }
}
New-Item -ItemType Directory -Path $toolRoot -Force | Out-Null
if (-not (Test-Path -LiteralPath $archivePath)) {
    $partial = $archivePath + '.download'
    Write-Output 'Downloading the official EDB PostgreSQL 16 portable test runtime (about 373 MB).'
    Invoke-WebRequest -Uri "https://get.enterprisedb.com/postgresql/$archiveName" -OutFile $partial -TimeoutSec 600 -UseBasicParsing
    if ((Get-ArchiveHash $partial) -ne $expectedHash) { throw 'PostgreSQL archive checksum mismatch.' }
    Move-Item -LiteralPath $partial -Destination $archivePath
}
if ((Get-ArchiveHash $archivePath) -ne $expectedHash) { throw 'Cached PostgreSQL archive checksum mismatch.' }
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    foreach ($entry in $archive.Entries) {
        if ($entry.FullName -notmatch '^pgsql/(bin|lib|share)/' -or $entry.FullName.EndsWith('/')) { continue }
        $destination = [System.IO.Path]::GetFullPath((Join-Path $runtimeRoot $entry.FullName))
        $expectedPrefix = [System.IO.Path]::GetFullPath($runtimeRoot) + [System.IO.Path]::DirectorySeparatorChar
        if (-not $destination.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected archive path.' }
        New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($destination)) -Force | Out-Null
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destination, $true)
    }
} finally { $archive.Dispose() }
& (Join-Path $runtimeRoot 'pgsql\bin\postgres.exe') --version
if ($LASTEXITCODE -ne 0) { throw 'The portable PostgreSQL runtime could not start.' }
Write-Output 'Test runtime ready in the ignored project cache. No Windows service was installed.'
