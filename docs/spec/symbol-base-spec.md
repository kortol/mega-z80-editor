# 📘 Symbol Base Specification

*(mz80-as Symbol Contract – Analyze / Emit / Link shared)*

---

## 1. 目的と位置づけ

Symbol Base Spec は、mz80-as における **すべてのシンボルの意味分類・属性・ライフサイクル**を定義する内部仕様である。

```
Parser / Macro
   ↓
Analyze  ← Symbol 定義・参照が確定
   ↓
Emit (.rel / .sym)
   ↓
Linker
```

* **「シンボルとは何か」**をこの Spec で一意に定義する
* 各フェーズは **この分類に従属**する
* ad-hoc な扱いは禁止する

---

## 2. Symbol の基本定義

### 2.1 Symbol とは

> Symbol とは、
> **名前を持ち、値またはアドレスに解決される参照単位**である。

Symbol は以下のいずれかを必ず持つ。

* 確定値（数値）
* 相対・絶対アドレス
* 外部解決待ち参照

---

## 3. Symbol の分類（最重要）

### 3.1 SymbolKind（固定・追加禁止）

```ts
type SymbolKind =
  | 'label'      // アドレスラベル
  | 'const'      // 定数（EQU 等）
  | 'extern'     // 外部参照
  | 'section';   // セクションシンボル（将来拡張）
```

* **新しい SymbolKind の追加は禁止**
* 特殊用途は属性で表現する

---

## 4. 共通 Symbol 属性

```ts
interface SymbolBase {
  name: string;
  kind: SymbolKind;

  /** 解決済みかどうか */
  resolved: boolean;

  /** 定義元 Node（エラー・追跡用） */
  source: Source;
}
```

---

## 5. 各 SymbolKind の意味論

---

### 5.1 Label Symbol（アドレスラベル）

```ts
interface LabelSymbol extends SymbolBase {
  kind: 'label';

  /** アドレス（Analyze 後に確定） */
  address?: number;

  /** 定義セクション */
  section?: string;
}
```

#### 特性

* プログラム配置アドレスを指す
* `resolved = true` は Analyze 完了後
* ローカルラベルもこの種別に含める

---

### 5.2 Const Symbol（定数 / EQU）

```ts
interface ConstSymbol extends SymbolBase {
  kind: 'const';

  /** 定数値（Analyze 後に確定） */
  value?: number;
}
```

#### 特性

* メモリ配置を持たない
* 再配置対象にならない
* `.sym` に出力されるが `.rel` には影響しない

---

### 5.3 Extern Symbol（外部参照）

```ts
interface ExternSymbol extends SymbolBase {
  kind: 'extern';

  /** 解決はリンク時 */
  resolved: false;
}
```

#### 特性

* Analyze 完了時点では未解決
* `.rel` に外部参照として記録
* リンカが最終解決する

---

### 5.4 Section Symbol（将来拡張）

```ts
interface SectionSymbol extends SymbolBase {
  kind: 'section';

  /** セクション開始アドレス */
  address?: number;
}
```

※ 現行では **SectionSymbol は生成しなくてよい**
（Spec 上の予約）

---

## 6. Symbol のライフサイクル

### 6.1 定義フェーズ（Analyze）

| 種別      | 定義タイミング          |
| ------- | ---------------- |
| label   | NodeLabel / 疑似命令 |
| const   | EQU              |
| extern  | EXTERN 疑似命令      |
| section | SECTION          |

Analyze は以下を保証する：

* 重複定義検出
* const / label の解決
* extern は未解決のまま保持

---

### 6.2 使用フェーズ（Analyze）

* 命令オペランド内の識別子は

  * Symbol として参照解決される
* 未定義かつ extern でない場合は **Analyze エラー**

---

### 6.3 出力フェーズ（Emit）

* `.sym`

  * すべての Symbol を出力
  * kind / 値 / アドレス / extern 状態を明示
* `.rel`

  * extern Symbol の参照情報を含める
  * label / const の確定値も含めてよい

---

## 7. 禁止事項（重要）

❌ 「未解決 label」を extern 扱いする
❌ const を relocation 対象にする
❌ extern を Analyze で解決する
❌ SymbolKind を増やす
❌ Node なしで Symbol を生成する

---

## 8. エラー処理契約

以下は **Analyze エラー**とする。

* label / const の重複定義
* 未定義シンボル参照（extern 宣言なし）
* extern symbol に値を割り当てる行為

エラー報告には **定義元 / 使用元の Source** を使用する。

---

## 9. 将来拡張方針

* weak symbol
* local / global visibility
* section 属性拡張

これらは **属性追加**で対応し、
SymbolKind は増やさない。

---

## 10. 設計の芯（要約）

* Symbol は **4 種類に固定**
* extern は「未解決を許容する唯一の種別」
* const は「再配置しない値」
* label は「配置アドレス」
* Analyze が責任を持って分類・解決する
