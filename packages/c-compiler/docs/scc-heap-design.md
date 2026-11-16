# H1 Heap 基盤 — Goal と実装計画

更新日: 2026-11-17
状態: Slice 1/2/3 完了（3/3 delivery slice、100%）。

heap 専用 33 tests で両 caller ABI の CP/M 実行、high-address arena、calloc/realloc、debug、
未使用 archive 抽出、void pointer 診断を検証する。raw は application hook 経由で両 ABI の 4 API を実行。
openMSX / C-BIOS で既存 runtime 4 variant と heap 両 ABI × halt/return の 4 variant、計 8 variant が成功。
最終検証: C compiler 17 suites / 970 tests、CLI/project 関連 3 suites / 10 tests が成功。
型検査・root build・package boundary・文書リンク・差分検査が成功（2026-11-17）。
check:pack は R0 後の source layout と heap source/header/archive を確認し、tarball clean install 先でも
両 ABI の heap source を compile/link して CP/M 出力 ABC を確認した。

## Goal

CP/M・MSX BIOS・raw の full runtime に、アプリケーションが供給する単一 arena を管理する
allocator を追加する。通常の ts-internal caller と A1.1 static-frame caller の両方から、
malloc / free / calloc / realloc を使用できる状態を H1 の完了とする。

実用例は「可変長 buffer の確保→拡張→解放→再利用」。この一連の動作を実 C source から
compile・archive link・CP/M 実行して保証する。
処理時間は free block 数に依存する。再現可能な動作を目標とし、定時間や real-time 性は保証しない。

## 採用する境界

- full profile の optional archive member とし、使用しない program に arena を予約しない。
- lite は既存のまま。OS allocator、sbrk、暗黙の空き RAM 探索は使わない。
- 一つの arena、一つの実行 context を対象とする。ISR、並行呼出し、allocator 内への再入は禁止。
- 初回は C API による初期化。CLI に絶対 address を指定する機能や linker による自動 arena 配置は後続。
- heap 初期化は live allocation のない状態でのみ実行する。再初期化は全 allocation を無効化する。
- 現行 C Subset の size_t は int alias。request/arena size は正の値かつ最大 32767 bytes。
  内部計算は overflow を検査し、address 計算は unsigned 16-bit の扱いで検証する。
- main entry 前に初期化したという仮定を置かない。未初期化時の allocation は NULL。
  管理状態は BSS の初期値だけに依存せず、実行可能な初期値を持つ DATA に置く。

## Public API と挙動

標準 API は stdlib.h に宣言し、size_t を stddef.h から参照する。
void * が current parser/semantic/cast/deref path で利用可能かを最初に実行検証する。
不足があれば H1 の必要範囲で対応し、黙って char * 宣言に置き換えない。

| API | 契約 |
| --- | --- |
| int mz80_heap_init(void *base, size_t bytes) | mz80.h の拡張 API。成功 1、失敗 0。失敗時は heap を未初期化状態にする |
| void *malloc(size_t bytes) | 0、負値、上限超過、未初期化、空き不足は NULL |
| void free(void *pointer) | NULL は何もしない。有効 allocation を free list に戻す |
| void *calloc(size_t count, size_t bytes) | 積の overflow を乗算前に検査。成功時は要求 bytes をすべて 0 にする |
| void *realloc(void *pointer, size_t bytes) | NULL は malloc。size 0 は free して NULL。失敗時は元 allocation と内容を保持 |
| int mz80_heap_check(void) | debug 検査 API。初期化済みかつ arena metadata が整合していれば 1、それ以外は 0 |
| void mz80_heap_set_debug(int enabled) | debug 検査を opt-in で有効化。heap を変更しない |

realloc は最初に shrink と隣接 free block を使った in-place growth を試す。
移動する場合は新規確保成功後に min(old payload capacity, new size) を copy し、最後に旧 block を解放する。
malloc(0)、realloc(p,0) 等はこの runtime の明示方針であり、全 hosted C 実装との同一挙動を主張しない。

init は NULL、address wrap、最小 block 未満の arena を拒否する。
先頭を偶数 address に切り上げ、末尾を偶数 address に切り下げる。返却 pointer は 2-byte aligned。
arena が code/stack/別 allocation と重なることや C object の実サイズまでは検出できない。配置責任は caller にある。

## Allocator の内部構造

address 順の first-fit free list と、全 physical block を走査できる header を採用する。
各 block は 4-byte header（total size / allocation flag、next-free address）を持つ。
arena size 上限と偶数 size により、size word の下位 bit を allocation flag に使える。
next-free は 16-bit absolute address とし、NULL を終端 sentinel とする。NULL arena は初期化時に拒否する。
payload の最小容量は 2 bytes、最小 block は 6 bytes。残りが 6 bytes 未満なら split しない。

1. malloc: request を安全に偶数丸め→first-fit 探索→必要時 split→使用中 mark。
2. free: physical block 境界の pointer であることを debug 時に検査→address 順に挿入→前後と coalesce。
3. calloc: request 積の範囲検査→malloc→payload zero fill。
4. realloc: shrink / 隣接拡張→必要時 allocate-copy-free。

Slice 1 は mutation 後に physical chain を走査して address 順 free list を再構築する。
free は全 physical chain の隣接 free block を結合する。処理時間は全 block 数に依存する。
free-list の増分更新は将来の最適化として扱う。

