# 📘 Node ABI Specification

*(mz80-as Internal Node Contract – Source-based)*

---

## 1. 目的と位置づけ

Node ABI は、mz80-as における **全工程共通の内部 ABI（契約）**である。

```
parse → expandMacros → analyze → emit → (.rel / .lst / .sym)
```

* parser（legacy / PEG）は **必ず Node[] を生成**
* 後続工程は **Node の shape のみを信頼**
* AST / PEG / Token 型を後段へ漏らしてはならない

**Source ABI と組み合わせて初めて Node ABI は成立する。**

---

## 2. 基本原則（重要）

### 2.1 Node は「未評価構文表現」

* 数値評価しない
* 式は文字列のまま保持
* 命令長・アドレスは未確定
* マクロ展開前提

👉 **意味解析・解決は analyze フェーズの責務**

---

### 2.2 Node は必ず Source を持つ

* Node は **Source を通じてのみ**ソース由来情報を持つ
* `pos` / `rawText` を Node に直接持たせてはならない

---

## 3. NodeBase 定義（確定）

```ts
interface NodeBase {
  /** Node 種別 */
  kind: NodeKind;

  /** ソース由来情報（必須・不変） */
  source: Source;
}
```

### 制約

* `source` は optional 不可
* analyze / emit フェーズで変更不可

---

## 4. NodeKind 一覧（固定）

```ts
type NodeKind =
  | 'label'
  | 'instr'
  | 'pseudo'
  | 'macroDef'
  | 'macroCall'
  | 'empty';
```

* **新しい kind の追加は禁止**
* 機能拡張は既存 kind の属性追加で行う

---

## 5. 各 Node の仕様

---

### 5.1 Label Node

```ts
interface NodeLabel extends NodeBase {
  kind: 'label';

  /** ラベル名（: を含まない） */
  name: string;
}
```

#### 備考

* 行頭ラベルのみ
* `EQU` は Label Node ではなく `NodePseudo` で表現する

---

### 5.2 Instruction Node

```ts
interface NodeInstr extends NodeBase {
  kind: 'instr';

  /** 命令ニーモニック（例: LD, JP） */
  mnemonic: string;

  /** オペランド（未評価文字列） */
  operands: string[];
}
```

#### 制約

* operands は **必ず文字列**
* 数値化・レジスタ AST 化は禁止
* カンマ分割は parser の責務

---

### 5.3 Pseudo (Directive) Node

```ts
interface NodePseudo extends NodeBase {
  kind: 'pseudo';

  /** 疑似命令名（大文字正規化） */
  name: string;

  /** 引数（未評価文字列） */
  args: string[];
}
```

#### 対象例

* ORG / DB / DW / DS / EQU / END
* SECTION / INCLUDE / ALIGN / EXTERN
* .WORD32 / .SYMLEN など

---

### 5.4 Macro Definition Node

```ts
interface NodeMacroDef extends NodeBase {
  kind: 'macroDef';

  /** マクロ名 */
  name: string;

  /** 仮引数名 */
  params: string[];

  /** マクロ本体（再トークナイズ可能な生テキスト） */
  bodyText: string;
}
```

#### 原則

* body は **Node[] にしない**
* text ベースで保持し、旧 tokenizer / macro 展開を再利用
* PEG は MACRO〜ENDM を **意味解析しない**

---

### 5.5 Macro Call Node

```ts
interface NodeMacroCall extends NodeBase {
  kind: 'macroCall';

  /** 呼び出しマクロ名 */
  name: string;

  /** 実引数（未評価文字列） */
  args: string[];
}
```

---

### 5.6 Empty Node（空行・コメント）

```ts
interface NodeEmpty extends NodeBase {
  kind: 'empty';
}
```

#### 用途

* 行番号維持
* lst 行対応
* エラー位置整合

---

## 6. parser の責務（厳守）

parser（legacy / PEG 共通）は以下のみを行う。

✅ 行構造解析
✅ Node 生成
✅ Source 生成

❌ 数値評価
❌ シンボル解決
❌ マクロ展開
❌ 命令長計算

---

## 7. macro / analyze / emit との関係

### expandMacros

* Node[] → Node[]
* 展開後 Node は **新しい Source を生成**
* line / column：展開元 Source を継承
* text：展開後の1行テキスト

### analyze

* Node を破壊的に変更してよい
* **kind / source は変更禁止**

### emit

* lst：`node.source.text`
* エラー：`node.source.line / column`

---

## 8. 禁止事項（重要）

❌ Node に pos / rawText を直接持たせる
❌ operands / args に number / AST を入れる
❌ parser で resolveExpr を呼ぶ
❌ macro body を Node[] 化する
❌ NodeKind を追加する

---

## 9. 将来拡張ポリシー

* analyze 後の「意味確定 Node」
* IR 化
* 式 AST 化

これらは **Node ABI v2** 以降で検討する。

**本 Spec は PEG 移行完了までの絶対契約とする。**

---

## 10. 設計の芯（要約）

* Node ABI は mz80-as の内部 ABI
* Source ABI が由来を保証する
* Node は未評価構文だけを運ぶ
* PEG / legacy はこの ABI に従属する
