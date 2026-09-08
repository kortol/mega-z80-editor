# Mega Z80 Editor

Z80 向けの assembler、SCC TypeScript C compiler、linker、debugger、CLI、VS Code extension を管理する pnpm monorepo です。

## Workspace

`pnpm-workspace.yaml` は次の workspace と native build 承認を定義します。

- `packages/*`: 公開する `@mz80/core`、`@mz80/assembler`、`@mz80/c-compiler`、`@mz80/cli`
- `editor/*`: private `@mz80/lsp` と VS Code extension
- `allowBuilds`: install 時に native build script を実行してよい依存 package の明示的な allowlist

この設定は package 検出と install の安全性に関わるため、意図を確認せず変更しません。

## Package map

| Package | Role | Dependency direction |
| --- | --- | --- |
| `@mz80/core` | REL/archive/linker、source map、I/O、protocol 非依存 debugger、共通 build contract | leaf |
| `@mz80/assembler` | PEG parser、macro、analysis、codegen、assembler language-service API | → core |
| `@mz80/c-compiler` | SCC frontend、C runtime、C-to-asm translation | → assembler, core |
| `@mz80/cli` | command、stdio/exit-code adapter、project build、DAP server | → c-compiler, assembler, core |
| `@mz80/lsp` | extension 同梱用の private LSP | → assembler |
| `editor/vscode-ext` | packaged LSP/CLI/DAP runtime の起動と接続 | public exports のみを利用 |

詳細な依存境界は [docs/package-boundaries.md](docs/package-boundaries.md) を参照してください。

## Commands

```bash
pnpm install
pnpm run build
pnpm run typecheck
pnpm run check
pnpm run mz80 -- --help
```

`pnpm run check` は build、typecheck、version/boundary checker、既存 tests、tarball clean-install、VSIX 検査を実行します。生成済み dist の再現性は、分離 worktree または CI で `pnpm run verify:dist` を実行して確認します。

## Documentation

- [Documentation map](docs/README.md)
- [Architecture and package boundaries](docs/architecture.md)
- [Assembler/linker specifications](docs/spec/README.md)
- [SCC C compiler documentation](packages/c-compiler/docs/README.md)
- [VS Code extension](editor/vscode-ext/README.md)

`docs/dev/` は履歴資料です。現行の契約には README、`docs/spec/`、各 package の docs を優先してください。
