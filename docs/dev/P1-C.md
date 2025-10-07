# 🧩 P1-C 仕様書 改訂版（外部参照対応／式評価拡張）

**フェーズ名:** Phase 1-C
**目的:** 外部シンボル参照・式評価・リロケーション対応の実装と `.rel` 拡張
**完了日:** 2025-10-06
**状態:** ✅ 実装・テスト完了（Jest 380/380 PASS）

---

## 🧠 1. フェーズ概要

| 項目   | 内容                                                   |
| ---- | ---------------------------------------------------- |
| フェーズ | **P1-C (Expression & Relocation)**                   |
| 前段階  | P1-B (定数即値・式評価基礎 + EQU)                              |
| 対象範囲 | アセンブラ・リンカ・.rel フォーマット全般                              |
| 主目的  | 外部参照（EXTERN EXT）および式中定数演算を完全サポート                     |
| 成果物  | `.rel` 出力に R/X/E レコードを含む完全な中間形式                      |
| 最終確認 | `src/__tests__/integration/p1c_fixture.test.ts` 通過済み |

---

## ⚙️ 2. 実装詳細

### 2.1 `evalExpr` (式評価)

| 対応要素   | 内容                                            |
| ------ | --------------------------------------------- |
| 定数式    | 四則演算 `+ - * / %`                              |
| 符号演算   | `+n`, `-n` を許可                                |
| 括弧     | `(expr)` 再帰評価                                 |
| 内部シンボル | `FOO EQU 10` → 参照時 10 として展開                   |
| 外部シンボル | `EXT` → `{kind:"Reloc", sym:"EXT", addend:0}` |
| 外部±定数  | `EXT + 1` / `EXT - 1` → `Reloc (addend ± n)`  |
| 外部×外部  | エラー (`ExprExternArithmetic`)                  |
| 内部−外部  | エラー (`ExprConstMinusExtern`)                  |
| 定数÷0   | エラー (`ExprDivideByZero`) ＋ NaN 扱い             |
| 循環EQU  | エラー (`ExprCircularRef`)                       |
| 未定義    | `ExprUndefinedSymbol` ＋ Reloc 扱い              |

---

### 2.2 `resolveExpr8/16`

| 要素          | 内容                                                               |
| ----------- | ---------------------------------------------------------------- |
| 戻り値         | 8 bit or 16 bit 整数 （定数式なら直接）                                     |
| 外部式         | `ctx.unresolved.push({ addr, symbol, addend, size })` に登録        |
| 範囲外検出       | 8 bit : −128 〜 255／16 bit : −32768 〜 65535                       |
| strict mode | throw 例外（通常は警告に留める）                                              |
| 例外コード       | `ExprNotConstant`, `ExprExternArithmetic`, `ExprDivideByZero` など |

---

### 2.3 `.rel` フォーマット（P1-C版）

| 種別    | 構文                         | 意味                      |
| ----- | -------------------------- | ----------------------- |
| **H** | `H <module>`               | モジュール名ヘッダ               |
| **T** | `T <addr> <byte> ...`      | 機械語テキスト                 |
| **S** | `S <symbol> <addr>`        | 内部シンボル定義                |
| **R** | `R <addr> <symbol±addend>` | 外部参照（サイズ自動: DB→1, DW→2） |
| **X** | `X <symbol>`               | EXTERN 宣言一覧             |
| **E** | `E <entry>`                | エントリポイント（自動補完対応）        |

---

### 2.4 `.rel` ビルダー（`buildRelFile`）

* `ctx.unresolved` → `R` レコード化
* `ctx.externs` → `X` レコード化
* `ctx.entry == undefined` の場合でも `ctx.origin` を `E` 補完
* 出力順序固定: `H → T → S → R → X → E`

---

### 2.5 `.rel` パーサ（`parseRelFile`）

| レコード      | 動作                         |
| --------- | -------------------------- |
| `H/T/S/R` | 既存どおり                      |
| `X`       | `mod.externs.push(symbol)` |
| `E`       | `mod.entry = addr`         |
| 未知行       | throw Error                |

