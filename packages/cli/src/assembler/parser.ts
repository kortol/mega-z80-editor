import { AssemblerErrorCode, makeError } from "./errors";
import { Token } from "./tokenizer";

export type Node = NodeInstr | NodePseudo | NodeLabel;

export interface NodeInstr {
  kind: "instr";
  op: string;
  args: string[];
  line: number;
}

export interface NodePseudo {
  kind: "pseudo";
  op: string;
  args: string[];
  line: number;
}

export interface NodeLabel {
  kind: "label";
  name: string;
  line: number;
}

export function parse(tokens: Token[]): Node[] {
  const nodes: Node[] = [];
  let line: Token[] = [];

  function flushLine() {
    if (line.length === 0) return;

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
          `EQU cannot be used with label syntax at line ${line[0].line}`
        );
      }

      nodes.push({ kind: "label", name: label, line: line[0].line });
      line = afterColon;
      if (line.length === 0) return;
    }

    if (line[0].kind !== "ident") {
      throw new Error(`Syntax error at line ${line[0].line}`);
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
        args: [symbol, ...valueTokens],
        line: line[0].line,
      });
      return;
    }

    // 通常の命令 or 疑似命令
    const op = line[0].text.toUpperCase();

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
      nodes.push({ kind: "pseudo", op, args, line: line[0].line });
    } else if (isInstr(op)) {
      nodes.push({ kind: "instr", op, args, line: line[0].line });
    } else {
      throw new Error(`Unknown operation '${op}' at line ${line[0].line}`);
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
    "LD", "CALL", "JP", "JR", "DJNZ", "RET", "RETI", "RETN",
    "ADD", "ADC", "SUB", "SBC",
    "AND", "OR", "XOR", "CP",
    "INC", "DEC",
    "PUSH", "POP",
    "EX", "EXX",
    "NOP", "HALT", "RST", "DI", "EI",
    "OUT", "IN",
    // まだ足りないけど、P1-C フィクスチャで必要そうな命令はここに追加
  ];
  return instrs.includes(op.toUpperCase());
}

function isPseudo(op: string): boolean {
  return ["ORG", "END", "DB", "DEFB", "DW", "DEFW", "EQU", ".WORD32", ".SYMLEN", "END", "EXTERN"].includes(op);
}
