
# 🧩 P2-D INCLUDE 内部仕様 ― 最終統合版（SourceFrame 同期対応）

---

## 0. 🎯 目的

複数 `.inc` ファイルを安全に展開し、
**行番号・ファイル境界・エラートレース・.lst 出力** を正確に再現する。

そのために：

* INCLUDE の展開を AST ノードとして扱う
* 呼び出し階層を **SourceFrame スタック** で追跡
* **エラー時のみスナップショット** を保持（通常時はリアルタイム更新）
* `analyze` / `emit` でも **SourceFrame を再構築** し整合を保つ

---

## 1. Tokenizer 拡張 ― `stringValue` 対応

```ts
export type TokenKind = "ident"|"num"|"string"|"comma"|"colon"|"lparen"|"rparen"|"op"|"eol";

export interface Token {
  kind: TokenKind;
  text: string;
  value?: number;        // 数値リテラル
  stringValue?: string;  // 文字列リテラル ("mac.inc" → mac.inc)
  line: number;
  col: number;
}
```

```ts
if (rest[0] === '"' || rest[0] === "'") {
  const q = rest[0];
  const m = rest.match(new RegExp(`^${q}([^${q}]*)${q}`));
  if (!m)
    throw new Error(`Tokenizer error at line ${lineNo+1}, col ${col}: unterminated string literal`);
  const text = m[0], inner = m[1];
  tokens.push({ kind:"string", text, stringValue:inner, line:lineNo+1, col });
  col += text.length; continue;
}
```

✅ `INCLUDE "defs.inc"` → `"defs.inc"` トークンが `stringValue:"defs.inc"` を持つ。

---

## 2. Parser ― INCLUDE のノード化

```ts
export interface NodePseudo {
  kind: "pseudo";
  op: string;                 // "INCLUDE" など
  args: { value: string }[];  // INCLUDE は [{ value:"defs.inc" }]
  line: number;               // 現在ファイル内のローカル行番号
  file: string;               // 所属ファイル
}
```

```ts
if (op === "INCLUDE") {
  if (line.length < 2 || line[1].kind !== "string") {
    throw makeError(AssemblerErrorCode.SyntaxError, "INCLUDE expects a string literal", ctx);
  }
  const path = line[1].stringValue!;
  nodes.push({ kind:"pseudo", op:"INCLUDE", args:[{ value:path }], line: line[0].line, file: ctx.currentFile });
  return;
}
```

---

## 3. SourceFrame／AsmContext 構造

```ts
export interface SourceFrame {
  kind: "file" | "macro";
  name: string;
  line: number; // 呼び出し元行
}

export interface AsmContext {
  currentFile: string;
  currentLine: number;
  includeStack: SourceFrame[];
  macroStack: SourceFrame[];
  nodeStack: { node: any; file: string }[];
  includeCache: Set<string>;
  sectionStack: string[];
  errors: AsmError[];
  currentSection: string;
  currentTexts?: string[];
}
```

---

## 4. エラー構造とスナップショット

```ts
export interface NodeInfo {
  type: "Pseudo" | "Instr" | "Label";
  opcode?: string;
  symbol?: string;
  exprText?: string;
}

export interface AsmError {
  code: AssemblerErrorCode;
  message: string;
  file?: string;
  line?: number;
  node?: NodeInfo;
  texts?: string[];
  trace?: string[];
}
```

### `makeError()` 実装（リアルタイム Stack → スナップショット）

```ts
export function makeError(code: AssemblerErrorCode, message: string, ctx: AsmContext): AsmError {
  const top = ctx.includeStack.at(-1);
  const curNode = ctx.nodeStack.at(-1)?.node;

  const nodeInfo = curNode && {
    type: curNode.kind === "pseudo" ? "Pseudo" :
          curNode.kind === "instr"  ? "Instr"  : "Label",
    opcode: (curNode.op ?? undefined),
    symbol: (curNode.name ?? undefined),
    exprText: curNode.args?.map(a => a.value ?? a).join(","),
  };

  const trace = [
    ...ctx.macroStack.map(m => `expanded from macro ${m.name} (line ${m.line})`),
    ...ctx.includeStack.map(f => `included from ${f.name} (line ${f.line})`),
  ].reverse();

  return {
    code,
    message,
    file: top?.name ?? ctx.currentFile,
    line: curNode?.line ?? top?.line,
    node: nodeInfo,
    texts: ctx.currentTexts ? [...ctx.currentTexts] : undefined,
    trace,
  };
}
```

---

## 5. INCLUDE ハンドラ（parse フェーズ）

