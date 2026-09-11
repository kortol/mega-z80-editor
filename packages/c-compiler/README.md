# `@mz80/c-compiler`

SCC TypeScript C compiler、bundled C runtime、C-to-assembler translation を提供します。

## Owns

- SCC frontend と semantic/lowering pipeline
- `TsSccCompiler` / compiler adapter
- bundled CP/M、MSX BIOS、raw runtime assets と bundled headers
- C subset、ABI、array design の一次 documentation

この package は `@mz80/assembler` と `@mz80/core` の公開 API にだけ依存します。CLI compatibility や DAP は `@mz80/cli` の責務です。

## Public API

アプリケーションからは file-oriented `compileCFile`、または source-oriented
`compileCSource` を利用できます。どちらも `@mz80/core` の公開 `Logger` と
出力用の `tempDir` を受け取り、REL 出力を返します。SCC frontend の AST、parser
option、内部 diagnostic 実装には依存しません。

```ts
import { createLogger } from "@mz80/core";
import { compileCSource } from "@mz80/c-compiler";

const result = compileCSource(createLogger("normal", "example"), {
  source: "int main(void) { return 0; }\n",
  tempDir: "./.tmp/mz80-c",
});
```

## Development

```bash
pnpm --filter @mz80/c-compiler run build
pnpm --filter @mz80/c-compiler run test
```

## Runtime

`cc.runtime` または `mz80 cc` の `--runtime-platform`、
`--runtime-profile`、`--runtime-exit` で bundled runtime を選択できる。
対象 platform は `cpm`、`msx-bios`、`raw`、profile は `lite` と `full` である。構造化 runtime は
package 同梱の prebuilt CRT REL と、full profile 用 `MZ80AR1` archive を link する。
既存の `cpmcrt` / `cpmlibc` runtime name は互換 alias として残る。

`lite` は startup、終了、文字 I/O を提供する。`full` はこれに `<string.h>`、ASCII `<ctype.h>`、
限定 `<stdio.h>` format、`<stdlib.h>` subset を加える。bundled headers は `<assert.h>`、`<ctype.h>`、
`<stddef.h>`、`<stdarg.h>`、`<stdio.h>`、`<stdlib.h>`、`<string.h>`、`<mz80.h>` である。
`<stdarg.h>` は TS SCC の internal variadic ABI 専用で、external Z80SCC variadic ABI とは互換でない。

設定、bundled header、raw hook、MSX exit mode の詳細は
[docs/scc-runtime-guide.md](docs/scc-runtime-guide.md) を参照してください。

その他の仕様は [docs/README.md](docs/README.md) を参照してください。
