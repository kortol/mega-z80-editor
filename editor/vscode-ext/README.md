# Z80 Assembler Language

Z80 assembly support for Visual Studio Code with syntax highlighting, diagnostics, semantic tokens, and integrated debugging.

## Features

- TextMate syntax highlighting generated from the PEG grammar used by the assembler
- Semantic highlighting for label definitions and references, externs, and macros
- PEG-based parser diagnostics surfaced through the Language Server
- Integrated `mz80-dap` debugging for `launch` and `attach`
- Auto-detection of sidecar `.sym` and `.smap` files next to the target binary

## Install and first use

### Install the VSIX

Download a release `.vsix`, then choose **Extensions: Install from VSIX...** in VS Code. During repository development, create the package first:

```powershell
pnpm -C editor/vscode-ext run package:vsix
```

Select the resulting `editor/vscode-ext/z80-assembler-language-<version>.vsix`. A reload is required after installation or upgrade.

### Edit assembly

1. Open the folder containing the project or `.asm` files.
2. Open an `.asm` file. VS Code selects the `z80-asm` language mode and activates the extension.
3. Syntax highlighting is available immediately. Parser and assembler-analysis diagnostics appear in the Problems panel as `mz80` diagnostics.
4. Labels, externs, and macro definitions/references receive semantic tokens after the language server has started.

The extension includes its own language server; a separately installed `mz80` executable is not required for editing.

## Build a project

For repeatable builds, put an `mz80.yaml` in the project root. Relative paths are resolved from the folder containing that file.

```yaml
version: 1
project:
  defaultTarget: demo

targets:
  demo:
    output: build/demo.com
    modules:
      - src/main.asm
    as:
      sym: true
      smap: true
    link:
      com: true
      sym: true
      smap: true
    debug:
      cpm: true
      cpmInteractive: true
```

Open the Command Palette and run **mz80: Build Default Target**. If a project has more than one target, the extension asks which target to build. The bundled CLI assembles each module and links the configured output; the example also emits `.sym` and `.smap` sidecar files for source-level debugging.

Additional project commands are available from the Command Palette:

- **mz80: Clean Project Outputs** removes the generated outputs declared by the project.
- **mz80: Generate Project From Makefile** derives `mz80.yaml` from a supported simple Makefile.
- **mz80: Generate Project With Folders** creates an initial project from `src/` and `build/` conventions.
- **mz80: Generate launch.json From Project** writes debug configurations for the declared targets.

When the active editor is inside a nested project, the extension looks upward for `mz80.yaml`, `Makefile`, or a `src/` directory before using the opened workspace folder.

## Debugging

The extension starts the bundled `mz80 dap` adapter. It can either launch a binary itself or attach to an existing debugger RPC endpoint.

### Launch a program directly

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

For a `.com` program, set `cpm: true`; `cpmInteractive: true` enables interactive CP/M console input. If `.sym` or `.smap` is omitted, the adapter looks for files with the same basename as `program`.

### Launch a target from `mz80.yaml`

Use the target name instead of repeating output paths:

```json
{
  "name": "MZ80 demo",
  "type": "mz80-dap",
  "request": "launch",
  "target": "demo"
}
```

The target's output, linker sidecars, CP/M options, and RPC listen address become defaults. If the configured output does not exist, the extension builds the target before debugging it.

### Attach to a running backend

```json
{
  "name": "MZ80 Attach",
  "type": "mz80-dap",
  "request": "attach",
  "connect": "127.0.0.1:4700"
}
```

Set breakpoints in `.asm` source files and start the selected configuration from Run and Debug. Adapter lifecycle and breakpoint activity are logged in the **MZ80 Debug** output channel; project build output is written to **MZ80 Build**.

Useful settings:

- `mz80.debug.cliEntry`: development-only override for the CLI entry script used by the debugger. Leave empty for the bundled CLI.

## Troubleshooting

- **No diagnostics or semantic tokens:** confirm the editor language mode is `Z80 Assembly` / `z80-asm`, then run **Developer: Reload Window**. The Problems panel shows language-server diagnostics with source `mz80`.
- **`mz80 cli not found`:** reinstall the VSIX or clear a custom `mz80.debug.cliEntry`. The normal installation resolves the CLI inside the extension; it does not use a repository checkout.
- **Build does not find inputs:** check that `mz80.yaml` is in the intended project root and that module/output paths are relative to that root.
- **Breakpoints do not resolve:** build with linker `sym: true` and `smap: true`, and ensure the binary and sidecar files match the launched program.
- **Attach cannot connect:** start the backend with the same `host:port` supplied in `connect`; the default is `127.0.0.1:4700`.

## Packaged runtime

The VSIX contains the extension plus a private `server/node_modules` runtime:

- `@mz80/lsp` for diagnostics and semantic tokens
- `@mz80/cli` for project commands and the DAP server
- public `@mz80/core`, `@mz80/assembler`, and `@mz80/c-compiler` runtime dependencies

At runtime the extension resolves these files relative to its own installation directory. It does not search the repository, a workspace, or another package's `src`/`dist` directory. `cliEntry` is an explicit debugging override only; leave it empty to use the bundled CLI.

## Build and verification

```powershell
# Build dependencies in package order, stage the runtime, and create a VSIX.
pnpm -C editor/vscode-ext run package:vsix

# From the repository root: build once, package that exact output, inspect the
# archive, then execute the bundled LSP and DAP normal-path smoke tests.
pnpm run check:vsix
```

`check:vsix` verifies the archive contains the extension entry point, grammar, LSP, CLI, DAP, and required runtime dependencies. It starts the extracted LSP for diagnostics and semantic tokens, starts an extracted DAP launch session, and then opens the extracted extension in an isolated VS Code extension host for the same normal paths.

## Development notes

- `build:full` builds toolchain packages in dependency order before staging their generated assets.
- `vscode:prepublish` only stages and compiles the extension itself; it does not rebuild other packages. This keeps VSIX packaging reproducible from one prepared build.
- The TextMate grammar is generated from the staged public assembler grammar asset, never from `packages/assembler/src`.
- Diagnostics are based on the current PEG parser and assembler analysis pipeline
- Example projects and larger fixture sets live in the separate `mega-z80-examples` repository

## Repository

- Source: [kortol/mega-z80-editor](https://github.com/kortol/mega-z80-editor)
- Issues: [GitHub Issues](https://github.com/kortol/mega-z80-editor/issues)
