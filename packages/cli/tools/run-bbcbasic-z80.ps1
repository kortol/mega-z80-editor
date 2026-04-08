$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..\..\..")
$cliDir = Join-Path $repoRoot "packages\cli"

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

foreach ($name in $files) {
  Write-Host "== $name =="
  $src = Join-Path $repoRoot "examples\bbcbasic-z80\$name.asm"
  $out = ".tmp_bbcbasic_$name.rel"

  pnpm -C $cliDir run dev -- as --lst --sym $src $out
  if ($LASTEXITCODE -ne 0) {
    throw "assemble failed: $name (exit=$LASTEXITCODE)"
  }
}
