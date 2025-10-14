# 🧩 **P2-C: フェーズ管理／Emit統合／セクション拡張 仕様書（完了版）**

**プロジェクト:** MegaZ80Editor  
**フェーズ:** P2-C  
**作成日:** 2025-10-14  
**状態:** ✅ 完了（All Tests Green）

---

## 🎯 **目的**

アセンブラの内部処理を以下の3軸で再構成し、  
マクロ展開・インクルード展開・遅延評価・複数セクションを安全に統合可能な基盤を整備する。

| 軸           | 概要 |
|--------------|------|
| **フェーズ管理** | tokenize → parse → analyze → emit → optimize → link の遷移を統一し、依存解決をフェーズ単位で制御する。 |
| **Emit共通化** | バイト出力・Fixup登録・セクション切替などを統一APIに集約し、誤出力を防止。 |
| **セクション拡張** | `.text` / `.data` / `.bss` / `.custom` に対応し、独立した LC／size を保持する。 |

---

## 🧱 **1. フェーズ管理構造**

### 定義

```ts
export type AsmPhase =
  | "tokenize"
  | "parse"
  | "analyze"
  | "macro"
  | "emit"
  | "optimize"
  | "link";
````

### 遷移ルール

```ts
const validTransitions: Record<AsmPhase, AsmPhase[]> = {
  tokenize: ["parse"],
  parse: ["analyze"],
  analyze: ["macro", "emit"],
  macro: ["analyze", "emit"],
  emit: ["optimize"],
  optimize: ["link", "emit"],
  link: [],
};
```

### 遷移API

```ts
export function setPhase(ctx: AsmContext, next: AsmPhase) {
  const allowed = validTransitions[ctx.phase] ?? [];
  if (!allowed.includes(next)) {
    throw new Error(`Invalid phase transition: ${ctx.phase} → ${next}`);
  }
  ctx.phase = next;
}
```

---

## 🧠 **2. 式評価と遅延解決ポリシー**

| タイプ   | 評価タイミング | フェーズ    | 備考                |
| ----- | ------- | ------- | ----------------- |
| 即値式   | parse時  | analyze | EQU, SET          |
| 配置依存式 | LC依存    | emit    | DS, ALIGN         |
| 外部依存式 | 他モジュール  | link    | EQU EXT+4         |
| 構造依存式 | マクロ展開   | macro   | REPT, LOCAL_LABEL |

---

## 🧩 **3. 未解決シンボル構造**

```ts
export interface UnresolvedEntry {
  addr: number;
  symbol: string;
  size: 1 | 2 | 4;
  addend: number;
  requester: {
    op: string;
    phase: "assemble" | "link";
    file?: string;
    line?: number;
  };
}
```

登録例：

```ts
emitFixup(ctx, "EXTVAL", 2, {
  op: "EQU",
  phase: "link",
  line: node.line
}, 4);
```

---

## ⚙️ **4. Emit共通API**

| 関数                    | 目的           | 備考                     |
| --------------------- | ------------ | ---------------------- |
| `emitBytes()`         | バイト列出力       | TEXTセクションに記録           |
| `emitWord()`          | 16bit出力      | Little-endian          |
| `emitFixup()`         | 未解決登録＋仮データ   | requester情報付き          |
| `emitSection()`       | セクション切替      | `.text`/`.data`/`.bss` |
| `emitGap()`           | ゼロ埋め         | DS命令など                 |
| `emitAlign()`         | アドレス境界調整     | 2^nアライン                |
| `getLC()` / `setLC()` | LC取得・設定      | ORG対応                  |
| `advanceLC()`         | LC前進（非emit時） | analyze時に使用            |

---

## 📦 **5. セクション構造**

```ts
export interface SectionState {
  id: number;
  name: string;
  kind: "TEXT" | "DATA" | "BSS" | "CUSTOM";
  align: number;
  flags: number;
  lc: number;
  size: number;
  bytes: number[];
}
```

特徴：

* `.text` はデフォルトで存在（id=0）
* 各セクションは LC／size／bytes を完全独立管理
* 切替時に `prev.lc` / `prev.size` を保存

---

## 🧩 **6. INCLUDE／MACRO／PHASE連携図**

```mermaid
flowchart LR
A[tokenize] --> B[parse]
B --> C[analyze]
C -->|INCLUDE解決| D[macro expand]
D --> E[emit]
E -->|fixup resolve| F[optimize]
F -->|未解決チェック| G[link]
```

---

## 🧩 **7. フェーズゲートチェック**

| フェーズ     | 未解決許可                    | 検証処理   |
| -------- | ------------------------ | ------ |
| analyze  | ❌                        | 定義漏れ不可 |
| emit     | ⚠️ assemble-phase 未解決を許可 |        |
| optimize | ✅ assemble再評価を実施         |        |
| link     | ✅ link-phase未解決を解消       |        |
| finalize | ❌ 全解決必須                  |        |

---

## 🧾 **8. 成果物と連携先**

| 出力ファイル | 内容                           |
| ------ | ---------------------------- |
| `.rel` | Fixup含む再配置情報                 |
| `.map` | セクション別シンボルマップ                |
| `.lst` | フェーズ別構文展開結果（INCLUDE/MACRO反映） |
| `.sym` | 最終シンボル表（評価値／フェーズ反映付き）        |

---

## ✅ **9. 完了判定**

| 項目                   | 結果 | 備考                                       |
| -------------------- | -- | ---------------------------------------- |
| PhaseManager実装       | ✅  | 全フェーズ遷移統一                                |
| Emit共通化              | ✅  | emitBytes/emitFixup安全化完了                 |
| ctx.loc／section.lc同期 | ✅  | Overlap解消                                |
| .lst行番号整合            | ✅  | 全integration test通過                      |
| .rel出力整合             | ✅  | T/R/E完全一致                                |
| Integration全通過       | ✅  | 45 test suite / 450 assertions ALL GREEN |

---

## 🧠 **10. 次フェーズへの引き継ぎ課題**

| No | 項目                | 対応予定           |
| -- | ----------------- | -------------- |
| 1  | encode各命令のemit統合化 | P2-F（AST化時に対応） |
| 2  | ORG／SECTION切替安全化  | P2-D（セクション拡張）  |
| 3  | INCLUDE多段展開       | P2-D           |
| 4  | Macro Stage1実装    | P2-E           |
| 5  | emitBatch最適化      | P2-F           |

---

## 🏁 **P2-C フェーズ完了コメント**

> これにより、Assemblerは「状態遷移駆動＋emit安全化」基盤を獲得した。
> フェーズごとの責務が明確化され、今後の INCLUDE／MACRO／AST 拡張を
> 安全に実装できる下地が整った。

---

📘 **次フェーズ:**
→ [P2-D: INCLUDE／マルチレベル対応設計書ドラフト](./P2-D.md) に続く。

```

