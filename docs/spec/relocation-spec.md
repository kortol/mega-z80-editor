# 📘 Relocation Specification

*(mz80-as Relocation Contract – Analyze / Emit / Link shared)*

---

## 1. 目的と位置づけ

Relocation Spec は、mz80-as における **未解決参照（extern）をどのように記録し、後段リンカに引き渡すか**を定義する内部仕様である。

```
Analyze
  ├─ Symbol 解決（内部）
  └─ 未解決 extern 検出
       ↓
Emit (.rel)
       ↓
Linker
```

* **Analyze は relocation を「作る」**
* **Emit は relocation を「書き出す」**
* **Linker が最終解決する**

---

## 2. Relocation の基本概念

### 2.1 Relocation とは

> Relocation とは、
> **アセンブル時点では値を確定できない参照を、
> 後段で補正・解決するための記録**である。

mz80-as において relocation の原因は **extern symbol 参照のみ**とする。

### 2.2 Relocation の正規化（Normalization）

Relocation Entry は、Analyze フェーズにおいて
**式構文を完全に解釈・簡約した結果として生成される正規化済み表現**
でなければならない。

正規化済み Relocation Entry とは、以下の条件をすべて満たすものを指す。

- 式構文（演算子、括弧、優先順位）を含まない
- extern symbol は高々 1 つである
- 定数項はすべて addend に畳み込まれている
- 書き込みサイズおよび relocation 種別が確定している

Linker は、この正規化済み Relocation Entry を前提として動作し、
式構文の解釈や再評価を行わない。

---

## 3. Relocation 対象（重要）

### 3.1 Relocation が発生する条件

以下をすべて満たす場合に relocation を生成する。

1. 命令または疑似命令が **値を書き込む**
2. その値が **extern Symbol を含む式**
3. Analyze 完了時点で **resolved = false**

---

### 3.2 Relocation が発生しない条件

以下の場合、relocation を生成してはならない。

* label / const Symbol のみを含む式
* 完全に定数評価できる式
* EQU 定義
* データサイズのみを指定する疑似命令（DS 等）

---

## 4. Relocation の分類（固定）

```ts
type RelocationKind =
  | 'ABSOLUTE'   // 絶対値書き込み
  | 'RELATIVE';  // 相対オフセット（JR 等）
```

* **種類追加は禁止**
* サイズ差異は属性で表現する

---

## 5. Relocation Entry 定義（確定）

```ts
interface RelocationEntry {
  /** 書き込み先アドレス（オブジェクト内オフセット） */
  offset: number;

  /** 対象シンボル名 */
  symbol: string;

  /** 再配置種別 */
  kind: RelocationKind;

  /** 書き込みサイズ（byte 単位） */
  size: 1 | 2 | 4;

  /** 加算値（定数オフセット） */
  addend: number;
}
```

---

## 6. 各フィールドの意味論

| フィールド    | 意味                        |
| -------- | ------------------------- |
| `offset` | .rel 内での書き込み位置（セクション先頭基準） |
| `symbol` | extern Symbol 名           |
| `kind`   | 絶対 or 相対                  |
| `size`   | 書き込みバイト数                  |
| `addend` | シンボル値に加算される定数             |

---

## 7. Analyze フェーズの責務（Relocation 観点）

Analyze は以下を行う。

### 7.1 式解析結果の分類

* 完全解決可能 → 値を確定
* extern を含む式 → 正規化済み relocation 対象

---

### 7.2 Addend の決定

式が以下の場合：

```asm
LD HL, extern_sym + 4
```

* `symbol = extern_sym`
* `addend = 4`

addend は **Analyze で確定**する。

---

### 7.3 Node への関連付け（内部）

Analyze は以下を内部的に保持してよい。

* NodeInstr / NodePseudo に

  * relocation 情報への参照
  * 書き込み位置

※ Node ABI への追加は必須ではない
（Emit に渡せればよい）

### 7.4 正規化処理の責務

Analyze フェーズは、extern を含む式に対して以下の正規化処理を行う。

- extern symbol を抽出する
- 定数部分を算術的に評価し、単一の addend に畳み込む
- 式構文を完全に除去する
- 正規化後の結果を Relocation Entry として生成する

Analyze 完了時点で、Relocation Entry に
元の式文字列表現が残存していてはならない。


---

## 8. Emit フェーズの責務（Relocation 観点）

Emit は以下を行う。

### 8.1 未解決 extern 書き込み

* 書き込み位置に **0 または仮値**を出力
* 仮値の意味解釈は禁止（リンカの責務）

---

### 8.2 Relocation Entry の出力

* Analyze が生成した RelocationEntry を

  * .rel フォーマットに直列化
* 順序は

  * offset 昇順
  * Node 出現順
    のいずれでもよいが **一貫性を保つ**

---

## 9. Relocation と Symbol Table の関係

* relocation.symbol は

  * Symbol Table 上の extern Symbol 名と一致する
* relocation は

  * Symbol 定義そのものを含まない
  * あくまで「参照」の記録

---

## 10. エラー処理契約

Analyze は以下をエラーとする。

* extern を RELATIVE relocation で使用（仕様で禁止する場合）
* extern を即値文脈で使用不可な命令
* 複数 extern を含む式（例：A + B）

※ 「複数 extern を許すか」は v1 では **禁止推奨**

---

## 11. Link フェーズ前提（参考）

リンカは以下を前提としてよい。

* relocation.kind に応じて

  * 絶対値書き込み
  * 相対オフセット補正
* relocation.addend を加算
* 書き込みサイズを厳守

リンカは、Relocation Entry が Analyze フェーズで正規化済みであることを前提とし、
式構文の評価や再解釈を行わない。

---

## 12. 禁止事項（最重要）

❌ const / label を relocation 対象にする
❌ extern を Analyze で解決する
❌ relocation.kind を増やす
❌ Emit で relocation を生成する
❌ 仮値に意味を持たせる
❌ Linker に式構文の評価を要求する relocation を生成する

---

## 13. 将来拡張方針

* PC-relative 種別の詳細化
* セクション跨ぎ relocation
* 複合 relocation

これらは **属性追加で対応**し、
RelocationKind 自体は維持する。

---

## 14. 設計の芯（要約）

* relocation は **extern 参照の記録**
* Analyze が作り、Emit が書く
* 種別は ABSOLUTE / RELATIVE のみ
* addend は Analyze で確定
* Linker が最終解決する
* relocation は Analyze により正規化された数値補正情報である
