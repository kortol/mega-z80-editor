# 🧩 P1-E フェーズ要件定義書（確定版）

**― 式評価・再配置情報生成・リスト／シンボル出力 ―**
（MegaZ80Editor Assembler Core）

---

## 🎯 フェーズ目的

P1-Dで確立した式評価 (`Const` / `Reloc` / `Error`) の結果をもとに、
**再配置情報（Relocation Record）を `.rel` に出力できる完全な2パスアセンブラ**を実現する。

これにより：

* `.rel` ファイルが **リンク可能形式** として成立
* Pass1/Pass2 による **未定義シンボル再評価**
* `.lst` による **アセンブル内容の可視化**
* `.sym` による **シンボル出力**

を同時に満たす。

---

## 📘 前提（P1-D完了状態）

| 項目            | 状態        | 概要                    |
| ------------- | --------- | --------------------- |
| `evalExpr`    | ✅ 完成      | Const/Reloc/Error評価確立 |
| `.rel` 出力     | ⚙️ 部分実装   | T/Eセクションあり、Rレコード未対応   |
| `ctx.symbols` | ✅ 完備      | Pass1で登録済             |
| `ctx.externs` | ✅ 実装済     | 外部シンボル収集可能            |
| Pass構造        | ⚙️ 単一Pass | 未定義再評価未実装             |

---

## 🧠 機能要件（Functional Requirements）

---

### 1️⃣ 再配置情報（Rレコード）生成

**目的**
`resolveExpr16()` が `Reloc` を返す場合に、`.rel` へ再配置情報を出力する。

**仕様**

* 出力形式：

  ```
  R <offset> <symbol> <addend>
  ```
* 出力例：

  ```
  R 0006 EXT_C 0000
  ```
* 出力順序：`T` → `R` → `E`
* 重複除去は行わない（全参照出力）

**対象命令例**

| 命令              | 出力内容        |
| --------------- | ----------- |
| `LD HL,(EXT16)` | R (16bit絶対) |
| `JP EXT16`      | R (16bit絶対) |
| `DEFW EXT16`    | R (16bit絶対) |

---

### 2️⃣ Pass2再評価（未定義シンボル再解決）

**目的**
Pass1で未定義のシンボルをPass2でConst化し、最終エラーを確定させる。

**仕様**

* Pass1終了後に `ctx.symbols` を保持
* Pass2開始時、式再評価を実施
* Pass2で解決したものはConst扱い（Rレコード抑止）
* 残存未定義のみ最終エラー化

---

### 3️⃣ 行番号付きエラーレポート

**目的**
エラー出力を行番号付きで人間可読にする。

**仕様**

* `makeError(code, msg, line)` 形式で登録
* 出力例：

  ```
  EA2100: Undefined symbol: TABLE (line 37)
  ```

---

### 4️⃣ `.lst`（リストファイル）出力

**目的**
アセンブル過程を行単位で出力し、Reloc状態やConst評価を可視化する。

**仕様**

| 項目                                                   | 内容                           |
| ---------------------------------------------------- | ---------------------------- |
| ファイル名                                                | `<basename>.lst`             |
| 生成条件                                                 | `--list` または `--verbose` 指定時 |
| 生成タイミング                                              | Pass2終了後                     |
| 付加情報 | `.sym`／`.rel`と整合性が取れていること |

出力形式

```
0000  21 00 12     LD HL,(EXT_A)     [Const 1234h]
0003  32 00 00     LD (EXT_B),A      [Reloc EXT_B+0]
0006  C3 00 00     JP EXT_C          [Reloc EXT_C+0]
0009  CD 00 00     CALL EXT_D        [Reloc EXT_D+0]
0010  21 00 00     DEFW EXT_C        [Reloc EXT_C+0]
0013  21 00 00     DEFW EXT_D        [Reloc EXT_D+0]
0016  21 34 12     DEFW EXT_A        [Const 1234h]

; Symbol Table
EXT_A = 1234h
START = 0000h
DATA_PTR = 0010h

; Relocation Summary
R 0003 EXT_B 0000
R 0006 EXT_C 0000
R 0009 EXT_D 0000
R 0010 EXT_C 0000
R 0013 EXT_D 0000

; Error Summary
EA2100: Undefined symbol: EXT_B (line 7)

```


---

### 5️⃣ `.sym`（シンボルファイル）出力

**目的**  
確定済みシンボルを外部ツール（リンカ・デバッガ）に提供する。

