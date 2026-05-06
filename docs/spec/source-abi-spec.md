# 📘 Source ABI Specification

*(mz80-as Internal Source Contract)*

- Status: current reference
- Audience: parser / macro / debugger / output contributors
- Related:
  - `node-abi-spec.md`
  - `output-file-specs.md`
  - `parser-contract-spec.md`

---

## 1. 目的と位置づけ

`Source` は、mz80-as における **ソース由来情報の唯一の表現単位**である。

* Node が「何を表すか」
* Source が「どこから来たか」

を **完全に分離**する。

```
Node = 意味・構文
Source = 位置・表示・追跡
```

この分離は **内部 ABI として固定**され、
parser 実装（legacy / PEG）や将来の拡張方式に依存してはならない。

### この Spec が決めること

- Source が保持する最小情報
- Source を生成できるフェーズ
- error / listing / trace が依存してよい位置情報

### この Spec が決めないこと

- 構文解析や意味解析の仕様
- ファイル管理や include 解決の実装方式
- 将来の拡張フィールドの具体値

---

## 2. Source の責務（断言）

Source は、以下のみを責務とする。

* Node が **どのソース行に由来するか**を示す
* エラー表示・lst 出力・追跡ログの **唯一の根拠**になる

### Source がやらないこと（明確に禁止）

❌ 構文解析
❌ 意味解析
❌ 評価・解決
❌ トークン化
❌ ファイル管理

---

## 3. Source の不変条件（Invariants）

Source は以下を **必ず満たす**。

1. **Immutable（不変）**
2. **1 Node = 1 Source**
3. **必須情報のみを持つ**
4. **optional フィールドを持たない**
5. **全 Node が必ず Source を持つ**

---

## 4. Source API 定義（確定）

### 4.1 型定義

```ts
export class Source {
  /** 1-origin 行番号 */
  readonly line: number;

  /** 1-origin 列番号 */
  readonly column: number;

  /** 表示・lst 用の元テキスト（1行相当） */
  readonly text: string;

  constructor(args: {
    line: number;
    column: number;
    text: string;
  }) {
    this.line = args.line;
    this.column = args.column;
    this.text = args.text;
  }
}
```

### 4.2 フィールド意味論

| フィールド    | 意味     | 備考          |
| -------- | ------ | ----------- |
| `line`   | ソース行番号 | 1-origin 固定 |
| `column` | ソース列番号 | 行内開始位置      |
| `text`   | 元ソース1行 | 改行を含まない     |

---

## 5. Source の生成責務

### 5.1 parser（legacy / PEG）

* **Source を生成してよい唯一の工程**
* PEG parser では：

  * `location().start.line` → `line`
  * `location().start.column` → `column`
  * `text()` → `text`

legacy parser も **同一意味論で Source を生成**しなければならない。

---

### 5.2 macro 展開時の Source 生成ルール

マクロ展開では **新しい Source を必ず生成**する。

#### ルール

* `line` / `column`
  → **展開元 Node の Source を継承**
* `text`
  → **展開後の1行テキスト**

#### 理由

* lst / エラーの追跡可能性を維持するため
* 正確な物理行より **論理的由来を優先**

---

## 6. analyze / emit における扱い

### analyze

* Node を破壊的に変更してよい
* **Source は変更してはならない**

### emit

* lst 出力：`source.text`
* エラー位置：`source.line / source.column`

Source 以外の情報を **表示・位置計算に使用してはならない**。

---

## 7. Node との関係（ABI 連動）

### NodeBase 定義（再掲）

```ts
interface NodeBase {
  kind: NodeKind;
  source: Source;
}
```

#### 禁止事項

* Node に `pos`, `rawText` を直接持たせる
* Source を optional にする
* Source を後工程で差し替える

---

## 8. エラー・lst 生成における原則

* エラーは **必ず Source を基点**に表示する
* lst は **Source.text をそのまま出力**する
* 行番号ズレは **Source 設計で解決**し、後工程で補正しない

---

## 9. 将来拡張に関する方針（今は実装しない）

以下は **後方互換でのみ追加可能**とする。

* `fileId`
* `span { start, end }`
* include 階層情報

ただし：

* 現行 ABI には **一切含めない**
* 追加時は **Source v2 として明示**

---

## 10. 禁止事項まとめ（重要）

❌ Source に filename を入れる
❌ Source に endLine / endColumn を入れる
❌ Source を optional にする
❌ Node に pos/rawText を残す
❌ Source を mutable にする

---

## 11. 設計の芯（要約）

* Source は **「由来」の唯一表現**
* Node は **意味と構文だけを持つ**
* parser が Source を作り、以降は不変
* lst / error / trace は Source だけを見る
