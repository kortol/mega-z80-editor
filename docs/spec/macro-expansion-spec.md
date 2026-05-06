# 📘 Macro Expansion Specification

*(mz80-as Internal Macro Expansion Contract – Node/Source based)*

- Status: current reference
- Audience: parser / macro / analyze contributors
- Related:
  - `parser-contract-spec.md`
  - `node-abi-spec.md`
  - `analyze-phase-spec.md`

---

## 1. 目的と位置づけ

Macro Expansion Spec は、mz80-as における **マクロ処理フェーズの責務・入出力・禁止事項**を定義する内部仕様である。

```
Node[] (parsed)
   ↓
[ expandMacros ]
   ↓
Node[] (expanded)
```

* Macro Expansion は **Parser と Analyze の中間フェーズ**
* PEG / legacy parser に依存しない
* 旧 macro 実装の挙動を **契約として固定**する

### この Spec が決めること

- `NodeMacroDef` / `NodeMacroCall` の消し込み責務
- 展開後 Node の順序と Source の継承規則
- macro フェーズで許される処理の上限

### この Spec が決めないこと

- parser の構文認識方法
- analyze 後の意味確定モデル
- include 展開の詳細

---

## 2. Macro Expansion フェーズの責務

### 2.1 入力

```ts
Node[]   // Parser 出力
```

* Node ABI Spec 準拠
* NodeMacroDef / NodeMacroCall を含む可能性がある
* Source はすべて付与済みであること

---

### 2.2 出力

```ts
Node[]   // マクロ展開後
```

* Node ABI Spec 準拠
* NodeMacroDef / NodeMacroCall は **最終的に存在しない**
* 展開結果は通常の Node（instr / pseudo / label / empty）のみ

---

## 3. Macro Expansion の責務（やるべきこと）

Macro Expansion フェーズは以下のみを行う。

### 3.1 マクロ定義の収集

* `NodeMacroDef` を検出し、マクロ定義テーブルに登録する
* マクロ定義自体は **出力 Node[] には含めない**

```text
NodeMacroDef
  → register macro
  → do not emit
```

---

### 3.2 マクロ呼び出しの展開

* `NodeMacroCall` を検出した場合：

  * 定義済みマクロを参照
  * 実引数を仮引数にバインド
  * マクロ本体を展開する

展開後の Node は **NodeMacroCall を置換**する。

---

### 3.3 再帰・多段マクロ

* マクロ展開は **再帰的に行ってよい**
* 展開深度に制限を設けてもよい（無限再帰防止）

---

## 4. Source の取り扱い（最重要）

### 4.1 展開後 Node の Source 生成ルール

マクロ展開によって生成された Node は
**必ず新しい Source を持たなければならない。**

#### ルール（厳守）

* `source.line` / `source.column`
  → **マクロ呼び出し元 Node の Source を継承**
* `source.text`
  → **展開後の1行テキスト**

```text
macro call at line 100
  ↓
expanded nodes
  → all source.line = 100
```

---

### 4.2 理由

* lst 出力時に「どの行から来たコードか」を追跡できる
* エラー位置を **論理的な由来**に紐づけられる
* 物理行番号の正確さより **可読性と一貫性を優先**

---

## 5. Macro Definition Node の扱い

### 5.1 NodeMacroDef の構造（再掲）

```ts
interface NodeMacroDef extends NodeBase {
  kind: 'macroDef';
  name: string;
  params: string[];
  bodyText: string;
}
```

### 5.2 原則

* `bodyText` は **再トークナイズ可能な生テキスト**
* Macro Expansion フェーズは

  * bodyText を tokenizer に流す
  * 旧 macro 展開ロジックを再利用してよい
* body を Node[] 化してはならない

---

## 6. Macro Call Node の扱い

### 6.1 NodeMacroCall の構造（再掲）

```ts
interface NodeMacroCall extends NodeBase {
  kind: 'macroCall';
  name: string;
  args: string[];
}
```

### 6.2 展開ルール

* マクロ未定義の場合：

  * エラーを報告してもよい
* 実引数は **文字列のまま**渡す
* 数値評価・式解決は禁止

---

## 7. Node 配列の順序保証

* 展開後 Node[] の順序は

  * 元の Node 配列順を **論理的に保持**
* マクロ呼び出し 1 行が

  * 複数行に展開される場合
  * **元の呼び出し位置に挿入**される

---

## 8. 禁止事項（最重要）

Macro Expansion フェーズは以下を **絶対に行ってはならない**。

### 8.1 意味解析の禁止（原則）

❌ 数値評価
❌ resolveExpr* 呼び出し
❌ 命令長計算
❌ シンボル解決

#### 例外（互換性重視）

以下は **互換性のために限定的に許可**する。

* ループ系マクロ（REPT / IRP / IRPC / WHILE）で必要となる
  **制御目的の SET / ループ変数の解決**
* 目的は **展開回数や継続条件の判断**に限定する
* 許可されるのは **マクロ展開内部のローカル状態更新**のみであり、
  **命令エンコードや値の確定を行う意味解析**は依然として禁止

---

### 8.2 構造破壊の禁止

❌ NodeKind の追加
❌ Node を AST 化
❌ Node.source の破壊的変更
❌ Node を評価済みに変換

---

### 8.3 フェーズ越権の禁止

❌ analyze の呼び出し
❌ emit の呼び出し
❌ INCLUDE 展開（別 Spec 対象）

---

## 9. エラー処理契約

* マクロ定義エラー（引数数不一致など）は検出してよい
* エラー報告には **必ず Source を使用**
* エラー行は **マクロ呼び出し元の Source** を指す

---

## 10. 完了条件（Quality Gate）

Macro Expansion フェーズ完了後：

* NodeMacroDef が存在しない
* NodeMacroCall が存在しない
* すべての Node が Source を保持
* Node ABI Spec に完全準拠している

この状態を **Analyze フェーズの前提条件**とする。

---

## 11. 将来拡張に関する方針

* LOCALMACRO / REPT / IRP 等の拡張は

  * 本 Spec を破壊せずに追加する
* マクロ AST 化は **将来の v2 以降で検討**

---

## 12. 設計の芯（要約）

* Macro Expansion は「テキスト展開フェーズ」
* 意味は一切理解しない
* Source は論理由来を示す
* NodeMacroDef / Call は最終成果物に残らない
