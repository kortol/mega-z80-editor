# 📘 Section & Memory Model Specification

*(mz80-as Section / Memory Contract – Assembler-oriented)*

- Status: current reference
- Audience: assembler / linker contributors
- Related:
  - `analyze-phase-spec.md`
  - `relocation-spec.md`
  - `linker-contract-spec.md`

---

## 1. 目的と位置づけ

本 Spec は、mz80-as における **セクション（Section）とメモリ配置モデルの意味論**を定義する。

```
Node[] (analyzed)
   ↓
Analyze
   ├─ セクション切替
   ├─ ロケーションカウンタ管理
   └─ アライメント処理
   ↓
Emit / Link
```

* **アセンブラは配置の論理を定義する**
* **リンカは最終配置を決定する**
* 本 Spec は **アセンブラ視点での契約**を定める

### この Spec が決めること

- section kind とその意味
- assembler 側で確定するロケーションカウンタ規則
- ORG / SECTION / ALIGN / BSS の扱い

### この Spec が決めないこと

- linker の最終アドレス選択アルゴリズム
- bank / overlay など v2 以降の拡張仕様
- output ファイルの表示形式

---

## 2. 基本原則（重要）

### 2.1 セクションは「論理的配置単位」

* セクションは **連続したアドレス空間の論理単位**
* 物理アドレスへの最終割当は **リンカの責務**
* アセンブラは

  * 相対配置
  * サイズ
  * 未初期化か否か
    を確定する

---

### 2.2 単一ロケーションカウンタ原則（v1）

* v1 では **アクティブなロケーションカウンタは常に 1 つ**
* セクション切替により

  * 保存
  * 復元
    されるものとする

👉 *複数同時進行カウンタは禁止*

---

## 3. Section の定義

### 3.1 Section とは

> Section とは、
> **同一の配置特性を持つデータ／コードの集合単位**である。

Section は以下の属性を持つ。

```ts
interface Section {
  name: string;
  kind: SectionKind;
  alignment: number;
  size: number;
}
```

---

### 3.2 SectionKind（固定）

```ts
type SectionKind =
  | 'text'   // 実行コード
  | 'data'   // 初期化済みデータ
  | 'bss';   // 未初期化データ
```

* **追加禁止**
* 特殊用途は属性で表現

---

## 4. 標準セクション（暗黙定義）

アセンブル開始時、以下のセクションが暗黙に存在する。

| 名前      | kind | 特性       |
| ------- | ---- | -------- |
| `.text` | text | 実行コード    |
| `.data` | data | 初期化済みデータ |
| `.bss`  | bss  | 未初期化データ  |

* 初期アクティブセクションは `.text`
* 明示的 SECTION 指定で切替可能

---

## 5. SECTION 疑似命令の意味論

```asm
SECTION .data
```

* アクティブセクションを切替える
* ロケーションカウンタは **セクションごとに保持**
* 未定義セクション名は **新規作成**

---

## 6. ロケーションカウンタ管理

### 6.1 基本動作

* 各セクションは独立したロケーションカウンタを持つ
* 命令・データ定義により size 分進む

---

### 6.2 ORG の扱い（制約付き）

```asm
ORG 0x8000
```

* ORG は **現在アクティブなセクションにのみ影響**
* セクション切替後は ORG の影響を引き継がない

👉 *ORG は「セクション内原点調整」*

---

## 7. アライメント（ALIGN）

### 7.1 ALIGN 疑似命令

```asm
ALIGN 16
```

* ロケーションカウンタを

  * 次の `alignment` 境界に進める
* padding が発生する場合：

| セクション | padding 内容        |
| ----- | ----------------- |
| text  | 0x00（NOP 扱いはしない）  |
| data  | 0x00              |
| bss   | size 増加のみ（実データなし） |

---

### 7.2 アライメント制約

* alignment は **2 の累乗**
* 0 / 1 は無効（Analyze エラー）

---

## 8. 初期化データと未初期化データ

### 8.1 data セクション

* DB / DW 等により **初期値を持つ**
* `.rel` に実データが出力される

---

### 8.2 bss セクション

* DS 等により **サイズのみ定義**
* 初期値は **全て 0 とみなす**
* `.rel` に **データ本体は出力しない**
* `.rel` には **サイズ情報のみ**含める

👉 *bss は「メモリ予約」*

---

## 9. Symbol と Section の関係

* label Symbol は

  * 定義された時点の

    * セクション
    * セクション内オフセット
      を持つ
* 最終アドレスは

  * Link 時に

    * セクション配置 + オフセット
      で確定する

---

## 10. Relocation との関係

* relocation.offset は

  * **セクション内オフセット**
* relocation は

  * セクションを跨いで適用されうる
* bss 内の relocation は **原則禁止**（v1）

---

## 11. 禁止事項（重要）

❌ セクションを跨いだ ORG
❌ 複数ロケーションカウンタの同時進行
❌ bss に初期値を持たせる
❌ section kind の追加
❌ アライメント未定義の暗黙 padding

---

## 12. 将来拡張方針

* read-only セクション
* overlay / banked memory
* セクション属性（R/W/X）
* Z80 バンク切替対応

これらは **SectionKind を増やさず属性追加で対応**する。

---

## 13. 設計の芯（要約）

* セクションは論理単位
* 配置はリンカ責務
* bss は「サイズのみ」
* ALIGN は Analyze が責務
* ORG は局所的

---

