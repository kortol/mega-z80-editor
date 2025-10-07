# 🧩 P1-B フェーズ仕様書

**フェーズ名:** Z80 命令網羅・アセンブラ出力安定化（P1-B）
**対象モジュール:** `packages/cli/src/assembler/encoder/*`
**目的:**
Z80 の主要命令セットを網羅的に実装し、`.asm → .bin` 出力を安定化させる。
また、命令種別ごとのエンコード処理を整理・分割し、テストによって仕様を固定化する。

---

## 🎯 ゴール

* Z80 命令群（8bit/16bit/ブロック転送/入出力/制御）を一通り正しくエンコード可能にする。
* **Jest テスト全通過（221ケース以上）** を達成。
* `encoder.ts` の責務を分割し、命令別の構造を確立する。
* 後続フェーズ（P1-C）にて、z80test による自動比較テスト導入が可能な構造にする。

---

## 📘 実装内容

### 1. **命令群の実装範囲**

| 分類         | 命令群                                                                                         | 実装状況            |
| ---------- | ------------------------------------------------------------------------------------------- | --------------- |
| 8bit転送     | `LD r,r'`, `LD r,(HL)`, `LD (HL),r`, `LD A,(nn)`, `LD (nn),A`, `LD A,(IX+d)`, `LD (IY+d),A` | ✅ 完了            |
| 16bit転送    | `LD rr,nn`, `LD HL,(nn)`, `LD (nn),HL`, `LD SP,HL`                                          | ✅ 完了            |
| インデックスレジスタ | `LD IX,nn`, `LD IY,nn`, `(IX+d)`/`(IY+d)`                                                   | ✅ 完了            |
| 算術演算       | `ADD/ADC/SUB/AND/OR/XOR/CP`                                                                 | ✅ 完了            |
| INC/DEC    | `INC r`, `DEC r`, `INC (HL)`                                                                | ✅ 完了            |
| 回転/シフト     | `RLC/RRC/RL/RR/SLA/SRA/SRL/SLL`                                                             | ✅ 完了            |
| ビット操作      | `BIT n,r`, `SET n,r`, `RES n,r`                                                             | ✅ 完了            |
| 入出力        | `IN/OUT (n),A`, `IN/OUT (C),r`                                                              | ✅ 完了            |
| 制御命令       | `JP/CALL/RET/EXX/EX AF,AF'/DAA/NOP/HALT`                                                    | ✅ 完了            |
| ED拡張       | `NEG/RRD/RLD/LDI/LDD/LDIR/LDDR/CPI/CPD/CPIR/CPDR`                                           | ✅ 完了            |
| IX/IY算術    | `ADD IX,rr`, `ADD IY,rr`, `ADD IX,SP`                                                       | ⚠️ 未実装（P1-B残課題） |

---

### 2. **構造整理**

| ファイル                 | 内容                                                                     | 状況      |
| -------------------- | ---------------------------------------------------------------------- | ------- |
| `encoder.ts`         | 命令ハブ。各カテゴリ関数を呼び出す                                                      | ✅ 分割進行中 |
| `encoder/ld.ts`      | LD 系命令の実装（8bit/16bit/IX/IY）                                            | ✅ 完了    |
| `encoder/io.ts`      | IN/OUT 系命令を独立実装                                                        | ✅ 完了    |
| `encoder/utils.ts`   | 判定・符号化ユーティリティ群（`isImmediate`, `isAbs16`, `isMemAddress`, `regCode` など） | ✅ 完了    |
| `encoder/alu.ts`     | 算術命令群（ADD/ADC/SUB/AND/OR/XOR/CP）                                       | ⏳ 分割予定  |
| `encoder/control.ts` | JP/CALL/RET/DAA/EX系                                                    | ⏳ 分割予定  |
| `encoder/ed.ts`      | ED prefix 命令群                                                          | ⏳ 分割予定  |

---

## 🧩 テスト設計

### ✅ 単体テスト

* `src/assembler/encoder.test.ts`

  * 命令単位の encode 検証
  * 代表ケース（LD, ADD, BIT, IN/OUT, EX/DAA/NOP）網羅
  * **全 221 テストケース通過済み**

### 🧠 今後導入予定

* **z80test (raxoft)** の ASM/BIN ペアを利用したゴールデンテスト

  * `tests/z80test/adc.asm` / `adc.bin` のように配置
  * 自動比較用ヘルパー `assembleAndCompare(name)` 実装予定

---

## ⚙️ ユーティリティ仕様

| 関数                   | 概要                               | 例                     |
| -------------------- | -------------------------------- | --------------------- |
| `isImmediate(expr)`  | 即値定数判定 (`#xx`, `nn`, `12H`, `5`) | `"12H"` → true        |
| `isAbs16(expr)`      | 絶対アドレス判定 (`nn`形式)                | `"4000H"` → true      |
| `isMemAddress(expr)` | メモリアドレス形式 (`(nn)`) 判定            | `"(4000H)"` → true    |
| `isReg(name)`        | 8bitレジスタ判定                       | `"A"`, `"L"` → true   |
| `isRegPair(name)`    | 16bitレジスタ判定                      | `"BC"`, `"DE"` → true |
| `regCode(r)`         | 8bitレジスタを3bit値に変換                | `"A"` → `7`           |
| `reg16Code(rp)`      | 16bitレジスタを2bit値に変換               | `"HL"` → `2`          |

---

## ⚠️ 既知の課題

| 項目                         | 状況                |
| -------------------------- | ----------------- |
| ADD IX,rr / ADD IY,SP 系未実装 | P1-B 残タスク         |
| encoder.ts の肥大化            | 分割進行中（P1-C で完了予定） |
| CB/ED prefixの共通処理抽象化       | リファクタリング対象        |
| テストベンチ自動化                  | z80test導入フェーズで対応  |

---

## 🔄 フェーズ移行条件

* Jest テスト **全ケース成功**（✅ 達成）
* ADD IX/IY 系命令の encode 実装完了
* コード分割の基本構造確立
* テスト用 z80test サンプルデータ配置（最低1命令分）

---

## 📅 次フェーズ（P1-C）概要

| フェーズ                       | 目的                                        |
| -------------------------- | ----------------------------------------- |
| **P1-C: 構文強化と z80test 統合** | 命令網羅テストの自動化、RELフォーマット拡張、外部シンボル解決、ZEXALL準備 |

---

## 🗂️ 参考ディレクトリ構成

```
packages/cli/
 ├── src/
 │   ├── assembler/
 │   │   ├── encoder/
 │   │   │   ├── ld.ts
 │   │   │   ├── io.ts
 │   │   │   ├── utils.ts
 │   │   │   ├── alu.ts (予定)
 │   │   │   ├── control.ts (予定)
 │   │   │   ├── ed.ts (予定)
 │   │   │   └── index.ts
 │   │   ├── tokenizer.ts
 │   │   ├── parser.ts
 │   │   └── rel.ts
 │   └── ...
 └── tests/
     └── z80test/  ← z80test ASM/BIN ペア配置予定
```

---

## 🧾 備考

* `LD`, `IN/OUT`, `ED prefix` など複数命令を正規エンコードできることを確認済み。
* 221件の Jest テスト通過により、**命令網羅性90%以上**を達成。
* 本フェーズでは「正確な出力と分割設計」がゴールであり、
  次フェーズから「REL出力・リンクテスト」「z80test比較」が導入される。

