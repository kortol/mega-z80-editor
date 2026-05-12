$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..\..\..")
$examplesRoot = if ($env:MZ80_EXAMPLES_DIR) {
  Resolve-Path $env:MZ80_EXAMPLES_DIR
} else {
  Join-Path (Split-Path $repoRoot -Parent) "mega-z80-examples"
}
$srcRoot = Join-Path $examplesRoot "z80test\src"

if (!(Test-Path $srcRoot)) {
  throw "examples repo not found: $srcRoot"
}

$files = @(
  "z80full",
  "z80flags",
  "z80doc",
  "z80docflags",
  "z80ccf",
  "z80ccfscr",
  "z80memptr"
)

foreach ($name in $files) {
  Write-Host "== $name =="
  pnpm -C packages/cli run dev -- as (Join-Path $srcRoot "$name.asm") ".tmp_$name.rel"
}
