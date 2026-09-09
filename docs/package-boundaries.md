# Package boundaries

この文書は monorepo の所有権と import 境界の一次資料です。

## Allowed dependencies

```text
cli → c-compiler → assembler → core
cli → assembler, core
c-compiler → core
lsp → assembler
```

`core` から toolchain package への依存、assembler から C compiler/CLI/LSP への依存、C compiler から CLI/LSP への依存は禁止です。`import type` も同じ方向制約に従います。

## Public APIs

- `@mz80/core`: language 非依存の build contract と core runtime API
- `@mz80/assembler`: assemble API、公開 diagnostics、language-service API
- `@mz80/c-compiler`: compile API、runtime lookup、公開 diagnostics
- `@mz80/cli`: `mz80` executable と CLI adapter

LSP は private package で registry 公開しません。VS Code extension は bundled runtime の起動・接続だけを担当します。

## Enforcement

- `pnpm run check:boundaries`: manifest、通常 import、`import type`、relative/deep/subpath import を静的検査
- `pnpm run check:versions`: version、publish metadata、exports/types/bin の build output を検査
- `pnpm run check:pack`: tarball metadata、assets、clean install を検査
- `pnpm run check:vsix`: dependency order で準備済みの成果物から VSIX を作成・展開し、同梱 runtime、LSP diagnostics/semantic tokens、CLI DAP launch session、isolated VS Code extension host を検査
- `pnpm run verify:dist`: CI の clean checkout または linked isolated worktree だけで、明示された managed `dist` を再生成し、Git 管理済み生成物との差分を検査

VS Code extension の TypeScript source は toolchain package を import しません。配布時に `server/node_modules` へ同梱した LSP/CLI runtime を extension installation path から起動するだけで、repository、workspace、他 package の source/dist path を runtime で探索しません。

`editor/vscode-ext/tools/copy-runtime.js` だけは packaging tool として dependency order 後の各 package の `dist` を staging area へ収集します。これは extension runtime の import ではなく、VSIX を自己完結させる build-time 処理です。staging 時には内部 workspace dependency を公開 version へ正規化し、`check:vsix` が archive 内の manifest と runtime path を検査します。

`@mz80/core` の `ToolchainDrivers` contract は type/export test で `BuildStatus`、path、target、artifact、diagnostic summary、build request/result のみに固定します。AST、parser/compiler option、内部 diagnostics、language-service、DAP、VS Code、process exit-code の意味的な混入は API review とこの contract test の対象です。
