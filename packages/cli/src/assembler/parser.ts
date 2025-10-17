import { AsmContext, SourcePos } from "./context";
import { AssemblerErrorCode, makeError } from "./errors";
import { handleInclude } from "./pseudo/include";
import { Token } from "./tokenizer";

export type Node = NodeInstr | NodePseudo | NodeLabel;

export interface NodeInstr {
  kind: "instr";
  op: string;
  args: string[];
  pos: SourcePos;
}

export interface PseudoArg {
  key?: string;
  value: string;
}

export interface NodePseudo {
  kind: "pseudo";
  op: string;
  args: PseudoArg[];
  pos: SourcePos;
}

export interface NodeLabel {
  kind: "label";
  name: string;
  pos: SourcePos;
}

export function parse(ctx: AsmContext, tokens: Token[]): Node[] {

  const nodes: Node[] = [];
  let line: Token[] = [];

  function flushLine() {
    if (line.length === 0) return nodes;

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

    if (line[0].kind !== "ident") {
      throw new Error(`Syntax error at line ${line[0].pos.line}`);
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

      // INCLUDE nodeを登録
      const includeNode: Node = {
        kind: "pseudo",
        op: "INCLUDE",
        args: [{ value: path }],
        pos: line[0].pos,
      };
      nodes.push(includeNode);

      // --- 🔹 INCLUDE即時展開 ---
      const subNodes = handleInclude(includeNode, ctx);

      // 展開結果を現在のnodesに統合
      nodes.push(...subNodes);
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
    } else if (isInstr(op)) {
      nodes.push({
        kind: "instr",
        op,
        args,
        pos: line[0].pos,
      });
    } else {
      throw new Error(`Unknown operation '${op}' at line ${line[0].pos.line}`);
    }
  }

  for (const tok of tokens) {
    if (tok.kind === "eol") {
      flushLine();
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
    "DW",
    "DEFW",
    "DS",
    "DEFS",
    "EQU",
    ".WORD32",
    ".SYMLEN",
    "END",
    "EXTERN",
    "SECTION",
    "INCLUDE",
  ].includes(op);
}
