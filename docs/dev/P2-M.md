# 🧩 P2-M フェーズ仕様書 - sjasm/m80 互換疑似命令拡張

---

## 🎯 フェーズ目的

P2-M の目的は、未定義だった sjasm/m80 互換の疑似命令を実装し、PEG 単一路線のまま互換入力の受理範囲を広げること。
特に P2-M では **文法再現（受理互換）を優先** し、意味論が重い項目は簡易実装を許容する。

対象疑似命令:

- `DEFL`
- `DEFM`
- `DC`
- `IFDEF`
- `IFNDEF`
- `IFB`
- `IFNB`
- `IFDIF`
- `EXITM`
- `GLOBAL`
- `LOCAL`
- `ASEG`
- `CSEG`
- `DSEG`
- `TITLE`
- `PAGE`
- `LIST`
- `COMMON`
- `EXTERNAL`
- `EXT`

保留（P2-M対象外）:

- `MODULE`
- `INCBIN`

---

## 🧭 スコープ

### In Scope

- PEG 文法で上記疑似命令を正式受理
- `pegAdapter` で NodePseudo へ正規化
- pseudo/conditional/macro フェーズで意味処理
- `.rel/.lst` 生成への必要な最小限の反映
- 互換テスト（unit + fixture）追加

### Out of Scope

- sjasm/m80 完全互換（全スイッチ・全疑似命令）
- リンカフォーマットの全面刷新
- CPUモード切替（8080/Z80）などの新CLI仕様

---

## 🏗 設計方針

1. **Compatibility-First**
- parser で受理し、意味処理は pseudo/conditional/macro で行う
- 未実装機能は「構文エラー」ではなく明確な診断で落とす

2. **正規化中心**
- 可能なものは既存疑似命令へ正規化して再利用する
- 新規命令でも Node 形状は `NodePseudo` のまま維持

3. **段階導入**
- P2-M では最小互換意味論を優先
- 高度互換（出力形式差異や詳細な listing 制御）は後続で拡張可能にする

4. **M80優先・SjASM補完**
- 意味論は M80 仕様を第一基準にする
- M80で不明瞭/未規定の箇所のみ SjASM/SjASMPlus 互換で補完する

5. **文法再現優先**
- P2-M は「まず通ること」を優先し、対象疑似命令の構文受理を先に達成する
- 意味論が重い機能は P2-M では簡易実装として導入し、ドキュメントに明記する

---

## 📐 命令別仕様（確定）

| 疑似命令 | 仕様カテゴリ | P2-M での意味 |
| --- | --- | --- |
| `DEFL` | 定数定義 | `SET` のエイリアス。再代入可能 CONST として扱う |
| `DEFM` | データ定義 | `DB` 互換。文字列は生バイト列、式は 8-bit 値として格納 |
| `DC` | データ定義 | M80互換: 文字列終端文字（各文字列要素の最後の1文字）に bit7 を立てて出力 |
| `IFDEF` | 条件分岐 | シンボルが定義済み（`symbols` または `externs`）なら真 |
| `IFNDEF` | 条件分岐 | `IFDEF` の否定 |
| `IFB` | 条件分岐 | M80互換: `<text>` 引数が空なら真 |
| `IFNB` | 条件分岐 | M80互換: `<text>` 引数が空でなければ真 |
| `IFDIF` | 条件分岐 | M80互換: 2つのテキスト引数を比較し不一致なら真（`IFIDN` の否定） |
| `EXITM` | マクロ制御 | 現在のマクロ展開を即終了。マクロ外ではエラー |
| `GLOBAL` | 可視性宣言 | シンボルを公開候補として登録（PUBLIC相当） |
| `LOCAL` | マクロ制御 | M80互換: マクロ内ローカルダミー変数宣言（シンボル可視性は制御しない） |
| `ASEG` | セグメント制御 | `SECTION .aseg` へ正規化（kind=`CUSTOM`） |
| `CSEG` | セグメント制御 | `SECTION TEXT` へ正規化 |
| `DSEG` | セグメント制御 | `SECTION DATA` へ正規化 |
| `TITLE` | listing制御 | モジュール listing タイトルとして保持（コード生成に影響なし） |
| `PAGE` | listing制御 | listing 改ページ設定として保持（コード生成に影響なし） |
| `LIST` | listing制御 | listing 出力有効化フラグを制御（既定 ON） |
| `COMMON` | セグメント互換 | M80系COMMON互換の最小実装。まず `SECTION COMMON` 相当へ正規化し、属性差分は診断で明示 |
| `EXTERNAL` | 外部参照宣言 | `EXTERN` のエイリアス |
| `EXT` | 外部参照宣言 | `EXTERN` のエイリアス |

