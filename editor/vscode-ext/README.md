# Z80 Assembler Language

Language support and debugging tools for Z80 assembly in Visual Studio Code.

## Features

- Syntax highlighting for Z80 assembly
- Semantic highlighting for labels, externs, and macros
- PEG-based parser diagnostics
- Debug launch/attach via `mz80-dap`

## Development Build

```bash
pnpm -C editor/vscode-ext run build
```

The build copies the packaged CLI and LSP runtimes into `server/` so the extension can run from a VSIX without depending on the monorepo layout.

## Marketplace Packaging

```bash
pnpm -C editor/vscode-ext exec vsce package
```

This generates a `.vsix` package for local installation or Marketplace publishing.
