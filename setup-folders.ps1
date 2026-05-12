# ルートディレクトリ作成
New-Item -ItemType Directory -Force -Name "mega-z80-editor"
New-Item -ItemType Directory -Force -Name "mega-z80-examples"
Set-Location "mega-z80-editor"

# 各フォルダ作成
New-Item -ItemType Directory -Force -Path "packages/cli/src"
New-Item -ItemType Directory -Force -Path "editor/lsp/src"
New-Item -ItemType Directory -Force -Path "editor/dap/src"
New-Item -ItemType Directory -Force -Path "editor/vscode-ext/src"
New-Item -ItemType Directory -Force -Path "defs/schemas"
New-Item -ItemType Directory -Force -Path "docs"
New-Item -ItemType Directory -Force -Path "..\mega-z80-examples\hello-msx\src"

# README 雛形
"# MegaZ80Editor" | Out-File "docs/README.md" -Encoding utf8

# main.asm 雛形
@"
; Hello World for MSX (雛形)
ORG 0x4000
START:
    NOP
    RET
"@ | Out-File "..\mega-z80-examples\hello-msx\src\main.asm" -Encoding utf8

# mz80.yaml 雛形
@"
target: msx1
mode: standard   # standard / extended
entry: src/main.asm
rom:
  size: 32768
  mapper: ASCII8
"@ | Out-File "..\mega-z80-examples\hello-msx\mz80.yaml" -Encoding utf8

Write-Host "✅ フォルダ構成を作成しました"
