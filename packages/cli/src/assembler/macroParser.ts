import { AsmContext, LoopKind, SourcePos } from "./context";
import { AssemblerErrorCode, makeError } from "./errors";
import { getDefByName } from "./macro";
import { Token } from "./tokenizer";
import type { Node, NodeLoopBase, PseudoArg } from "./node";
export type {
  Node,
  NodeInstr,
  PseudoArg,
  NodePseudo,
  NodeLabel,
  NodeMacroDef,
  NodeMacroInvoke,
  NodeEmpty,
  NodeLoopBase,
} from "./node";

export function parseTokens(tokens: any[], ctx: AsmContext, opts?: any): Node[] {
  const savedTokens = ctx.tokens;
  const savedPhase = ctx.phase;

  try {
    // --- isolate parse for IRP/IRPC/REPT expansion ---
    ctx.tokens = tokens;
    ctx.phase = "macroExpand";

    const nodes = parse(ctx, tokens);
    if (nodes && nodes.length > 0) return nodes;

    // 🧩 fallback: minimal node when parser gives nothing
    if (tokens.length >= 2 && /^[A-Za-z]/.test(tokens[0].text)) {
      const pos: SourcePos = {
        file: ctx.currentPos.file ?? "macro",
        line: 0,
        phase: "macroExpand"
      };
      return [{
        kind: "instr",
        op: tokens[0].text.toUpperCase(),
        args: tokens.slice(1).map(t => t.text),
        pos: pos,
      }];
    }

    return [];
  } finally {
    ctx.tokens = savedTokens;
    ctx.phase = savedPhase;
  }
}

