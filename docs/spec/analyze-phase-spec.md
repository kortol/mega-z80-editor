# 📘 Analyze Phase Specification

*(mz80-as Internal Analyze Contract – Node/Source based)*

- Status: current reference
- Audience: assembler implementation contributors
- Related:
  - `node-abi-spec.md`
  - `source-abi-spec.md`
  - `expression-value-spec.md`

---

## 1. 目的と位置づけ

Analyze フェーズは、mz80-as において **「未評価 Node 列」を「意味が確定した Node 列」へ変換**する工程である。

```
Node[] (expanded, unresolved)
   ↓
[ analyze ]
   ↓
Node[] (analyzed, resolved)
   ↓
emit / lst / sym
```

* 入力は **Macro Expansion 完了後**の Node[]
* 出力は Emit の前提となる **意味確定済み Node[]**
* Source は **解析の前後で不変**

### この Spec が決めること

- analyze が引き受ける意味確定責務
- emit に渡す前に確定しているべき状態
- extern 式を relocation に正規化する責務

### この Spec が決めないこと

- parser や macro フェーズの構文生成方式
- linker 側の最終配置ルール
- 出力ファイルの表示形式

---

## 2. 前提条件（Inputs）

Analyze の入力 Node[] は以下を満たすこと。

1. Node ABI Spec 準拠
2. 全 Node が Source を保持
3. `macroDef` / `macroCall` が **存在しない**（Macro Expansion 完了済み）
4. Node 配列順が入力行順と一致している

---

## 3. Analyze の入出力契約

### 3.1 入力

```ts
analyze(nodes: Node[]): Node[]
```

* Node は未評価構文情報を保持している
* operands / args は文字列である

### 3.2 出力

* Node[] を返す（破壊的更新でも再生成でも良い）
* ただし **Node.kind と Node.source は絶対に変更不可**

---

## 4. Analyze の責務（やるべきこと）

Analyze は以下を行う。

### 4.1 シンボル定義の収集

対象：

* `NodeLabel`：ラベル定義
* `NodePseudo`：EQU などのシンボル定義（設計上 EQU は pseudo に入る）

結果：

* シンボルテーブル（少なくとも 16-bit 解決用）を構築する

---

### 4.2 アドレス割当（ロケーションカウンタ管理）

* ORG / SECTION / ALIGN 等の疑似命令による状態変化を反映
* 各命令・データ定義が配置される **アドレスを確定**

---

### 4.3 式の解決（resolveExpr* の責務）

* 命令オペランド、疑似命令引数に含まれる式を

  * シンボルテーブル
  * 現在アドレス
  * 定数
    から評価する

#### 制約

* parser ではなく analyze が評価する
* 式は入力では文字列だが、analyze で解決結果を生成してよい

### 4.3.1 extern を含む式の正規化責務

Analyze フェーズは、extern symbol を含む式に対して
以下の正規化処理を必ず行う。

- 式構文（演算子・括弧・優先順位）を完全に解釈する
- extern symbol を高々 1 つ抽出する
- 定数項を算術的に評価し、単一の addend に畳み込む
- 式構文を完全に除去する
- 正規化済み relocation entry を生成する

Analyze 完了時点で、extern を含む未正規化の式が
Node 上に残存していてはならない。

---

### 4.4 命令エンコード前提の確定

* 各 `NodeInstr` について、emit がバイナリ生成できるよう

  * 命令形式
  * 即値の解決結果
  * 相対ジャンプのオフセット
  * 命令サイズ
    を確定する

---

### 4.5 生成物（.sym / .lst）のための情報整備

* シンボル表出力に必要な情報（ラベル→アドレス）
* lst 表示に必要な情報（アドレス、生成バイト列など）

※ 表示そのものは emit / lst フェーズの責務だが、必要な確定値は analyze で作る。

---

## 5. Analyze の禁止事項（重要）

Analyze は以下を行ってはならない。

❌ Node.kind の変更
❌ Node.source の変更
❌ Node 配列順の変更（行順を壊す操作）
❌ マクロ展開の再実行
❌ include 展開
❌ parser の再呼び出し

---

## 6. Node への影響（Mutations）

Analyze は Node に対して「意味確定情報」を **追加**してよい。
ただし **Node ABI v1 の基本フィールドは保持**しなければならない。

### 6.1 許可される拡張フィールド（例）

※ これは「設計として推奨される例」であり、名前の最終決定は実装と合わせて固定する。

* 共通

  * `address?: number`（配置アドレス）
  * `size?: number`（生成サイズ）
* 命令

  * `encodedBytes?: number[]`（生成バイト列のキャッシュ）
  * `resolvedOperands?: { ... }`（即値・シンボル解決結果）
* 疑似命令

  * `resolvedArgs?: number[] | (number|string)[]`（EQU/DB/DW 等）

#### 重要制約

* operands / args の **元文字列を消してはならない**

  * 追跡・エラー・lst のために保持する
* 追加情報は emit の計算を単純化するためにのみ使う

---

## 7. エラー処理契約

Analyze は以下のエラーを検出・報告してよい。

* 未定義シンボル
* 式評価不能（文法不正・範囲外）
* 相対ジャンプ距離超過
* セクション／ORG 状態不正
* ALIGN 値不正、サイズ不整合
* 命令エンコード不可能（オペランド不正）

### エラー報告の必須事項

* エラー位置は **Node.source** を基点に報告する
* エラー文言に

  * `source.line`
  * `source.column`
  * `source.text`
    を含められること（少なくとも参照可能であること）

---

## 8. 完了条件（Quality Gate）

Analyze フェーズ完了後、以下が成立すること。

1. すべての生成対象（instr / data pseudo）が **配置アドレス確定**
2. すべての式（命令・疑似命令）が以下のいずれかに収束している

   - 完全に数値として解決済み
   - extern symbol を含む場合は、正規化済み relocation として表現されている

3. 各行の生成サイズ（少なくとも emit に必要なサイズ）が確定
4. シンボル表が `.sym` 出力可能な状態
5. Node ABI / Source ABI への準拠が維持されている

この状態を **Emit の前提条件**とする。

### 8.1 正規化完了条件（DoD）

Analyze フェーズの完了条件（DoD）として、
以下が必ず成立していなければならない。

- extern を含む式が、すべて relocation に正規化されている
- 未正規化の式構文が Node / 内部データ構造に残存していない
- relocation entry は Relocation Spec に準拠している

この条件を満たさない Analyze 結果は、
Emit フェーズへ進んではならない。

---

## 9. Emit フェーズとの境界（重要）

* analyze は「意味を確定する」
* emit は「確定した意味をバイナリ化する」

したがって emit は以下を前提としてよい。

* 未正規化の式が存在しない
* extern symbol は relocation としてのみ残存している
* 命令サイズが確定している
* 相対ジャンプの距離検証が終わっている

---

## 10. 将来拡張方針

* Node ABI v1 では analyze が付与する拡張フィールド名は、必要最小限を推奨する
* 解析結果をより厳密に型で保証したい場合は

  * `AnalyzedNode` 型の導入
  * Node ABI v2 での “意味確定 Node” 仕様化
    を検討する

---

## 11. 設計の芯（要約）

* Analyze は **意味確定フェーズ**
* parser / macro は意味を触らない
* Node.kind / Node.source は不変
* emit は analyze 完了を前提に単純化される
* extern を含む式は Analyze で完全に消滅し、relocation に変換される