header の読み書きは byte access または Z80 word helper を使う。C の unsigned conversion が完全対応と
いう仮定を置かず、size/address の範囲と carry を assembly で明示的に扱う。

## Debug と失敗

通常の資源不足は NULL。errno は今回導入しない。
release の invalid free / double-free / arena 外 pointer は API contract 違反であり、回復を保証しない。
debug 有効時は block chain、size/alignment、free-list cycle、free flag、pointer 境界を検査する。
検査は必ず arena 範囲内・有限回で停止し、破損 metadata を使って書込みを進めない。

debug error は mz80_heap_check の失敗または allocation/free 操作時の fail-fast とする。
fail-fast は既定で selected CRT の exit(1) を呼ぶ内部 panic routine に集約する。
custom panic hook、文字列診断、statistics UI は H2 とし、H1 は判定と安全な停止の検証までを含む。
debug flag/state も明示的 DATA 初期値を持たせる。

Slice 2 の実装は runtime flag による opt-in。既定は off。
malloc/free/realloc の開始時に flag が on なら metadata を検査し、free/realloc は live payload の
開始 address かを確認する。calloc の有効 request は malloc 経由で同じ検査を行う。
未初期化の allocation と不正 size による NULL は通常の失敗として扱う。
mz80_heap_check は常時利用可能な読み取り専用検査で、未初期化・不整合は 0、正常は 1。
free-list pointer 自体は辿らず、有限な physical block 走査の各 free block と期待される link を比較する。
最小 header size、block end の arena 内包、carry、size の範囲を確認してから次 block へ進む。
free-list cycle/範囲外 link でもその address を dereference しない。
fail-fast の exit hook が戻る platform では halt loop に入り、破損 heap 操作に復帰しない。

## ABI と artifact

allocator は既存 stack ABI の固定引数 function として実装する。全 runtime API と同じく return は HL。
static-frame caller は outbound bridge を使い、allocator 側を static-frame に再コンパイルしない。

- lib/heap.scc.asm を独立 member mz80c-heap.rel として full archive の末尾に追加する。
- runtimeLibrary.ts の member manifest と source-runtime export 一覧を同時に更新する。
- ts-static-frame の bridge allowlist に heap API と mz80 拡張 API を追加する。
- bridge 名と header/runtime export の整合テストを追加する。
- pointer/size 引数の並びを assembly test で固定し、calloc/realloc の 2 引数実行で保証する。

## 詳細タスクと提供単位

### Slice 1 — 使用可能な allocator

- [x] void *、size_t、global char arena、pointer cast の source-path probe を用意する。
- [x] arena の init/invalid-init/DATA state/2-byte alignment を実装する。
- [x] header/free list、malloc、free、split、前後 coalesce を実装する。
- [x] header、manifest、full artifact、static-frame bridge を同時に接続する。
- [x] CP/M で確保→書込み→解放→再利用を両 ABI から実行する。

void pointer の parser/cast/type model を追加し、object-pointer との変換を実行検証する。
A1.1 は global scalar-element arena の参照を許可する。automatic array frame の拒否は維持する。
test program の条件分岐には test-only comparison helper を link する（現行 CRT に比較 helper がないため）。

この slice が終わるまで API 宣言のみで対応済みとしない。

### Slice 2 — 4 API と debug contract

- [x] calloc の積 overflow / zero fill を実装する。
- [x] realloc の shrink / in-place growth / move / failure atomicity を実装する。
- [x] heap_check、debug mode、invalid free/double-free/metadata corruption の fail-fast を実装する。
- [x] boundary/exhaustion/fragmentation/odd-size/canary の CP/M テストを追加する。
- [x] high-address arena と address wrap を独立ケースで検証する。

CP/M の fail-fast は終了だけでなく exit の stack argument が 1 であることを検証する。
realloc の 6-byte split 境界は明示 alignment した arena で確認する。

### Slice 3 — Platform と配布・完了証跡

- [x] raw hook test で同じ arena/API が固定 I/O address なしで動くことを保証する。
- [x] MSX CRT と full archive の link smoke を実行し、openMSX 実行可否は別途記録する。
- [x] 使用時のみ heap member を抽出し、未使用時に heap storage/export が link されないことを検証する。
- [x] 生成 dist、package assets、runtime guide、ABI design、Feature Plan を同期する。
- [x] 型検査・build・C compiler 全 test・CLI/project test・package boundary・文書リンク・packaged asset 検査を通す。

MSX heap smoke は TEXT=4030H、DATA=C000H、BSS=C100H とし、ROM entry の test startup が
allocator の zero-initialized DATA を RAM に初期化してから CRT を起動する。
一般の ROM DATA-copy startup 自動生成は T3 の対象で、H1 は writable arena / allocator state を前提とする。

## 完了判定と進捗率

H1 の母数は上記 3 slice。各 slice は実装・実行・配布証跡が揃った時点でのみ完了とする。
現在は 3/3、100%。宣言・compile-only を runtime-pass と数えず、上記の実行・配布証跡で完了を判定した。
4 API、arena API、debug contract、両 caller ABI、CP/M/raw evidence と配布 artifact が揃い、完了条件を達成した。
openMSX local-required 検証も両 ABI × halt/return で実行済み（2026-11-17）。

CLI/linker arena 自動配置、複数 arena、thread/ISR 対応、statistics、pool allocator は H1 の分母外。
qsort/bsearch は heap を必須としないため、H1 への依存を固定せず comparator ABI の作業として別途選定する。
