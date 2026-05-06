# 📘 Symbol Table Specification

*(mz80-as Internal Symbol Table Contract)*

---

## 1. 目的と位置づけ

Symbol Table Spec は、mz80-as における **Symbol の格納構造・検索規則・解決ルール**を定義する内部仕様である。

```
Node[] (expanded)
   ↓
Analyze
   └─ Symbol Table 構築・解決
   ↓
Emit / Link
```

* Symbol Table は **Analyze フェーズの中核データ構造**
* Parser / Macro フェーズは Symbol Table を操作してはならない
* Emit / Link は **参照専用**として使用する

---

## 2. Symbol Table の責務

Symbol Table は以下を責務とする。

1. Symbol の一意管理
2. 定義・参照の整合性保証
3. Analyze 中の解決状態管理
4. Emit / Link への確定情報提供

---

## 3. 基本構造

### 3.1 単一 Symbol Table 原則

* mz80-as は **単一の Symbol Table**を持つ
* セクション・スコープは **属性で表現**する
* 複数テーブルのネストは禁止（v1）

---

### 3.2 データモデル

```ts
interface SymbolTable {
  /** シンボル名 → Symbol */
  symbols: Map<string, Symbol>;
}
```

* key は **正規化済みシンボル名**
* 大文字・小文字の扱いは **アセンブラ全体で統一**（推奨：大文字化）

---

## 4. Symbol の登録ルール

### 4.1 登録タイミング（Analyze）

| SymbolKind | 登録契機          |
| ---------- | ------------- |
| label      | NodeLabel 処理時 |
| const      | EQU 疑似命令      |
| extern     | EXTERN 疑似命令   |
| section    | SECTION 疑似命令  |

Parser / Macro フェーズでの登録は禁止。

---

### 4.2 登録 API 契約（概念）

```ts
defineSymbol(symbol: Symbol): void
```

登録時に以下を検証する。

* 同名 Symbol の存在
* 種別の衝突可否

---

## 5. 重複定義・衝突ルール（重要）

### 5.1 同名 Symbol の扱い

| 既存     | 新規     | 結果                   |
| ------ | ------ | -------------------- |
| 未存在    | 任意     | 登録                   |
| label  | label  | ❌ エラー                |
| const  | const  | ❌ エラー                |
| label  | const  | ❌ エラー                |
| const  | label  | ❌ エラー                |
| extern | label  | ✔ extern → label に昇格 |
| extern | const  | ❌ エラー                |
| extern | extern | ✔（冗長宣言として許可）         |

---

### 5.2 extern 昇格ルール

* EXTERN 宣言後にラベル定義された場合：

  * SymbolKind を `extern → label` に変更
  * resolved = true に更新
* 逆は不可

---

## 6. 解決状態管理

### 6.1 resolved フラグの意味

| 状態               | 意味             |
| ---------------- | -------------- |
| resolved = false | Analyze 時点で未解決 |
| resolved = true  | 値またはアドレスが確定    |

* const / label：Analyze 完了時に resolved = true
* extern：Analyze 完了時でも resolved = false

---

### 6.2 解決 API 契約（概念）

```ts
resolveSymbol(name: string): Symbol
```

* 未登録 → エラー
* 未解決 extern → 呼び出し元に委ねる（Emit / Link 用）

---

## 7. 参照ルール（Analyze 中）

### 7.1 シンボル参照の扱い

* 命令オペランド・疑似命令引数内の識別子は

  * Symbol Table を参照して解決する
* 以下は Analyze エラーとする：

  * 未定義かつ extern 宣言なし
  * const をアドレス文脈で使用（仕様で禁止する場合）

---

### 7.2 Source との関係

* Symbol は必ず **定義元 Source** を持つ
* エラー報告では：

  * 定義元 Source
  * 使用元 Node.source
    の両方を参照可能でなければならない

---

## 8. Emit / Link フェーズとの関係

### 8.1 Emit フェーズ

Emit は以下を前提としてよい。

* Symbol Table は **構築済み**
* label / const は resolved = true
* extern は resolved = false

Emit は Symbol Table を **変更してはならない**。

---

### 8.2 Link フェーズ（将来）

* extern Symbol の解決は Link の責務
* Link は Symbol Table を入力として扱う
* mz80-as 単体では extern は未解決で残る

---

## 9. 禁止事項（最重要）

❌ Parser / Macro で Symbol Table を操作
❌ Analyze 以外で Symbol を定義
❌ resolved = true の extern Symbol
❌ SymbolKind の追加
❌ 名前正規化ルールの不統一

---

## 10. 将来拡張方針

以下は **属性追加で対応**する。

* local / global visibility
* weak symbol
* section スコープ
* 名前空間（将来の v2）

Symbol Table の構造自体は維持する。

---

## 11. 設計の芯（要約）

* Symbol Table は Analyze の唯一の管理対象
* 単一テーブル・属性管理が原則
* extern は「未解決を許容する唯一の種別」
* Emit / Link は参照専用