export function parse(ctx: AsmContext, tokens: Token[]): Node[] {

  const nodes: Node[] = [];
  let line: Token[] = [];
  let skipUntil: SourcePos | null = null;

  function flushLine(eolPos?: SourcePos) {
    if (line.length === 0) {
      if (eolPos) {
        nodes.push({ kind: "empty", pos: eolPos });
      }
      return nodes;
    }

    // --- ENDM/ENDR行は無視（MACRO定義/REPEAT終端なので通常命令扱いしない） ---
    if (
      line.length === 1 &&
      line[0].kind === "ident" &&
      ["ENDM", "ENDR"].includes(line[0].text.toUpperCase())
    ) {
      return nodes;
    }

    // --- MACRO 本体スキップ中なら無視 ---
    if (skipUntil) {
      const pos = line[0].pos;
      if (pos.file === skipUntil.file && pos.line <= skipUntil.line) {
        return nodes; // ENDM までスキップ
      }
    }

    // ラベル（ident + colon）
    if (
      line.length >= 2 &&
      line[0].kind === "ident" &&
      line[1].kind === "colon"
    ) {
      const label = line[0].text;
      const afterColon = line.slice(2);

      if (
        afterColon.length >= 1 &&
        afterColon[0].kind === "ident" &&
        afterColon[0].text.toUpperCase() === "EQU"
      ) {
        // FOO: EQU ... → NG
        throw makeError(
          AssemblerErrorCode.InvalidEquSyntax,
          `EQU cannot be used with label syntax at line ${line[0].pos.line}`
        );
      }

      nodes.push({
        kind: "label",
        name: label,
        pos: line[0].pos
      });
      line = afterColon;
      if (line.length === 0) return nodes;
    }

    // --- 🟩 ループマクロ命令 (REPT / IRP / IRPC / WHILE / ENDW / ENDM) ---
    const loopOps = ["REPT", "REPEAT", "IRP", "IRPC", "WHILE", "ENDW", "ENDM", "ENDR"];
    // ループマクロ（REPT/IRP/IRPC/WHILE）
    if (line[0].kind === "ident" && loopOps.includes(line[0].text.toUpperCase())) {
      const rawOp = line[0].text.toUpperCase();
      const op = (rawOp === "REPEAT" ? "REPT" : rawOp) as LoopKind;
      const args = line.slice(1).map((t) => t.text);


      // 追加: REPT のときは 1トークン目を countExpr に入れる
      let countExpr: any | undefined;
      let condExpr: any | undefined;

      if ((op === "REPT" || op === "IRP" || op === "IRPC") && line.length >= 2) {
        const countTok = line[1]; // "3" トークン
        // 既存の evalConst が参照できる程度の簡易 Expr をセット（text と pos）
        countExpr =
          countTok.kind === "num"
            ? { kind: "Expr", value: countTok.value, text: countTok.text, pos: countTok.pos }
            : { kind: "Expr", text: countTok.text, pos: countTok.pos };
      } else if (op === "WHILE" && line.length >= 2) {
        // WHILE 条件は 2トークン目以降をまとめて
        const condText = line.slice(1).map(t => t.text).join(" ");
        condExpr = { text: condText, pos: line[1].pos };
      }

      const bodyTokens: Token[] = [];
      let endPos: SourcePos | null = null;

      // 終端語：WHILEはENDW、他はENDM
      const terminator =
        op === "WHILE" ? "ENDW" : (rawOp === "REPEAT" ? "ENDR" : "ENDM");

      // 現在行の最後のトークン位置から先を走査して本文収集
      const startIdx = tokens.indexOf(line[line.length - 1]) + 1;
      for (let i = startIdx; i < tokens.length; i++) {
        const t = tokens[i];

        if (t.kind === "ident" && t.text.toUpperCase() === terminator) {
          endPos = t.pos;
          break;
        }
        bodyTokens.push(t);
      }

      // 終端が見つからないのはエラー
      if (!endPos) {
        throw makeError(
          AssemblerErrorCode.SyntaxError,
          `Missing ${terminator} for ${op}`,
          { pos: line[0].pos }
        );
      }

      // ノード化
      const loopNode: NodeLoopBase = {
        kind: "macroLoop",
        op,
        args,
        pos: line[0].pos,
        countExpr,
        condExpr,
        bodyTokens,
      };
      if (op === "IRPC") {
        const symbolTok = line[1];
        const stringTok = line.find((t) => t.kind === "string");
        if (symbolTok?.kind === "ident") {
          loopNode.symbolName = symbolTok.text;
        }
        if (stringTok) {
          loopNode.strLiteral = stringTok.stringValue ?? stringTok.text.replace(/^["']|["']$/g, "");
        }
      }
      nodes.push(loopNode);

      // ← 終端までパースしない
      skipUntil = endPos;
      return nodes;
    }

    // --- MACRO / LOCALMACRO 構文解析 (Stage 2) ---
    if (
      line.length >= 2 &&
      (
        (
          line[0].kind === "ident" &&
          line[1].kind === "ident" &&
          line[1].text.toUpperCase() === "MACRO"
        ) || (
          line[0].kind === "ident" &&
          line[0].text.toUpperCase() === "LOCALMACRO" &&
          line[1].kind === "ident"
        )
      )
    ) {
      const isLocal = line[0].text.toUpperCase() === "LOCALMACRO";
      const macroName = isLocal ? line[1].text : line[0].text;
      const identPos = isLocal ? 0 : 1;
      const startPos = line[0].pos;

      // 🟩 LOCALMACROは isLocal = true の macroDef ノードとして登録（ENDMまで読む）
      // （※ defineMacro() は expandMacros() 側で呼び出す）

      const params: string[] = [];
      // 残りトークンをカンマ区切りでパラメタ抽出
      const rawParams = line.slice(2).map(t => t.text).join(" ");
      if (rawParams.trim().length > 0) {
        for (const p of rawParams.split(",").map(s => s.trim())) {
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(p)) {
            throw makeError(
              AssemblerErrorCode.MacroInvalidParamName,
              `Invalid macro parameter name: ${p}`,
              { pos: line[identPos].pos }
            );
          }
          params.push(p);
        }
      }

      const bodyTokens: Token[] = [];
      let foundEndm = false;
      let macroDepth = 0;

      // flushLine()の外側のtokens配列を使って
      // 残り行をスキャンする
      for (let i = tokens.indexOf(line[line.length - 1]) + 1; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.kind === "ident") {
          const text = t.text.toUpperCase();

          if (text === "MACRO" || text === "LOCALMACRO") {
            macroDepth++;
          }
          else if (text === "ENDM") {
            if (macroDepth === 0) {
              foundEndm = true;
              const endPos = t.pos;
              nodes.push({
                kind: "macroDef",
                name: macroName,
                params,
                bodyTokens,
                startPos,
                endPos,
                pos: startPos,
                isLocal,
              });
              skipUntil = endPos;
              line = [];
              return nodes;
            } else {
              macroDepth--;
            }
          }
        }

        bodyTokens.push(t);
      }

      // EOFまでENDMが見つからなかった場合
      if (!foundEndm) {
        throw makeError(
          AssemblerErrorCode.MacroEndmMissing,
          `Missing ENDM for macro '${macroName}'`,
          { pos: startPos }
        );
      }
    }

    if (line[0].kind !== "ident") {
      throw new Error(`Syntax error at line ${line[0].pos.line}`);
    }

    // --- マクロ呼び出しの検出（LOCALMACROも含む） ---
    if (line.length >= 1 && line[0].kind === "ident") {
      const name = line[0].text;
      const def = getDefByName(ctx, name);  // ← ★ ローカルも見える！
      if (def) {
        nodes.push({
          kind: "macroInvoke",
          name,
          args: [], // 引数対応は後続（P2-Kで）
          pos: line[0].pos,
        });
        return nodes;
      }
    }



    // SET 構文: ident := expr
    if (
      line.length >= 3 &&
      line[0].kind === "ident" &&
      line[1].kind === "op" &&
      line[1].text === ":="
    ) {
      const symbol = line[0].text;
      const valueTokens = line
        .slice(2)
        .filter((t) => t.kind !== "comma")
        .map((t) => t.text);

      nodes.push({
        kind: "pseudo",
        op: "SET",
        args: [{ key: symbol, value: valueTokens.join(", ") }],
        pos: line[0].pos,
      });
      return nodes;
    }

    // EQU 構文: ident EQU expr
    if (
      line.length >= 3 &&
      line[1].kind === "ident" &&
      line[1].text.toUpperCase() === "EQU"
    ) {
      const symbol = line[0].text;
      const valueTokens = line
        .slice(2)
        .filter((t) => t.kind !== "comma")
        .map((t) => t.text);

      nodes.push({
        kind: "pseudo",
        op: "EQU",
        args: [{ key: symbol, value: valueTokens.join(", ") }],
        pos: line[0].pos,
      });
      return nodes;
    }

    // 通常の命令 or 疑似命令
    const op = line[0].text.toUpperCase();

    // INCLUDE 構文: INCLUDE "path"
    if (
      line.length >= 2 &&
      line[0].kind === "ident" &&
      op === "INCLUDE"
    ) {
      const argTok = line[1];
      if (argTok.kind !== "string") {
        throw makeError(
          AssemblerErrorCode.SyntaxError,
          `INCLUDE expects a string literal at line ${argTok.pos.line}`
        );
      }
      const path = argTok.stringValue ?? argTok.text.replace(/^["']|["']$/g, "");

      // INCLUDE nodeを登録（展開は analyze フェーズで行う）
      const includeNode: Node = {
        kind: "pseudo",
        op: "INCLUDE",
        args: [{ value: path }],
        pos: line[0].pos,
      };
      nodes.push(includeNode);
      return nodes;
    }

    // カンマで区切られた引数リストを作る
    const args: string[] = [];
    let current: string[] = [];
    for (const t of line.slice(1)) {
      if (t.kind === "comma") {
        if (current.length > 0) {
          args.push(current.join("")); // 連結して1つの式に
          current = [];
        }
      } else {
        current.push(t.text);
      }
    }
    if (current.length > 0) {
      args.push(current.join(""));
    }

    if (isPseudo(op)) {
      const pseudoArgs: PseudoArg[] = [];
      for (const a of args) {
        const eqIdx = a.indexOf("=");
        if (eqIdx >= 0) {
          const key = a.slice(0, eqIdx).trim();
          const value = a.slice(eqIdx + 1).trim();
          pseudoArgs.push({ key, value });
        } else {
          pseudoArgs.push({ value: a.trim() });
        }
      }
      nodes.push({
        kind: "pseudo",
        op,
        args: pseudoArgs,
        pos: line[0].pos,
      });

      // 🟩 疑似命令はここで処理完了なので return する！
      return nodes;
    } else if (isInstr(op)) {
      nodes.push({
        kind: "instr",
        op,
        args,
        pos: line[0].pos,
      });
      // 🟩 疑似命令はここで処理完了なので return する！
      return nodes;
    }


    // // --- マクロ呼び出し（定義は先行している前提 / 引数なし） ---
    // const definedMacro = nodes.find(
    //   (n) => n.kind === "macroDef" && (ctx.caseInsensitive
    //     ? (n as NodeMacroDef).name.toUpperCase() === op
    //     : (n as NodeMacroDef).name === line[0].text)
    // ) as NodeMacroDef | undefined;

    // if (definedMacro) {
    const macroArgs = line
      .slice(1)
      .map(t => t.text)
      .join(" ")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    nodes.push({
      kind: "macroInvoke",
      name: line[0].text,
      args: macroArgs,
      pos: line[0].pos,
    });
    return nodes;
    // }

    // throw new Error(`Unknown operation '${op}' at line ${line[0].pos.line}`);
  }

  for (const tok of tokens) {
    if (tok.kind === "eol") {
      flushLine(tok.pos);
      line = [];
    } else {
      line.push(tok);
    }
  }

  return nodes;
}

export function isInstr(op: string): boolean {
  const instrs = [
    "LD",
    "CALL",
    "JP",
    "JR",
    "DJNZ",
    "RET",
    "RETI",
    "RETN",
    "ADD",
    "ADC",
    "SUB",
    "SBC",
    "AND",
    "OR",
    "XOR",
    "CP",
    "INC",
    "DEC",
    "PUSH",
    "POP",
    "EX",
    "EXX",
    "NOP",
    "HALT",
    "RST",
    "DI",
    "EI",
    "OUT",
    "IN",
    // まだ足りないけど、P1-C フィクスチャで必要そうな命令はここに追加
  ];
  return instrs.includes(op.toUpperCase());
}

function isPseudo(op: string): boolean {
  return [
    "ORG",
    "END",
    "DB",
    "DEFB",
    "DEFM",
    "DC",
    "DZ",
    "DW",
    "DEFW",
    "DS",
    "DEFS",
    "EQU",
    "DEFL",
    "SET",
    ".WORD32",
    ".SYMLEN",
    "EXTERN",
    "EXTERNAL",
    "EXT",
    "GLOBAL",
    "LOCAL",
    "SECTION",
    "ASEG",
    "CSEG",
    "DSEG",
    "COMMON",
    "INCLUDE",
    "ALIGN",
    "IF",
    "IFDEF",
    "IFNDEF",
    "IFB",
    "IFNB",
    "ELSEIF",
    "ELSE",
    "ENDIF",
    "IFIDN",
    "IFDIF",
    "EXITM",
    "TITLE",
    "PAGE",
    "LIST",
  ].includes(op);
}
