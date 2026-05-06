# 📘 Output File Specifications

*(mz80-as Output Artifacts Contract – Integrated)*

---

## 1. 目的と位置づけ

本 Spec は、mz80-as が生成する **すべての出力ファイルの意味・責務・相互関係**を定義する。

```
Node[] (analyzed, resolved)
   ↓
Emit
   ├─ .rel   (linkable object)
   ├─ .sym   (symbol information)
   └─ .lst   (listing / trace)
```

* すべての出力は **Analyze Phase 完了後の Node[] を唯一の入力**とする
* 出力フェーズは **意味を再解釈しない**
* 各ファイルは **独立に生成可能**でなければならない

---

## 2. 出力ファイル共通原則（最重要）

### 2.1 共通前提条件

すべての出力生成は以下を前提とする。

1. Node ABI Spec 準拠
2. Source ABI Spec 準拠
3. Analyze Phase Spec 完了済み
4. 未解決 label / const が存在しない
5. extern のみが未解決参照として残る

---

### 2.2 共通禁止事項

出力フェーズは以下を **絶対に行ってはならない**。

❌ 式評価
❌ シンボル解決
❌ relocation 生成
❌ Node.kind / Node.source の変更
❌ マクロ再展開

---

## 3. 出力ファイルの役割分担

| ファイル   | 役割     | 対象                     |
| ------ | ------ | ---------------------- |
| `.rel` | リンカ入力  | 機械語 + relocation       |
| `.sym` | シンボル情報 | label / const / extern |
| `.lst` | 人間向け一覧 | Source + 生成結果          |

---

## 4. `.rel` – Relocatable Object File Spec

### 4.1 目的

`.rel` は **リンク可能なオブジェクト表現**であり、
リンカが最終的な配置・解決を行うための **最小十分情報**を含む。

---

### 4.2 含める情報

`.rel` は以下を含む。

1. **機械語データ**
2. **Relocation Table**
3. **Extern Symbol 参照情報**
4. （任意）セクション情報

---

### 4.3 機械語データ

* Analyze で確定した命令・データのバイト列
* extern 参照箇所は **0 または仮値**
* バイト順・サイズは CPU 仕様に従う（Z80）

---

### 4.4 Relocation Table

Relocation Entry は **Relocation Spec に完全準拠**する。

```ts
interface RelocationEntry {
  offset: number;
  symbol: string;
  kind: 'ABSOLUTE' | 'RELATIVE';
  size: 1 | 2 | 4;
  addend: number;
}
```

* offset は `.rel` 内の書き込み位置
* symbol は extern Symbol 名
* addend は Analyze で確定済み

---

### 4.5 禁止事項

❌ label / const を relocation 対象に含める
❌ relocation 情報を欠落させる
❌ relocation を emit 時に推測生成する

---

## 5. `.sym` – Symbol Output File Spec

### 5.1 目的

`.sym` は **アセンブル結果のシンボル一覧**を提供する。

* デバッグ
* リンク確認
* 他ツール連携

を目的とする **情報ファイル**である。

---

### 5.2 出力対象シンボル

`.sym` には以下を **すべて出力**する。

| 種別      | 出力 | 備考     |
| ------- | -- | ------ |
| label   | ✔  | アドレス確定 |
| const   | ✔  | 値確定    |
| extern  | ✔  | 未解決    |
| section | 任意 | 将来拡張   |

---

### 5.3 各 Symbol の出力項目（概念）

```text
<name> <kind> <value/address or UNRESOLVED>
```

例：

```
START label 0x0100
BUF_SIZE const 64
printf extern UNRESOLVED
```

* extern は **未解決であることを明示**
* 数値表現（hex/dec）は実装で統一する

---

### 5.4 禁止事項

❌ 未定義シンボルを出力
❌ シンボル種別を曖昧にする
❌ Analyze 以前の状態を出力

---

## 6. `.lst` – Listing File Spec

### 6.1 目的

`.lst` は **人間向けのトレース・確認用一覧**である。

* ソース行
* 生成アドレス
* 生成バイト列

の対応を可視化する。

---

### 6.2 行構成（論理）

各行は以下の情報を含む。

```text
<line> <address> <bytes> <source text>
```

例：

```
0010 0100 3E 01        LD A,1
0011 0102 C3 00 00    JP extern_func
```

---

### 6.3 Source との関係（最重要）

* 行番号：`Node.source.line`
* ソース表示：`Node.source.text`
* マクロ展開行も **必ず表示**

---

### 6.4 表示上の原則

* 表示は **Analyze 結果の写像**
* 意味の補完や省略は禁止
* 未生成行（NodeEmpty）は行番号のみ表示してよい

---

## 7. ファイル間の整合性保証

以下が成立しなければならない。

* `.lst` に表示されたアドレス・バイト列
  ↔ `.rel` の機械語
* `.sym` の label / const
  ↔ Analyze の Symbol Table
* `.rel` の relocation.symbol
  ↔ `.sym` の extern

---

## 8. 差分検証ポリシー（Regression）

PEG / legacy 差し替え時の検証基準：

| ファイル   | 比較基準              |
| ------ | ----------------- |
| `.rel` | **完全一致（バイナリ）**    |
| `.sym` | 内容一致（順序差は許容可）     |
| `.lst` | 行番号・意味一致（表記微差は許容） |

---

## 9. エラー処理契約

* 出力フェーズのエラーは

  * I/O エラー
  * フォーマット制約違反
    のみに限定する
* ソース・意味エラーは **Analyze 以前の責務**

---

## 10. 将来拡張方針

* JSON / MAP / ELF 等の追加は

  * 本 Spec の思想に従って拡張
* 新フォーマット追加は **既存出力に影響しないこと**

---

## 11. 設計の芯（要約）

* 出力は「確定した意味の写像」
* `.rel` = 機械とリンカ向け
* `.sym` = 情報と検証用
* `.lst` = 人間向けトレース
* 3者は **役割分離・独立生成**