```ts
function handleInclude(node: NodePseudo, ctx: AsmContext) {
  const absPath = resolveIncludePath(node.args[0].value, ctx);
  if (!absPath)
    throw makeError(AssemblerErrorCode.IncludeNotFound, `File not found: ${node.args[0].value}`, ctx);

  if (ctx.includeStack.some(f => f.name === absPath))
    throw makeError(AssemblerErrorCode.IncludeLoop, `Circular include: ${absPath}`, ctx);

  if (ctx.includeCache.has(absPath))
    return; // 重複読み込みスキップ

  ctx.includeCache.add(absPath);
  ctx.includeStack.push({ kind:"file", name: absPath, line: node.line });
  ctx.sectionStack.push(ctx.currentSection);

  includeFile(absPath, ctx);  // tokenize→parse→analyze 再帰呼び出し

  ctx.currentSection = ctx.sectionStack.pop()!;
  ctx.includeStack.pop();
}
```

---

## 6. 🎯 analyze／emit フェーズでの SourceFrame 再構築

### 6.1 目的

`parse` フェーズで構築した Node 群を後フェーズで再走査する際、
**Node.file と ctx.currentFile／includeStack.top を同期** させる。

### 6.2 共通ユーティリティ

```ts
function withSourceFrame<T>(ctx: AsmContext, node: Node, fn: () => T): T {
  const file = node.file ?? ctx.currentFile;
  const needPush = ctx.includeStack.at(-1)?.name !== file;

  if (needPush) {
    ctx.includeStack.push({ kind:"file", name:file, line:node.line });
    ctx.currentFile = file;
  }
  ctx.nodeStack.push({ node, file });

  try {
    return fn();
  } finally {
    ctx.nodeStack.pop();
    if (needPush) ctx.includeStack.pop();
    ctx.currentFile = ctx.includeStack.at(-1)?.name ?? file;
  }
}
```

### 6.3 使用例

```ts
// analyze phase
for (const node of module.nodes) {
  withSourceFrame(ctx, node, () => analyzeNode(node, ctx));
}

// emit phase
for (const node of module.nodes) {
  withSourceFrame(ctx, node, () => emitNode(node, ctx));
}
```

→ これにより、**全フェーズで SourceFrame 一致原則が維持される。**

---

## 7. 一致原則と例外

| 状況       | includeStack.top | node.file | 備考                     |
| -------- | ---------------- | --------- | ---------------------- |
| 通常ノード    | 同一               | 同一        | ✅ 一致                   |
| INCLUDE中 | サブファイル名          | サブファイル    | ✅ 一致                   |
| push前エラー | 呼び出し元            | 呼び出し元     | ⚠️ 許容                  |
| マクロ展開    | ファイル             | ファイル      | ✅ 一致（traceにmacroStack） |
| リンク／遅延評価 | 不定               | node.file | ⚠️ snapshot依存          |

---

## 8. .lst v2 出力例

```
;#include "defs.inc" (from main.asm line 42)
0000  3E 00      LD A,0
0002  06 01      LD B,1
;#end include defs.inc
```

エラーを含む場合：

```
;! ERROR: Undefined symbol BAR
;! in defs.inc (line 12)
;! trace:
;!   included from main.asm (line 42)
```

---

## 9. テスト観点

| ID  | テスト内容             | 目的                |
| --- | ----------------- | ----------------- |
| T01 | include 単層        | INCLUDE 動作確認      |
| T02 | include ネスト       | スタック整合性           |
| T03 | duplicate include | キャッシュ動作           |
| T04 | circular include  | ループ検出             |
| T05 | not found         | push 前エラー         |
| T06 | analyze 内部エラー     | SourceFrame 再構築確認 |
| T07 | emit 内部エラー        | LST／trace 整合確認    |
| T08 | section 保存復帰      | sectionStack 検証   |

---

## 10. 設計原則まとめ

| 観点           | 原則                                                          |
| ------------ | ----------------------------------------------------------- |
| Node         | ファイル名とローカル行を保持                                              |
| Stack        | リアルタイム更新、Error 時のみスナップショット                                  |
| analyze／emit | withSourceFrame() で Node.file に同期                           |
| trace        | includeStack＋macroStack を統合表示                               |
| .lst         | ファイル境界を自動出力                                                 |
| 一致原則         | ctx.includeStack.top.name === ctx.currentFile === node.file |

---

## ✅ 結論

> INCLUDE は「AST ノード化」「リアルタイム SourceFrame」「全フェーズ同期」の三本柱で構築する。
>
> * **parse**：INCLUDE ノード生成＋Stack push/pop
> * **analyze／emit**：Node ごとに SourceFrame を再現（withSourceFrame）
> * **error／.lst**：リアルタイム Stack から snapshot を生成
>
> この設計により、`.lst`／`.map`／`エラーtrace`／`IDEジャンプ` の全てが
> 完全に整合した出力を得られる。