---

### 2.6 リンカ（`linkModules`）

| ステップ       | 内容                                        |
| ---------- | ----------------------------------------- |
| **Pass 1** | シンボル収集 ＋ `externs` を仮登録 (addr = 0)        |
| **Pass 2** | T レコード展開・アドレス重複検査                         |
| **R 適用**   | `splitSymAddend()` で `EXT+1` 等を解析し、加算して書込 |
| **出力**     | `.bin` に展開 (16 bit 書込統一)                  |
| **entry**  | 最初の `E` または自動補完 `origin` を採用              |

---

## 🧪 3. テスト仕様

### 3.1 主要ユニットテスト

| ファイル                  | 概要                                          |
| --------------------- | ------------------------------------------- |
| `evalExpr.test.ts`    | 定数・外部・算術・除算ゼロ・循環参照                          |
| `resolveExpr.test.ts` | 外部参照単独／±定数／内部-外部混在／範囲外検出                    |
| `builder.test.ts`     | H/T/S/R/X/E 各種レコード整合性                       |
| `rel.test.ts`         | E 補完ロジック確認                                  |
| `p1c_fixture.test.ts` | `.asm` → `.rel` → `.bin` 統合フロー（外部 EXT 参照含む） |

### 3.2 統合フィクスチャ例

```asm
        ORG 0x0100+0x20         ; -> 0x0120

START:  LD A,1+2*3              ; 7
        LD HL,L1+10
        ADD A,100/2             ; 50
        XOR 1+2+4               ; 7
        SUB 300                 ; overflow(0x2C)

L1:     DB 1+2,3*4
        DW 100+20,200-50

FOO     EQU 200
BAR     EQU 100
        DW FOO-BAR              ; 100

        EXTERN EXT
        ORG 0x2000
        DB EXT+1
        DW EXT-1
```

結果 `p1c_fixture.rel` :

```
H P1C_FIXTURE
T 0120 3E 07
...
S START 0120
S L1 012B
S FOO 00C8
S BAR 0064
R 2000 EXT+1
R 2001 EXT-1
X EXT
E 0120
```

---

## 📘 4. エラーコード一覧（抜粋）

| コード                    | 意味                 |
| ---------------------- | ------------------ |
| `ExprNaN`              | 計算不能（0除算以外）        |
| `ExprDivideByZero`     | 0 除算               |
| `ExprUndefinedSymbol`  | 未定義シンボル            |
| `ExprCircularRef`      | EQU 循環参照           |
| `ExprExternArithmetic` | 外部同士演算             |
| `ExprConstMinusExtern` | const − extern 不許可 |
| `ExprNotConstant`      | 非定数式（即値不可）         |

---

## 📄 5. `.rel` → `.bin` リンク後出力例

```text
Linked 1 modules → p1c_fixture.bin  
Segment bank=0 kind=text range=120h..2002h size=7907  
Entry point: 120h
```

---

## 🧩 6. P1-C 完了条件チェック

| 区分                 | 状況   |
| ------------------ | ---- |
| 実装／単体テスト           | ✅ 完了 |
| 統合テスト（p1c_fixture） | ✅ 完了 |
| `.rel` 仕様確定        | ✅ 完了 |
| E 自動補完実装           | ✅ 完了 |
| Notion/Docs 反映     | ⏳ 保留 |
| テストマトリクス更新         | ⏳ 保留 |

---

## 🔜 7. 次フェーズ（P2）予告

| 項目   | 内容                                         |
| ---- | ------------------------------------------ |
| P2-A | **セクション分離 (.code/.data/.bss)** ＋ `.rel` 拡張 |
| P2-B | **モジュール間リンク／バンク対応**                        |
| P2-C | **L80互換リンカ形式出力 (ABS/REL選択)**               |
| P2-D | **アセンブルリスト & シンボルマップ生成**                   |

---

✅ **P1-C フェーズは技術的実装を完了し、残タスクはドキュメント整備のみ。**
（このMarkdownを `docs/specs/P1-C.md` へ配置して正式確定版とします）

