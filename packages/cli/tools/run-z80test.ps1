$ErrorActionPreference = "Stop"

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
  pnpm -C packages/cli run dev -- as "..\..\examples\z80test\src\$name.asm" ".tmp_$name.rel"
}
