param(
  [Parameter(Mandatory=$true)][string]$Path,
  [ValidateSet('android/arm64', 'android/arm')][string]$Target = 'android/arm64'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Path).Path)
try {
  $abi = if ($Target -eq 'android/arm64') { 'arm64-v8a' } else { 'armeabi-v7a' }
  $libraries = @($archive.Entries | Where-Object { $_.FullName -match '^jni/[^/]+/[^/]+\.so$' })
  if ($libraries.Count -ne 1 -or $libraries[0].FullName -ne "jni/$abi/libgojni.so") {
    throw "AAR must contain only the requested $abi Go library."
  }
  if (-not $archive.GetEntry('classes.jar')) { throw 'AAR Java bindings are missing.' }
  $entry = $libraries[0]
  if ($entry.Length -gt 256MB) { throw 'Go native library exceeds the inspection allowance.' }
  $stream = $entry.Open()
  $memory = New-Object IO.MemoryStream
  try { $stream.CopyTo($memory) } finally { $stream.Dispose() }
  $reader = New-Object IO.BinaryReader($memory)
  try {
    $memory.Position = 0
    if ($reader.ReadUInt32() -ne 0x464c457f) { throw 'Native library is not ELF.' }
    $class = $reader.ReadByte()
    if ($reader.ReadByte() -ne 1) { throw 'ELF must be little endian.' }
    $memory.Position = 18
    $machine = $reader.ReadUInt16()
    if ($Target -eq 'android/arm') {
      if ($class -ne 1 -or $machine -ne 40) { throw 'Wrong ELF architecture for ARMv7.' }
      Write-Host 'ARMv7 AAR architecture verified. 16 KiB ARM64 checks do not apply.'
      return
    }
    if ($class -ne 2 -or $machine -ne 183) { throw 'Wrong ELF architecture for ARM64.' }
    $memory.Position = 32
    $tableOffset = $reader.ReadUInt64()
    $memory.Position = 54
    $entrySize = $reader.ReadUInt16()
    $count = $reader.ReadUInt16()
    if ($entrySize -lt 56 -or $count -eq 0 -or $tableOffset + $entrySize * $count -gt $memory.Length) {
      throw 'Invalid ELF program-header table.'
    }
    $loads = 0
    for ($index = 0; $index -lt $count; $index++) {
      $position = $tableOffset + $entrySize * $index
      $memory.Position = $position
      $type = $reader.ReadUInt32()
      if ($type -ne 1 -and $type -ne 0x6474e552) { continue }
      $memory.Position = $position + 8
      $offset = $reader.ReadUInt64()
      $virtual = $reader.ReadUInt64()
      $memory.Position = $position + 40
      $memorySize = $reader.ReadUInt64()
      $alignment = $reader.ReadUInt64()
      if ($type -eq 1) {
        $loads++
        if ($alignment -lt 16384 -or $virtual % 16384 -ne $offset % 16384) {
          throw 'ARM64 LOAD segment is not 16 KiB aligned.'
        }
      } elseif (($virtual + $memorySize) % 16384 -ne 0) {
        throw 'ARM64 GNU_RELRO end is not 16 KiB aligned.'
      }
    }
    if ($loads -eq 0) { throw 'ELF contains no loadable segments.' }
    Write-Host "ARM64 AAR verified: $loads LOAD segments and RELRO layout support 16 KiB alignment."
  } finally { $reader.Dispose(); $memory.Dispose() }
} finally { $archive.Dispose() }
