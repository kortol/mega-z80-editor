# SCC CP/M Library

`@mz80/cli` では、Z80SCC の Small-C library を `mz80` の archive library として扱えます。

対象の流れ:

1. `dcpp` で `.C` を前処理
2. `sccz80` で SCC/ASxxxx 形式の `.asm` を生成
3. `mz80 scc-asm` 相当の変換で `mz80 as` 向けへ変換
4. `mz80 as` で `.rel`
5. `mz80 ar` で `.lib`

## Runtime

CP/M 向け bundled runtime は 2 種類あります。

- `cpmcrt`
  - `putchar`, `getchar`, `puts`, `outstr` まで runtime 側で持つ最小実行環境
- `cpmlibc`
  - `fgetc`, `fputc`, `exit` と SCC helper だけを持つ library 併用向け runtime

Small-C の `LIB/*.C` を併用する場合は `cpmlibc` を使います。

## Building `libcpm-stdio.lib`

前提:

- `C:\Workspace\work\mega-z80-examples\Z80SCC\bin\dcpp`
- `C:\Workspace\work\mega-z80-examples\Z80SCC\bin\sccz80`
- `C:\Workspace\work\mega-z80-examples\Z80SCC\LIB`
- `C:\Workspace\work\mega-z80-examples\Z80SCC\INCLUDE`

Windows から WSL 上のツールを呼ぶ例:

```bash
mz80 scc-lib build/libcpm-stdio.lib C:/Workspace/work/mega-z80-examples/Z80SCC/LIB \
  --preset cpm-stdio \
  -I C:/Workspace/work/mega-z80-examples/Z80SCC/INCLUDE \
  --wsl \
  --dcpp /mnt/c/Workspace/work/mega-z80-examples/Z80SCC/bin/dcpp \
  --sccz80 /mnt/c/Workspace/work/mega-z80-examples/Z80SCC/bin/sccz80
```

`cpm-stdio` preset は現状これを含みます。

- `CHARCLAS.C`
- `FGETS.C`
- `FPUTS.C`
- `GETCHAR.C`
- `GETS.C`
- `PUTCHAR.C`
- `PUTS.C`
- `STRLEN.C`

`PRINTN.C` は算術 helper を追加で要するため、まだ preset に含めていません。

## Project Config

`mz80.yaml` で runtime と library を target に直接書けます。

```yaml
targets:
  demo:
    output: build/demo.com
    runtime: cpmlibc
    libraries:
      - build/libcpm-stdio.lib
    link:
      com: true
      orgText: 0x0100
    modules:
      - src/main.asm
```

この設定では `mz80 build demo` が次を行います。

1. `cpmlibc.scc.asm` を bundled runtime から生成
2. `cpmlibc.asm` へ変換
3. `cpmlibc.rel` を assemble
4. target module を assemble
5. `cpmlibc.rel + target modules + libraries` を link

## Notes

- `scc-lib --wsl` は include directory の case 差を吸収するため、小文字 include shadow を一時生成します
- Z80SCC の `stdio.h` / `ctype.h` は大文字ファイル名なので、WSL ではこの処理が必要です
- `fputc` の呼び順は Small-C library に合わせて `fputc(ch, fp)` 前提です
