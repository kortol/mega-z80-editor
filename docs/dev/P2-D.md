# 🧩 **P2-D フェーズ仕様書 ― INCLUDE／マルチレベル対応＋LST整形仕様（完全版）**

---

## 🎯 **フェーズ目的**

P2-Cで確立した「フェーズ一元管理」と「emit安全化」を基盤として、
**複数の `.inc` ファイルを安全に展開・統合できるアセンブル基盤**を実現する。

さらに `.lst` 出力を **構造化・可読化（v2フォーマット）** し、
人間が理解できる階層的リスト出力を正式採用する。

---

## 🧱 **1. 主な開発軸**

| 軸             | 目的                               | 担当フェーズ        |
| ------------- | -------------------------------- | ------------- |
| **INCLUDE展開** | `INCLUDE "path/file.inc"` の解析・展開 | parse／analyze |
| **スタック管理**    | `ctx.includeStack` によるネスト追跡      | analyze       |
| **行番号追跡**     | `.lst`／`.sym` に正確なファイル名＋行番号を反映   | emit          |
| **セクション継承**   | INCLUDE中の `.data` 等切替を復帰可能に      | emit          |
| **循環・重複防止**   | 同一ファイルの多重include／循環includeを検出    | analyze       |
| **LST整形仕様**   | `.lst v2` フォーマットを正式採用            | emit          |

---

## ⚙️ **2. 実装タスク一覧**

| No      | タスク                          | 内容                             |
| ------- | ---------------------------- | ------------------------------ |
| P2-D-01 | `parseIncludeDirective()` 実装 | INCLUDE構文解析                    |
| P2-D-02 | `handleInclude()` 実装         | 再帰展開＋ファイルキャッシュ対応               |
| P2-D-03 | `ctx.includeStack` 構築        | push/pop＋親子追跡                  |
| P2-D-04 | `resolveIncludePath()` 実装    | INCLUDEPATH探索＋正規化              |
| P2-D-05 | 循環／重複include検出               | `ctx.includeCache` による検出       |
| P2-D-06 | `.lst` 出力拡張                  | v2形式（セクション／行番号／include境界）      |
| P2-D-07 | `.sym` 出力拡張                  | シンボル定義元ファイル名付与                 |
| P2-D-08 | セクション復帰ロジック                  | `sectionStack`導入               |
| P2-D-09 | テスト追加                        | `tests/pseudo/include.test.ts` |
| P2-D-10 | regression確認                 | P1〜P2-C全テスト通過確認                |

---

## 🧩 **3. INCLUDE管理構造**

```ts
export interface IncludeFrame {
  file: string;
  dir: string;
  parent?: string;
  lineOffset: number;
  sectionBefore: string;
}

export interface AsmContext {
  includeStack: IncludeFrame[];
  fileMap: Map<string, { lines: string[]; baseLine: number }>;
  includeCache: Set<string>;
  sectionStack: string[];
}
```

### 🧠 運用仕様

| 項目             | 内容                               |
| -------------- | -------------------------------- |
| INCLUDE展開タイミング | parseでASTノード作成 → analyzeで再帰展開    |
| セクション復帰        | include push時に現セクション保存 → pop時に復帰 |
| 循環検出           | `fs.realpathSync()` による正規化パス比較   |
| EQUスコープ        | 全INCLUDE共通（グローバル登録）              |
| MACROスコープ      | Stage1以降でローカル対応予定（P2-L）          |

---

## 🧠 **4. 想定テストケース**

| テスト名                    | 内容                            | 期待結果               |
| ----------------------- | ----------------------------- | ------------------ |
| basic include           | 単一INCLUDE展開                   | `.lst` に両方の行が出力される |
| nested include          | 3階層ネスト                        | スタック復帰が正しい         |
| duplicate include       | 同一ファイル2回                      | 2回目スキップ＋警告         |
| circular include        | A→B→A                         | 循環include検出エラー     |
| include with section    | include中に`.data`              | セクション復帰が正しい        |
| include boundary in LST | `;#include "vars.inc"` が挿入される | `.lst`内トレース可       |

---

## 🧩 **5. `.lst v2` 整形仕様（正式採用）**

### 🎯 目的

`.lst` 出力の可読性・解析性を高め、**構造化フォーマット**として正式採用する。

---

### 🗂 1. 出力対象と順序