---

## 🧩 正規化ルール

### 1. データ系

- `DEFL name, expr` / `name DEFL expr` は `SET(name, expr)` に正規化
- `DEFM args...` は `DB args...` に正規化
- `DC args...` は専用ノード（または `DB` + `dcMode`）として保持し、最終文字bit7立てを適用

### 2. 条件系

- `IFDIF a,b` は `IFIDN` と同等の比較器を再利用しつつ結果反転
- `IFB/IFNB` は `<text>` 入力を空判定する専用パーサ/評価器を追加
- `IFDEF/IFNDEF` はシンボル定義有無で判定

### 3. セグメント系

- `CSEG` -> `SECTION TEXT`
- `DSEG` -> `SECTION DATA`
- `ASEG` -> `SECTION .aseg`
- `COMMON` -> `SECTION COMMON`

### 4. 外部参照系

- `EXTERNAL` -> `EXTERN`
- `EXT` -> `EXTERN`

---

## 🪶 簡易実装として扱う項目（P2-M明記）

以下は P2-M では「文法再現優先」のため簡易実装とする。

- `COMMON`: 単純に `SECTION COMMON` 相当へ寄せる（属性/細分化は未対応）
- `LIST/PAGE/TITLE`: 状態保持中心。完全な listing 制御互換は未対応
- `ASEG`: セクション正規化ベース。絶対配置の厳密互換は未対応
- `IFB/IFNB/IFDIF`: M80形式を優先しつつ、内部は共通比較器で最小実装

---

## 🧠 フェーズ責務

### Parser / PEG

- 新疑似命令を `Directive` として定義
- 既存の `keyword` リストへ追加
- `IFB/IFNB` は M80互換の `<text>` 形式を受理（必要に応じて互換拡張で通常引数も許容）
- `IFDIF` は2つのテキスト引数形式を受理
- `LIST/PAGE/TITLE` は引数可変なので raw 引数許容ルールを持つ
- `EXTERNAL/EXT` は `EXTERN` と同一引数形式を受理
- `COMMON` は単独指定を受理（将来拡張でサイズ/名前引数を検討）
- `LOCAL` はマクロ文脈専用として受理（非マクロ文脈では意味エラー）

### pegAdapter

- 新 directive AST を `NodePseudo` に変換
- 上記正規化をここで実施（`DEFM`→`DB`, `DEFL`→`SET`, `CSEG/DSEG/ASEG`→`SECTION`, `EXTERNAL/EXT`→`EXTERN`）
- `DC` は通常 `DB` と分離した意味フラグを保持

### pseudo handler

- `handlePseudo()` に新 op 分岐追加
- `GLOBAL/EXTERNAL/EXT/COMMON` と listing 制御用の context 更新を追加
- `DC` 出力時に各文字列要素の終端文字bit7立てを適用

### conditional handler

- `isConditionalOp()` に `IFDEF/IFNDEF/IFB/IFNB/IFDIF` を追加
- 真偽評価器を追加

### macro handler

- `EXITM` を展開時制御命令として扱う
- 現在展開中フレームに `breakFlag` を立て、当該マクロ展開を打ち切る
- `LOCAL` をマクロローカル名展開ルールとして実装

---

## 🗃 Context 拡張仕様

`AsmContext` に以下を追加する。

