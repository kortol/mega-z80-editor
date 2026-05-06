# 📘 Expression & Value Specification

*(mz80-as Expression / Literal Contract – Parser-independent)*

- Status: current reference
- Audience: parser / analyze / emit contributors
- Related:
  - `parser-contract-spec.md`
  - `analyze-phase-spec.md`
  - `relocation-spec.md`

---

## 1. 目的と位置づけ

本 Spec は、mz80-as における **式（Expression）と値（Value）の意味論・許容範囲・解釈規則**を定義する。

```
Parser (PEG / legacy)
   └─ 式を「文字列表現」として Node に格納
Analyze
   └─ 文字列表現 → 値へ評価
Emit / Link
   └─ 評価結果を使用
```

* **Parser は式を理解しない**
* **Analyze が唯一の評価者**
* 本 Spec は **PEG 文法を規定しない**

### この Spec が決めること

- Node に載る式文字列の扱い
- Analyze で許容される literal / operator / value の意味
- extern を含む式が relocation へ落ちる条件

### この Spec が決めないこと

- parser の具体的な tokenization / grammar
- macro 展開の実装
- linker の最終バイナリ形式

---

## 2. 基本原則（最重要）

### 2.1 Expression は「文字列」である

* Node に格納される式は **常に string**
* AST / 数値 / トークン列を混入してはならない

```ts
// OK
operands: ["LABEL+4"]

// NG
operands: [{ type: "add", ... }]
operands: [0x100]
```

👉 **構文実装の自由度を最大化するための原則**

---

### 2.2 Value は Analyze の結果である

* Value は Evaluate 結果として生成される
* Parser / Macro フェーズでは存在しない

---

## 3. Expression の定義

### 3.1 Expression とは

> Expression とは、
> **Analyze フェーズで評価可能な文字列表現**である。

Expression は以下を含んでよい。

* 数値リテラル
* シンボル参照
* 算術演算
* 括弧

---

### 3.2 Expression が含んではならないもの

❌ 評価済み値
❌ AST 構造
❌ 型情報
❌ 命令サイズや PC 依存情報（Analyze で注入される）

---

## 4. 数値リテラル（Literal）仕様

### 4.1 許容する表記

| 表記  | 例             | 備考       |
| --- | ------------- | -------- |
| 10進 | `123`         | 符号付き     |
| 16進 | `0x7F`, `$7F` | 大文字小文字不問 |
| 2進  | `%101010`     |          |
| 8進  | `0o77`        | 任意（実装可）  |
| 文字  | `'A'`         | 単一文字     |

* 表記の認識は **Analyze の責務**
* Parser は文字列として保持するだけ

---

### 4.2 数値範囲（共通）

* 内部評価は **signed 32-bit 整数**を基準とする
* 範囲外は Analyze エラー

```text
-2,147,483,648 ～ 2,147,483,647
```

---

## 5. シンボル参照

### 5.1 記法

* 英数字 + `_`
* 大文字小文字は **Symbol Spec に従い正規化**

```asm
LABEL
BUF_SIZE
```

---

### 5.2 解決ルール

* const / label → Analyze で数値として解決される
* extern → 式全体が正規化され、relocation として扱われる
* 未定義 → Analyze エラー

---

## 6. 演算子仕様

### 6.1 許容演算子（v1）

| 種別 | 演算子 |
| --- | --- |
| 単項 | `+`, `-`, `~` |
| 算術 | `+`, `-`, `*`, `/`, `%` |
| ビット | `&`, `|`, `^` |
| シフト | `<<`, `>>` |
| 括弧 | `(`, `)` |

* 優先順位は **互換性重視の独自順序**（旧実装/SJASM互換）
  * `^` > `&` > `|`（ビット演算の優先順位を C 準拠から変更）
  * それ以外（単項, 算術, シフト, 括弧）は従来通り
* 評価は左結合

---

### 6.2 禁止事項

❌ 論理演算（&&, ||）
❌ 比較演算（<, >, ==）
❌ 三項演算子

---

## 7. PC（現在アドレス）参照

### 7.1 記号

```asm
$
```

* `$` は **現在のロケーションカウンタ**
* Analyze フェーズで評価される

---

### 7.2 制約

* Macro フェーズでは解決しない
* relocation addend として使用可能

---

## 8. 文字リテラル（Character Literal）

### 8.1 記法

```asm
'A'
```

* 単一文字のみ許可
* 内部的には **文字コード値**

---

### 8.2 エンコード規則

* デフォルト：**ASCII (0x00–0x7F)**
* 範囲外文字は Analyze エラー

※ 将来拡張でエンコード指定を追加可能

---

## 9. 文字列リテラル（String Literal）

### 9.1 記法

```asm
"HELLO"
```

* 主に `DB` 等のデータ疑似命令で使用
* Parser は **引用符込み文字列**を保持してよい

---

### 9.2 エンコード

* デフォルト：**ASCII**
* 1文字 = 1バイト
* NUL 終端は **自動付与しない**

---

### 9.3 エスケープ（v1）

| 記法   | 意味  |
| ---- | --- |
| `\n` | LF  |
| `\r` | CR  |
| `\t` | TAB |
| `\\` | `\` |
| `\"` | `"` |

---

## 10. Expression の評価結果（Value）

### 10.1 Value の型

Analyze の結果は以下に分類される。

| 種別         | 意味         |
| ---------- | ---------- |
| 定数値        | number     |
| アドレス       | number     |
| 未解決 extern | relocation |

未解決 extern を含む Value は、
Analyze フェーズにおいて数値評価されず、
正規化済み relocation として表現される。

---

### 10.2 コンテキスト依存制約

* 即値 8bit → `0–255`
* 相対ジャンプ → `-128–127`
* 範囲外は Analyze エラー

---

## 11. relocation との関係

* extern を含む式は Analyze フェーズで完全に正規化され、
  式構文を含まない relocation として表現される

  * 正規化結果は `symbol + addend` 形式である
  * addend は定数項をすべて畳み込んだ値である

* 複数 extern を含む式は禁止（v1）


---

## 12. 禁止事項まとめ（重要）

❌ Parser で数値化
❌ PEG AST を Node に混入
❌ 式評価を Analyze 以外で実行
❌ 非決定的エンコード
❌ 暗黙の型変換
❌ extern を含む未正規化の式を Linker へ渡すこと

---

## 13. 将来拡張方針

* UTF-8 / SJIS エンコード指定
* MSX / MZ系機種別コード変換
* 64-bit 値、BCD値、浮動小数点数値
* 式 AST 導入（v2）
* 条件付き式

これらは **Expression Spec v2** として扱う。

---

## 14. 設計の芯（要約）

* 式は「文字列契約」
* 評価は Analyze の責務
* 表現は柔軟、意味は厳格
* PEG 実装を縛らない
* extern を含む式は Analyze で消滅し、relocation に変換される
