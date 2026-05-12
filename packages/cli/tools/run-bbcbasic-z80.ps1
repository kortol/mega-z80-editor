$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..\..\..")
$cliDir = Join-Path $repoRoot "packages\cli"
$examplesRoot = if ($env:MZ80_EXAMPLES_DIR) {
  Resolve-Path $env:MZ80_EXAMPLES_DIR
} else {
  Join-Path (Split-Path $repoRoot -Parent) "mega-z80-examples"
}

# Keep Node/pnpm lookups inside workspace in sandboxed environments.
$env:USERPROFILE = $repoRoot
$env:HOMEPATH = $repoRoot
$env:HOME = $repoRoot

$files = @(
  "main",
  "exec",
  "eval",
  "fpp",
  "hardware",
  "cpm",
  "ram"
)

$exampleDir = Join-Path $examplesRoot "bbcbasic-z80"
if (!(Test-Path $exampleDir)) {
  throw "examples repo not found: $exampleDir"
}
$relFiles = @()

foreach ($name in $files) {
  Write-Host "== $name =="
  $src = Join-Path $exampleDir "$name.asm"
  $out = Join-Path $exampleDir ".tmp_bbcbasic_as_$name.rel"

  pnpm -C $cliDir run dev -- as --lst --sym $src $out
  if ($LASTEXITCODE -ne 0) {
    throw "assemble failed: $name (exit=$LASTEXITCODE)"
  }

  $relFiles += $out
}

Write-Host "== link =="
$outCom = Join-Path $exampleDir "bbcbasic-as.com"
& pnpm -C $cliDir run dev -- link --com --map --sym --log $outCom @relFiles
if ($LASTEXITCODE -ne 0) {
  throw "link failed (exit=$LASTEXITCODE)"
}
