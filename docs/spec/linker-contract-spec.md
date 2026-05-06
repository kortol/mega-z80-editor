# 📘 Linker Contract Specification

*(mz80 Toolchain – Linker ABI / Responsibility Contract)*

- Status: current reference
- Audience: linker and output contributors
- Related:
  - `output-format-base-spec.md`
  - `output-file-specs.md`
  - `relocation-spec.md`

---

## 1. 目的と位置づけ

Linker Contract Spec は、mz80 ツールチェーンにおける
**リンカ（linker）の責務・入力・出力・禁止事項**を定義する。

```
Assembler (mz80-as)
   └─ .rel / .sym
        ↓
Linker
        ↓
Binary Image / Executable
```

* 本 Spec は **アセンブラ実装から独立**
* Linker は **asm の内部構造を一切知らない**
* 両者の唯一の接点は **出力ファイルフォーマット**

### この Spec が決めること

- linker が受け取る入力と前提条件
- linker が担当する配置・extern 解決・patching の境界
- linker が行ってはいけない越権処理

### この Spec が決めないこと

- assembler 内部の Node / SymbolTable の実装
- parser / analyze / emit の具体ロジック
- 高度な v2 linker 機能の詳細

本 Spec において以下の用語を区別して用いる。

- 式評価（Expression Evaluation）:
  演算子、括弧、優先順位、シンボル参照を含む
  構文的な式を解釈し、値へ変換する処理。

- 数値補正（Numeric Patching）:
  正規化済みの数値情報（symbol_address, addend 等）を
  用いて最終的な書き込み値を計算し、バイナリへ反映する処理。

---

## 2. Linker の基本責務（断言）

Linker は以下のみを行う。

1. 複数 `.rel` の読み込み
2. セクション配置の決定
3. extern symbol の解決
4. relocation の適用
5. 最終バイナリイメージの生成

それ以外は **すべて禁止**とする。

---

## 3. Linker がやらないこと（最重要）

Linker は以下を **絶対に行ってはならない**。

❌ マクロ展開
❌ 命令デコード・再エンコード
❌ 式構文の評価（演算子・括弧・優先順位の解釈）
❌ 式文字列表現の解析
❌ シンボル最適化・畳み込み
❌ ソース行情報の解釈
❌ アセンブラ内部構造（Node / AST）の参照

👉 *Linker は「機械語＋補正」だけを扱う*

Linker が行う計算処理は、
Analyze フェーズで正規化された Relocation Entry に基づく
数値補正に限定される。

Linker は式を解釈せず、以下の情報のみを使用する。

- 解決済み symbol の最終アドレス
- relocation.addend
- relocation.kind
- 書き込み位置およびサイズ

---

## 4. Linker の入力仕様

### 4.1 入力ファイル

Linker は以下を入力として受け取る。

| ファイル   | 必須 | 内容              |
| ------ | -- | --------------- |
| `.rel` | ✔  | 機械語＋ relocation |
| `.sym` | 任意 | デバッグ・検証用        |

`.sym` は **参照専用**であり、
リンク処理の正当性は `.rel` のみで保証されなければならない。

Relocation Entry は Analyze フェーズにより
以下の形に正規化されていることを前提とする。

- 式構文は存在しない
- extern symbol は高々 1 つ
- 定数部分は addend として確定済み

---

### 4.2 `.rel` に対する前提条件

Linker は `.rel` に対し以下を前提としてよい。

* 機械語は **Z80 命令として正当**
* relocation は **Relocation Spec に完全準拠**
* extern symbol は **resolved = false**
* label / const は **resolved = true**

ABSOLUTE relocation
```
write_value = symbol_address + addend
```

RELATIVE relocation
```
write_value =
  (symbol_address + addend)
  - (write_address + relocation.size)
```

上記計算は数値補正であり、
式評価ではない。

---

## 5. セクション配置モデル（Linker 視点）

### 5.1 セクションの扱い

* セクションは **論理単位**
* Linker が最終的な配置アドレスを決定する
* アセンブラが仮定したアドレスを **尊重する義務はない**

---

### 5.2 セクション配置ルール（v1）

* `.text`, `.data`, `.bss` を順に配置
* 各セクションは **連続領域**
* セクション間のアライメントは

  * Section Spec に従う
  * 不足する場合は padding を挿入

---

## 6. Symbol 解決ルール

### 6.1 解決対象

Linker が解決するのは **extern Symbol のみ**。

| 種別     | Linker での扱い |
| ------ | ----------- |
| label  | 解決済み（触らない）  |
| const  | 解決済み（触らない）  |
| extern | **解決する**    |

---

### 6.2 extern 解決手順

1. 全 `.rel` の Symbol Table を収集
2. extern symbol 名をキーに定義を探索
3. 見つからない場合は **リンクエラー**
4. 見つかった場合は

   * symbol → 実アドレスへ束縛

---

### 6.3 重複定義

* extern を解決する label が複数存在する場合：

  * **リンクエラー**
* weak / local は v1 では扱わない

---

## 7. Relocation 適用ルール

### 7.1 適用対象

* relocation.kind に従って補正を行う
* relocation.addend を必ず加算する

---

### 7.2 RelocationKind ごとの処理

#### ABSOLUTE

```text
write(size) = symbol_address + addend
```

#### RELATIVE

```text
write(size) = (symbol_address + addend) - (write_address + size)
```

* size は命令仕様に従う
* 範囲外はリンクエラー

---

### 7.3 書き込み制約

* 書き込みサイズ（1/2/4 byte）厳守
* endian は **Z80 little-endian**

---

## 8. bss セクションの扱い

* bss は **メモリ予約のみ**
* 初期値書き込みは禁止
* relocation が bss に存在する場合：

  * v1 では **リンクエラー**

---

## 9. 出力仕様（Linker の成果物）

### 9.1 出力形式

Linker は以下のいずれかを出力する。

* Binary Image（フラット）
* 将来：ELF / ROM image 等

---

### 9.2 Binary Image Contract

出力は **Binary Image Spec** に準拠する。

```ts
interface BinaryImage {
  baseAddress: number;
  size: number;
  readByte(addr: number): number;
}
```

* 未配置領域は 0 を返す
* bss 領域は 0 として扱われる

---

## 10. エラー処理契約

Linker が報告するエラーは以下に限定される。

* 未解決 extern
* extern 多重定義
* relocation 適用時の範囲超過
* セクション配置失敗
* I/O エラー

**構文・意味エラーは Linker の責務外**

---

## 11. デバッグ情報との関係

* Linker は Source を解釈しない
* `.sym` は

  * デバッグツール向け
  * リンク成否に影響しない

---

## 12. 禁止事項まとめ（再掲）

❌ 命令再解釈
❌ asm 的最適化
❌ AST / Node 参照
❌ relocation 生成
❌ bss 初期化

---

## 13. 将来拡張方針

* weak symbol
* section 属性（R/W/X）
* bank / overlay
* デバッグ情報統合（DWARF 相当）

これらは **Linker Contract v2** で追加する。

---

## 14. 設計の芯（要約）

* Linker は「配置と補正」だけを行う
* extern だけが Linker の仕事
* asm は Linker を仮定しない
* 境界を越えないことが最大の正しさ

---