**仕様**
| 項目 | 内容 |
|------|------|
| ファイル名 | `<basename>.sym` |
| 生成条件 | `--sym` / `--list` / `--verbose` |
| 出力順 | アドレス昇順 |
| 未定義 | 出力しない（.rel で扱う） |

出力形式

```
; ==============================================================
;  Symbol File : p1e_fixture.sym
;  Generated   : Pass2
; ==============================================================
START      0000h
EXT_A      1234h
DATA_PTR   0010h
```

---

### 6️⃣ ORG / END 対応（単一セクション）

**目的**  
モジュールエントリとロードアドレスを `.rel` に反映する。

**仕様**
| 命令 | 動作 |
|------|------|
| `ORG <addr>` | `ctx.loc` を変更（セクション切替なし） |
| `END <label>` | `.rel` 末尾に `E <label>` 出力 |

**期待例**

```asm
ORG 1000h
START:
    NOP
    END START
````

→ `.rel`

```
T 1000 00
E START
```

※ 複数ORG対応はP2-A（セクション対応）にて拡張。

---

## 🧩 非機能要件（Non-Functional）

| 項目            | 要件                             |
| ------------- | ------------------------------ |
| **テストカバレッジ**  | 95%以上維持                        |
| **実行時間**      | P1-D比 ±5%以内                    |
| **出力互換性**     | `.rel` は上位互換（R追加のみ）            |
| **エラー管理**     | `AssemblerErrorCode` 準拠        |
| **ファイル文字コード** | UTF-8 (LF固定)                   |
| **リスト出力安定性**  | `.lst` / `.sym` / `.rel` の整合保証 |

---

## 🧪 テスト仕様

| テストID  | テスト内容            | 期待結果                     |
| ------ | ---------------- | ------------------------ |
| P1E-01 | `LD HL,(EXT16)`  | `.rel` に `R` 出力          |
| P1E-02 | `LD (EXT16),A`   | `.rel` に `R` 出力          |
| P1E-03 | EQU定義済みReloc抑止   | Const評価・R非出力             |
| P1E-04 | Pass2再評価         | 未定義→Const化               |
| P1E-05 | 行番号付きエラー         | 正しい行番号                   |
| P1E-06 | `.rel` 出力順序      | T→R→E                    |
| P1E-07 | `.lst` 出力        | 評価・R記載あり                 |
| P1E-08 | `.lst`↔`.rel` 整合 | R件数一致                    |
| P1E-09 | `.sym` 出力        | 定義済シンボル出力                |
| P1E-10 | `.sym` ソート順      | アドレス昇順                   |
| P1E-11 | `.sym`↔`.lst` 整合 | 値一致                      |
| P1E-12 | `ORG/END` 確認     | `.rel` Eレコード出力           |
| P1E-13 | Verbose出力        | `[Reloc ...]` 表示         |
| P1E-14 | Error Summary出力  | EXT_Bのみ最終エラー             |
| P1E-15 | ファイル出力整合         | `.rel` `.lst` `.sym` 全一致 |

---

## 🧰 実装モジュール構成

| モジュール                    | 機能                                     |
| ------------------------ | -------------------------------------- |
| `encoder/resolveExpr.ts` | Reloc返却対応                              |
| `assembler/context.ts`   | `ctx.relocs` / `ctx.lineRecords` 追加    |
| `rel/builder.ts`         | R/Eレコード出力拡張                            |
| `assembler/main.ts`      | Pass2処理／出力統合                           |
| `errors.ts`              | 行番号付きエラー生成                             |
| `assembler/listfile.ts`  | `.lst` 出力処理                            |
| `assembler/symfile.ts`   | `.sym` 出力処理                            |
| `cli/mz80-as.ts`         | CLIオプション制御（--list / --sym / --verbose） |

---

## ✅ 完了条件（Definition of Done）

* [x] `.rel` に正しい Rレコードを出力
* [x] Pass2で未定義シンボルがConst化
* [x] `.lst` に行番号・評価結果・R情報を出力
* [x] `.sym` に定義済みシンボルを出力（昇順）
* [x] `.rel` のEレコードが正しい位置に出力
* [x] `p1e_fixture.asm` がすべてのテストケースを通過
* [x] CI成功（全383テストPASS）

---

## 🧭 次フェーズ展望

| 次フェーズ    | 主題             | 関連         |
| -------- | -------------- | ---------- |
| **P1-F** | リンカPoC（.rel結合） | R/Eレコード検証  |
| **P2-A** | セクション対応（複数ORG） | Eレコード拡張    |
| **P2-B** | マクロ展開（引数なし）    | List/Sym整合 |
| **P2-D** | マルチレベルINCLUDE  | ファイル分割管理   |

