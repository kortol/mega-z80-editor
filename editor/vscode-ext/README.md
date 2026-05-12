# Z80 Assembler Language

Z80 assembly support for Visual Studio Code with syntax highlighting, diagnostics, semantic tokens, and integrated debugging.

## Features

- TextMate syntax highlighting generated from the PEG grammar used by the assembler
- Semantic highlighting for label definitions and references, externs, and macros
- PEG-based parser diagnostics surfaced through the Language Server
- Integrated `mz80-dap` debugging for `launch` and `attach`
- Auto-detection of sidecar `.sym` and `.smap` files next to the target binary

## Quick Start

1. Open a workspace that contains `.asm` files.
2. Open a Z80 assembly file. The extension activates automatically on `z80-asm`.
3. Build your program with the `mz80` CLI so that `.bin` or `.com` plus optional `.sym` and `.smap` files are generated.
4. Start debugging with the `MZ80 Debugger` configuration type.

Example launch configuration:

```json
{
  "name": "MZ80 Launch",
  "type": "mz80-dap",
  "request": "launch",
  "program": "${workspaceFolder}/build/program.com",
  "cpm": true,
  "cpmInteractive": true
}
```

## Debugging

The extension starts a bundled debug adapter runtime backed by the `mz80` CLI.

- `launch` starts the target and can auto-start the debugger backend
- `attach` connects to an existing debugger RPC endpoint
- `.sym` and `.smap` files are auto-detected from the target path when present

Useful settings:

- `mz80.debug.cliEntry`: override the CLI entry script used by the debugger

## Notes

- The language server and debug adapter are bundled with the extension package
- Diagnostics are based on the current PEG parser and assembler analysis pipeline
- Example projects and larger fixture sets live in the separate `mega-z80-examples` repository

## Repository

- Source: [kortol/mega-z80-editor](https://github.com/kortol/mega-z80-editor)
- Issues: [GitHub Issues](https://github.com/kortol/mega-z80-editor/issues)