- `exportSymbols: Set<string>` (`GLOBAL`)
- `listingControl: { enabled: boolean; title?: string; page?: number }` (`LIST/TITLE/PAGE`)
- `macroLocalPool` 系の一時構造（`LOCAL` 展開用）

ルール:

- `GLOBAL` は公開シンボル候補として扱う
- `LOCAL` は可視性ではなく、マクロ内のローカルラベル展開にのみ影響

---

## ⚠️ 診断仕様

追加する代表診断:

- `EXITM outside macro`
- `IFDEF/IFNDEF requires symbol`
- `IFB/IFNB requires <text>`
- `IFDIF requires 2 args`
- `PAGE requires positive integer`
- `GLOBAL requires symbol list`
- `LOCAL outside macro`
- `COMMON mode not fully compatible (P2-M minimal mode)`

方針:

- 構文は可能な限り受理
- 意味不正は行位置つきエラーで報告

---

## 🧪 テスト計画

### Unit

- `pseudo/declarative`: `DEFL`, `DEFM`, `DC`
- `pseudo/conditional`: `IFDEF`, `IFNDEF`, `IFB`, `IFNB`, `IFDIF`
- `macro`: `EXITM` の早期終了
- `macro`: `LOCAL` のローカル名展開
- `pseudo/segment`: `ASEG/CSEG/DSEG` 正規化
- `pseudo/listing`: `TITLE/PAGE/LIST` の状態反映
- `pseudo/visibility`: `GLOBAL` と `EXTERNAL/EXT`

### Integration

- 既存 fixture + 互換追加 fixture で `runPegSource` / `runPegFile` 回帰
- `.lst/.sym/.rel` 出力差分確認

---

## ⚙️ 実装タスク

| No | タスク | 内容 |
| --- | --- | --- |
| P2-M-01 | Grammar拡張 | `z80_assembler.pegjs` に対象疑似命令を追加 |
| P2-M-02 | Adapter正規化 | `pegAdapter` で新命令を NodePseudo 化＋正規化 |
| P2-M-03 | Conditional拡張 | `IFDEF/IFNDEF/IFB/IFNB/IFDIF` 評価追加 |
| P2-M-04 | Macro制御 | `EXITM` 実装（展開停止） |
| P2-M-05 | Symbol可視性 | `GLOBAL` を context と rel/sym 出力へ反映 |
| P2-M-06 | Segment alias | `ASEG/CSEG/DSEG` 実装 |
| P2-M-07 | Listing制御 | `TITLE/PAGE/LIST` の保持と listing 反映 |
| P2-M-08 | 回帰整備 | unit/integration fixture を追加し all green 化 |
| P2-M-09 | 外部参照alias | `EXTERNAL/EXT` を `EXTERN` と同等に実装 |
| P2-M-10 | COMMON最小実装 | `COMMON` を `SECTION COMMON` として実装 |
| P2-M-11 | DC特殊出力 | 文字列終端文字bit7立てを実装 |
| P2-M-12 | LOCALマクロ実装 | `LOCAL` をマクロ専用ローカル展開として実装 |

---

## ✅ 完了条件（DoD）

1. 対象20疑似命令が PEG で受理される（文法再現優先、`LOCAL` はマクロ文脈で意味有効）
2. P2-M 仕様どおりに pseudo/conditional/macro で意味処理される
3. 主要回帰テストが通る
4. `packages/cli/docs/peg-compat-cases.md` に対応状況が反映される
5. CLI 実行で `.rel/.lst/.sym` が生成可能
6. 簡易実装項目が本書に明記され、未対応範囲が診断または注記で追跡可能

---

## 🔭 後続拡張（P2-N以降）

- `PUBLIC` を含む可視性完全互換の強化
- `LIST` の細粒度制御（範囲ON/OFF、擬似行抑止）
- `ASEG` の絶対配置互換（より厳密なオブジェクト意味論）
- `COMMON` の多領域・属性付き互換
- 保留項目の `MODULE` / `INCBIN` 実装
