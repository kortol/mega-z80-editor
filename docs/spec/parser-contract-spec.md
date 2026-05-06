# 📘 Parser Contract Specification

*(mz80-as Internal Parser Contract – Node/Source based)*

---

## 1. 目的と位置づけ

Parser Contract Spec は、mz80-as における **構文解析フェーズの責務・境界・禁止事項**を定義する内部仕様である。

```
source text
   ↓
[ Parser ]
   ↓
Node[]
```

* parser は **Node ABI / Source ABI の生成者**
* parser は **意味解析・評価を一切行わない**
* legacy parser / PEG parser は **同一の出力契約**に従う

本 Spec に違反する parser 実装は **不正実装**とみなす。

---

## 2. Parser の入出力契約

### 2.1 入力

```text
string (assembly source text)
```

* 改行区切りのテキスト
* INCLUDE 展開済みである必要はない
* 文字コードは UTF-8 を前提とする

---

### 2.2 出力

```ts
Node[]
```

* Node ABI Spec に準拠した Node の配列
* 配列順は **入力ソースの論理行順と一致**しなければならない
* すべての Node は **Source を必ず保持**する

---

## 3. Parser の責務（やるべきこと）

Parser は以下の処理のみを行う。

### 3.1 行構造の解析

* 入力テキストを **論理行単位**で解釈する
* ラベル / 命令 / 疑似命令 / マクロ定義 / マクロ呼び出し / 空行 を判別する

---

### 3.2 Node の生成

Parser は、各行に対応する Node を生成する。

* Node 種別は `NodeKind` に限定する
* Node の内容は **未評価の構文情報のみ**とする

---

### 3.3 Source の生成

Parser は **Source を生成してよい唯一の工程**である。

* 各 Node に 1 つの Source を割り当てる
* Source の意味論は Source ABI Spec に従う

#### PEG parser の場合

* `location().start.line` → `source.line`
* `location().start.column` → `source.column`
* `text()` → `source.text`

#### legacy parser の場合

* 既存 pos / rawText 相当から **同一意味の Source を生成**

---

## 4. Node 生成ルール（必須）

### 4.1 空行・コメント行

* 空行およびコメントのみの行は **必ず `NodeEmpty` を生成**
* Node を省略してはならない

#### 理由

* 行番号整合
* `.lst` 出力
* エラー追跡

---

### 4.2 ラベル行

* 行頭ラベルは `NodeLabel` として生成
* ラベルと命令が同一行にある場合：

  * `NodeLabel`
  * `NodeInstr` / `NodePseudo`
    の **2 Node を同一 Source で生成**

---

### 4.3 命令行

* 命令は `NodeInstr` として生成
* ニーモニックは文字列として保持
* オペランドは **未評価文字列配列**

---

### 4.4 疑似命令（ディレクティブ）

* 疑似命令は `NodePseudo` として生成
* 命令名は **大文字正規化**
* 引数は **未評価文字列配列**

---

### 4.5 マクロ定義

* `MACRO` ～ `ENDM` は `NodeMacroDef` として生成
* マクロ本体は **text ベースで保持**
* マクロ内部を Node[] 化してはならない

---

### 4.6 マクロ呼び出し

* マクロ呼び出しは `NodeMacroCall` として生成
* 実引数は **未評価文字列配列**

---

## 5. Parser の禁止事項（最重要）

Parser は以下を **絶対に行ってはならない**。

### 5.1 意味解析・評価の禁止

❌ 数値評価
❌ 式解決（resolveExpr* 呼び出し）
❌ シンボルテーブル操作
❌ 命令長計算
❌ アドレス割当

---

### 5.2 構造破壊の禁止

❌ NodeKind の独自追加
❌ Node に AST ノードを混入
❌ operands / args を number / AST 化
❌ Source を optional にする

---

### 5.3 フェーズ越権の禁止

❌ マクロ展開
❌ INCLUDE 展開
❌ analyze / emit の呼び出し

---

## 6. エラー処理に関する契約

* Parser は **構文エラーのみ**を検出してよい
* エラー報告には **必ず Source を使用**
* 未定義シンボル・評価エラーは parser の責務ではない

---

## 7. 出力保証条件（Quality Gate）

Parser の出力 Node[] は、以下を満たさなければならない。

* 全 Node が Source を保持
* NodeKind が Spec に準拠
* Node 配列順が入力行順と一致
* 空行が欠落していない

これを満たさない出力は **契約違反**とする。

---

## 8. Parser と後続フェーズの境界

```
Parser
  └─ 構文・形の確定
expandMacros
  └─ ソース展開
analyze
  └─ 意味の確定
emit
  └─ バイナリ生成
```

Parser は **この境界を越えてはならない**。

---

## 9. 将来拡張方針

* 新構文追加は **Node ABI を拡張せずに対応**する
* Parser Contract の変更は **破壊的変更**として扱う
* 変更時は Spec version を更新する

---

## 10. まとめ（設計の芯）

* Parser は「Node + Source を作るだけ」
* Parser は意味を理解しない
* PEG / legacy は同一 Contract に従う
* この Spec が PEG 移行の安全柵になる