| 区分   | 内容                                           |
| ---- | -------------------------------------------- |
| 出力対象 | `.text`, `.data`, `.bss` 各セクション内の命令・疑似命令・ラベル |
| 出力順序 | セクション単位 → アドレス昇順 → ラベル／命令／データの階層順            |

---

### 🔹 フォーマット定義

#### (1) セクション見出し

```
; --- SECTION: .text ---
```

#### (2) ラベル行

```
0000               VAR1:
```

#### (3) 命令行・データ行

```
0000  3E 00            LD A,0
0002  11 11            DEFW 1111H
```

#### (4) DS命令（複数行）

```
0000  00 00 00 00      DS 16
      00 00 00 00
      00 00 00 00
      00 00 00 00
```

#### (5) INCLUDE境界

```
;#include "vars.inc" (from main.asm line 42)
```

---

### 🔹 DS・ALIGNなど非データ行

実データを持たない疑似命令（EQU, ORG, ALIGN）は以下形式：

```
0000                    ALIGN 8
```

---

## ⚙️ **6. 出力処理仕様**

### 対象モジュール

`src/assembler/output/listing.ts`

### 関数構成

| 関数                     | 役割        |
| ---------------------- | --------- |
| `writeLstFileV2()`     | 新フォーマット本体 |
| `writeDumpLine()`      | ダンプ行整形    |
| `writeLstFileLegacy()` | 従来形式（互換用） |

---

### 🔧 `writeDumpLine()` 実装抜粋

```ts
function writeDumpLine(addr: number, bytes: number[], text?: string) {
  if (bytes.length === 0) {
    return `${addr.toString(16).padStart(4, "0").toUpperCase()}                ${text ?? ""}`;
  }
  const hex = bytes.map(b => b.toString(16).padStart(2, "0").toUpperCase());
  const lines: string[] = [];
  for (let i = 0; i < hex.length; i += 4) {
    const chunk = hex.slice(i, i + 4).join(" ").padEnd(11, " ");
    const addrStr = i === 0 ? addr.toString(16).padStart(4, "0").toUpperCase() : "    ";
    const opText = i === 0 ? `  ${text ?? ""}` : "";
    lines.push(`${addrStr}  ${chunk}${opText}`);
  }
  return lines.join("\n");
}
```

---

## 💡 **7. 出力例**

### ソース

```asm
SECTION TEXT
    LD A,0
    LD B,1
SECTION DATA
VAR1: DEFW 1111H
VAR2: DEFW 2222H
SECTION BSS
BUF:  DS 16
END
```

### 出力

```
; --- SECTION: .text ---
0000  3E 00            LD A,0
0002  06 01            LD B,1

; --- SECTION: .data ---
0000               VAR1:
0000  11 11            DEFW 1111H
0002               VAR2:
0002  22 22            DEFW 2222H

; --- SECTION: .bss ---
0000               BUF:
0000  00 00 00 00      DS 16
      00 00 00 00
      00 00 00 00
      00 00 00 00
```

---

## 🧭 **8. CLI互換・切替仕様**

| 項目    | 内容                            |         |
| ----- | ----------------------------- | ------- |
| オプション | `--lst-style=legacy           | modern` |
| デフォルト | `modern`（新仕様）                 |         |
| 優先順位  | CLI > AssemblerOption > デフォルト |         |
| 互換性   | legacyモードでP1-Fまでのテスト資産を維持     |         |

---

## 🏁 **9. 完了条件**

| 項目         | 判定基準                     |
| ---------- | ------------------------ |
| INCLUDE展開  | ネスト／循環／重複の全ケース通過         |
| `.lst` 出力  | v2整形＋include境界出力が正確      |
| `.sym` 出力  | 定義元ファイルが付与される            |
| セクション復帰    | include復帰後にloc一致         |
| regression | P1〜P2-C全テスト通過（All Green） |

---

## 🔮 **10. 次フェーズ展望（P2-L以降）**

| フェーズ | 主題                    | 継承対象                |
| ---- | --------------------- | ------------------- |
| P2-L | Macro Stage1（引数なしマクロ） | include展開済ASTを入力とする |
| P2-F | AST/IR統合 + Encoder整理  | emit統合構造をASTレベルで再構築 |

---

✅ **結論：**

* `.lst v2` を正式採用（`writeLstFileV2()` 実装）
* INCLUDE展開・循環防止・セクション復帰を同時実装
* P2-D完了後、マクロ処理（P2-L）に直接接続可能な安定基盤が完成する。

