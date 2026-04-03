# 🧩 P2-L フェーズ仕様書 - PEG単一路線化と Legacy Parser 除去

---

## 🎯 フェーズ目的

P2-L の目的は、アセンブラのパーサ経路を **PEG のみ**に統一し、`legacy parser` の実行経路と運用負債を除去すること。

これにより、以下を達成する。

- パース経路の単純化（実装・テスト・運用）
- Node 契約の明確化（実装依存から契約依存へ）
- 互換検証の軸を「legacy比較」から「PEGゴールデン回帰」へ移行

---

## 🧭 スコープ

### In Scope

- CLI の parser 切替廃止（`--parser` 削除）
- `assemble` / `include` / test utility の parser 分岐廃止
- Node 型の分離（`parser.ts` 実装依存の解消）
- legacy 比較テスト基盤の再編
- legacy parser 実装・関連スクリプト・文言の整理

### Out of Scope

- 命令エンコード仕様の変更
- PEG 文法の機能拡張（新命令追加など）
- Source ABI / Node ABI の破壊的変更
- マクロ意味論の新規変更

---

## 🏗 設計方針

### 1. 経路統一

- Parse は常に `parsePeg()` を使用する
- `AsmOptions.parser` を廃止し、呼び出し側の分岐をなくす

### 2. 依存分離

- `pegAdapter` や encoder/pseudo 群が `legacy parser 実装` ではなく
  `Node 契約（型モジュール）` を参照する
- `parser.ts` が担っていた「型定義」と「legacyトップレベルparse」を分離する

### 3. 段階削除

- いきなり全削除せず、以下の順で進める
  1) 型分離
  2) 実行分岐除去
  3) テスト再編
  4) legacy 実装削除

### 4. 安全柵

- 主要 fixture を PEG 単体回帰で維持
- `include` / macro loop / conditional の既存挙動を回帰テストで固定

---

## ⚙️ 実装タスク一覧

| No      | タスク | 内容 |
| ------- | ------ | ---- |
| P2-L-01 | Node型分離 | `Node*` 型を parser 実装から独立ファイルへ移設し、参照先を置換 |
| P2-L-02 | Assemble経路一本化 | `assemble()` の legacy/peg 分岐を削除し PEG 固定化 |
| P2-L-03 | INCLUDE経路一本化 | `pseudo/include.ts` の parser 分岐を削除し PEG 固定化 |
| P2-L-04 | CLI仕様更新 | `--parser` 廃止、help/README/docs を更新 |
| P2-L-05 | 互換テスト再編 | `compare legacy vs peg` 基盤を縮退し PEG ゴールデン回帰へ移行 |
| P2-L-06 | ビルド整理 | `build:parser_old` など legacy parser 前提の script を整理 |
| P2-L-07 | 実装削除 | legacy トップレベル parser 実装と未使用導線を削除 |
| P2-L-08 | 回帰確認 | 既存主要テスト・実ファイルアセンブル・出力物検証 |

---

## 🧪 テスト方針

### 回帰の主軸

- PEG fixture テスト（unit）
- 実ファイル群のアセンブルテスト（integration）
- `.rel/.lst/.sym` の出力整合テスト（golden/比較）

### 削除・変更対象

- legacy 比較を前提とするアサーション
- CLI の parser 切替に依存するテスト

### 検証観点

- 構文エラー位置の一貫性
- macro 展開後の挙動（REPT/IRP/IRPC/WHILE）
- INCLUDE 再帰展開と循環検出
- 既存 examples の assemble 成功率

---

## 📦 成果物（変更カテゴリ）

- Code
  - parser 経路分岐の除去
  - Node 型参照の統一
  - legacy 実装削除
- Test
  - PEG 単体系の強化
  - 比較基盤の縮退/置換
- Docs
  - CLI / compatibility 文書更新
  - parser contract の実装注記更新

---

## ✅ 完了条件（DoD）

以下をすべて満たした時点で P2-L 完了とする。

1. CLI から `--parser` が削除され、PEG 単一路線で動作する
2. `assemble` / `include` / test utility の parser 分岐が消えている
3. legacy parser 実行経路がコード上に存在しない
4. 主要テストが all green（PEG 回帰基準）
5. README / docs が実装状態と一致している

---

## ⚠️ リスクと対策

### リスク1: 型依存の崩れ

- 症状: `pegAdapter` などが `parser.ts` に暗黙依存
- 対策: 先行で Node 型分離（P2-L-01）を実施

### リスク2: マクロ再パース経路の破断

- 症状: `parseTokens()` 参照が壊れる
- 対策: `macro` 系で必要な最小パース機能を維持しつつ段階的に移行

### リスク3: 比較基盤喪失による品質低下

- 症状: legacy 比較を失い検知力が低下
- 対策: 実ファイルゴールデン + 出力比較の強化で代替

---

## 🚚 推奨実装順序

1. P2-L-01 Node型分離
2. P2-L-02 / 03 経路一本化
3. P2-L-04 CLI更新
4. P2-L-05 テスト再編
5. P2-L-06 / 07 legacy資産整理・削除
6. P2-L-08 回帰とドキュメント最終整合

---

## 🔭 次フェーズ接続（P2-F）

P2-L 完了後、P2-F では以下に集中できる。

- parser 実装差分に左右されない IR/AST 整理
- encode/error/listing の一貫性改善
- パフォーマンス最適化（単一路線化の恩恵）



