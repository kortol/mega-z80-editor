import { AsmContext, SourcePos, canon } from "../../assembler-old/context";
import { Node, NodeInstr, NodeLabel, NodeMacroDef, NodeMacroInvoke, NodePseudo, NodeEmpty } from "../../assembler-old/node";
import { tokenize } from "../../assembler-old/tokenizer";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pegParser = require("./gen/z80_assembler.js");

type PegLoc = {
  start?: { line: number; column: number; offset: number };
  end?: { line: number; column: number; offset: number };
};

function locToPos(ctx: AsmContext, loc?: PegLoc, end = false): SourcePos {
  const p = end ? loc?.end : loc?.start;
  const line = Math.max(0, (p?.line ?? 1) - 1);
  const column = Math.max(0, (p?.column ?? 1) - 1);
  return {
    file: ctx.currentPos.file,
    line,
    column,
    phase: ctx.phase,
  };
}

function exprToRaw(expr: any): string {
  if (!expr) return "";
  if (typeof expr === "string") return expr;
  if (typeof expr === "number") return String(expr);
  if (expr.raw) return String(expr.raw);
  if (expr.type === "number") return String(expr.value);
  if (expr.type === "identifier") return String(expr.name);
  if (expr.type === "currentAddress") return "$";
  if (expr.type === "register") return String(expr.name);
  if (expr.type === "binaryOp") {
    return `${exprToRaw(expr.left)}${expr.op}${exprToRaw(expr.right)}`;
  }
  if (expr.type === "unaryOp") {
    return `${expr.op}${exprToRaw(expr.expr)}`;
  }
  if (expr.type === "string") return expr.raw ?? `"${expr.value ?? ""}"`;
  if (expr.type === "indirect") return `(${exprToRaw(expr.operand)})`;
  if (expr.type === "indexedIndirect") return expr.raw ?? `(${expr.base}${expr.offset ? `${expr.offset.sign}${exprToRaw(expr.offset.value)}` : ""})`;
  return String(expr.value ?? "");
}

function operandToRaw(op: any): string {
  if (!op) return "";
  if (op.raw) return String(op.raw);
  return exprToRaw(op);
}

function toPseudoArgsFromValues(values: any[]): { value: string }[] {
  return values.map((v) => ({ value: String(exprToRaw(v)) }));
}

function makePseudo(op: string, args: { key?: string; value: string }[], pos: SourcePos): NodePseudo {
  return { kind: "pseudo", op, args, pos };
}

function makeInstr(op: string, args: string[], pos: SourcePos): NodeInstr {
  return { kind: "instr", op, args, pos };
}

function makeLabel(name: string, pos: SourcePos): NodeLabel {
  return { kind: "label", name, pos };
}

function makeEmpty(pos: SourcePos): NodeEmpty {
  return { kind: "empty", pos };
}

function tokenizeMacroBody(ctx: AsmContext, body: string, pos: SourcePos): any[] {
  const saved = { ...ctx.currentPos };
  ctx.currentPos.file = pos.file;
  ctx.currentPos.line = pos.line;
  ctx.currentPos.column = pos.column ?? 0;
  const tokens = tokenize(ctx, body);
  ctx.currentPos = saved;
  return tokens;
}

export function parsePeg(ctx: AsmContext, source: string): Node[] {
  let ast: any;
  try {
    ast = pegParser.parse(source);
  } catch (err: any) {
    if (err?.name === "SyntaxError" || /Expected/.test(String(err?.message ?? ""))) {
      throw new Error("Syntax error");
    }
    throw err;
  }
  const nodes: Node[] = [];

  const pseudoOps = new Set([
    "ORG", "DB", "DW", "EQU", "END", "INCLUDE", "MACRO", "ENDM", "REPT", "ENDR",
    "DEFB", "DEFW", "DEFS", "ALIGN", "PUBLIC", "EXTERN", "LOCAL", "SECTION", "SEGMENT", "GLOBAL",
    "SET", "IF", "ELSE", "ELSEIF", "ENDIF", "IFIDN", "DZ", "DS", ".SYMLEN", ".WORD32"
  ]);

  const macroNames = new Set<string>();
  const useMacroOverride = !ctx.options?.strictMacro;

  function registerMacro(name: string) {
    macroNames.add(canon(name, ctx));
  }

  function hasMacro(name: string) {
    return macroNames.has(canon(name, ctx));
  }

  for (const item of ast ?? []) {
    if (!item) continue;

    if (item.type === "macroDef") {
      const pos = locToPos(ctx, item.pos);
      const endPos = locToPos(ctx, item.pos, true);
      const bodyTokens = tokenizeMacroBody(ctx, item.body ?? "", pos);
      const def: NodeMacroDef = {
        kind: "macroDef",
        name: item.name,
        params: item.params ?? [],
        bodyTokens,
        startPos: pos,
        endPos,
        pos,
        isLocal: false,
      };
      nodes.push(def);
      registerMacro(item.name);
      continue;
    }

    if (item.type === "macroLoop") {
      const pos = locToPos(ctx, item.pos);
      const bodyTokens = tokenizeMacroBody(ctx, item.body ?? "", pos);
      const countExpr = item.count
        ? { kind: "Expr", text: exprToRaw(item.count), value: item.count?.value, pos }
        : undefined;

      if (item.op === "IRP") {
        const rawArgs = item.args ?? [];
        const argTokens: string[] = [];
        for (let i = 0; i < rawArgs.length; i++) {
          if (i > 0) argTokens.push(",");
          argTokens.push(rawArgs[i]);
        }
        nodes.push({
          kind: "macroLoop",
          op: "IRP",
          args: [item.symbol, ...argTokens],
          pos,
          bodyTokens,
        } as any);
        continue;
      }
      if (item.op === "IRPC") {
        nodes.push({
          kind: "macroLoop",
          op: "IRPC",
          pos,
          bodyTokens,
          strLiteral: item.str?.value ?? item.strLiteral ?? "",
          symbolName: item.symbol,
        } as any);
        continue;
      }

      if (item.op === "WHILE") {
        const condExpr = item.cond
          ? { kind: "Expr", text: exprToRaw(item.cond), pos }
          : undefined;
        nodes.push({
          kind: "macroLoop",
          op: "WHILE",
          pos,
          condExpr,
          bodyTokens,
        } as any);
        continue;
      }

      nodes.push({
        kind: "macroLoop",
        op: "REPT",
        pos,
        countExpr,
        bodyTokens,
      } as any);
      continue;
    }

    if (item.type === "empty") {
      const pos = locToPos(ctx, item.pos);
      nodes.push(makeEmpty(pos));
      continue;
    }

    if (item.type === "line") {
      const linePos = locToPos(ctx, item.pos);

      const labelName = item.label?.name;
      const labelColon = Boolean(item.label?.colon);
      const instr = item.instruction;
      if (!instr) {
        if (labelName) nodes.push(makeLabel(labelName, linePos));
        if (!labelName) nodes.push(makeEmpty(linePos));
        continue;
      }

      // FOO EQU 10 / FOO SET 20 などのラベル横並びシンタックスを対応
      if (labelName && instr.type === "macroInvoke") {
        const op = String(instr.name).toUpperCase();
        const args = instr.args ?? [];
        if (labelColon && op === "EQU") {
          throw new Error("EQU cannot be used with label");
        }
        if (op === "EQU" || op === "SET") {
          const value = args[0] ?? "";
          nodes.push(makePseudo(op, [{ key: labelName, value: String(value) }], linePos));
          continue;
        }
      }

      if (labelName) {
        nodes.push(makeLabel(labelName, linePos));
      }

      if (instr.type === "directive") {
        const op = String(instr.name).toUpperCase();
        const pos = locToPos(ctx, instr.pos ?? item.pos);

        switch (op) {
          case "ORG":
            nodes.push(makePseudo("ORG", [{ value: exprToRaw(instr.value) }], pos));
            break;
          case "DB":
          case "DEFB":
            nodes.push(makePseudo(op, toPseudoArgsFromValues(instr.values ?? []), pos));
            break;
          case "DZ":
            nodes.push(makePseudo("DZ", toPseudoArgsFromValues(instr.values ?? []), pos));
            break;
          case "DW":
          case "DEFW":
            nodes.push(makePseudo(op, toPseudoArgsFromValues(instr.values ?? []), pos));
            break;
          case "DS":
          case "DEFS":
            nodes.push(makePseudo(op, [{ value: exprToRaw(instr.size) }], pos));
            break;
          case "EQU":
            nodes.push(makePseudo("EQU", [{ key: String(instr.symbol), value: exprToRaw(instr.value) }], pos));
            break;
          case "SET":
            nodes.push(makePseudo("SET", [{ key: String(instr.symbol), value: exprToRaw(instr.value) }], pos));
            break;
          case "END":
            if (instr.value) {
              nodes.push(makePseudo("END", [{ value: exprToRaw(instr.value) }], pos));
            } else {
              nodes.push(makePseudo("END", [], pos));
            }
            break;
          case "IF":
            nodes.push(makePseudo("IF", [{ value: exprToRaw(instr.value) }], pos));
            break;
          case "ELSEIF":
            nodes.push(makePseudo("ELSEIF", [{ value: exprToRaw(instr.value) }], pos));
            break;
          case "ELSE":
            nodes.push(makePseudo("ELSE", [], pos));
            break;
          case "ENDIF":
            nodes.push(makePseudo("ENDIF", [], pos));
            break;
          case "IFIDN":
            nodes.push(makePseudo("IFIDN", [
              { value: exprToRaw(instr.left) },
              { value: exprToRaw(instr.right) },
            ], pos));
            break;
          case "EXTERN": {
            const args = (instr.symbols ?? []).map((s: string) => ({ value: s }));
            if (instr.from) {
              args.push({ value: "FROM" });
              args.push({ value: String(instr.from) });
            }
            nodes.push(makePseudo("EXTERN", args, pos));
            break;
          }
          case "SECTION": {
            const args: { key?: string; value: string }[] = [{ value: instr.section }];
            if (instr.align) {
              args.push({ key: "ALIGN", value: exprToRaw(instr.align) });
            }
            nodes.push(makePseudo("SECTION", args, pos));
            break;
          }
          case "INCLUDE": {
            const val = instr.path?.value ?? instr.path?.name ?? exprToRaw(instr.path);
            nodes.push(makePseudo("INCLUDE", [{ value: val }], pos));
            break;
          }
          case "ALIGN":
            nodes.push(makePseudo("ALIGN", [{ value: exprToRaw(instr.value) }], pos));
            break;
          case ".SYMLEN":
            nodes.push(makePseudo(".SYMLEN", instr.value ? [{ value: exprToRaw(instr.value) }] : [], pos));
            break;
          case ".ORG":
            nodes.push(makePseudo("ORG", toPseudoArgsFromValues(instr.values ?? (instr.args ?? [])), pos));
            break;
          default:
            nodes.push(makePseudo(op, [], pos));
            break;
        }
        continue;
      }

      if (instr.type === "macroInvoke") {
        const pos = locToPos(ctx, instr.pos ?? item.pos);
        nodes.push({ kind: "macroInvoke", name: instr.name, args: instr.args ?? [], pos } as NodeMacroInvoke);
        continue;
      }

      if (instr.type === "instruction" && pseudoOps.has(instr.mnemonic.toUpperCase())) {
        const pos = locToPos(ctx, instr.pos ?? item.pos);
        const op = instr.mnemonic.toUpperCase();
        // Simple pseudo ops without args
        if (["END", "ELSE", "ENDIF", "ENDM", "ENDR"].includes(op)) {
          nodes.push(makePseudo(op, [], pos));
        } else if (op === "EQU") {
          // EQU symbol value
          const args = instr.operands ?? [];
          if (args.length >= 2) {
            nodes.push(makePseudo("EQU", [{ key: String(args[0]), value: String(args[1]) }], pos));
          }
        } else if (op === "SET") {
          const args = instr.operands ?? [];
          if (args.length >= 2) {
            nodes.push(makePseudo("SET", [{ key: String(args[0]), value: String(args[1]) }], pos));
          }
        } else if (op === "IF") {
          const args = instr.operands ?? [];
          if (args.length >= 1) {
            nodes.push(makePseudo("IF", [{ value: String(args[0]) }], pos));
          }
        } else if (op === "ELSEIF") {
          const args = instr.operands ?? [];
          if (args.length >= 1) {
            nodes.push(makePseudo("ELSEIF", [{ value: String(args[0]) }], pos));
          }
        } else if (op === "IFIDN") {
          const args = instr.operands ?? [];
          if (args.length >= 2) {
            nodes.push(makePseudo("IFIDN", [{ value: String(args[0]) }, { value: String(args[1]) }], pos));
          }
        } else if (op === "ORG") {
          const args = instr.operands ?? [];
          if (args.length >= 1) {
            nodes.push(makePseudo("ORG", [{ value: String(args[0]) }], pos));
          }
        } else if (["DB", "DEFB", "DW", "DEFW", "DS", "DEFS", "DZ"].includes(op)) {
          const args = instr.operands ?? [];
          nodes.push(makePseudo(op, args.map((a: any) => ({ value: String(a) })), pos));
        } else if (op === "INCLUDE") {
          const args = instr.operands ?? [];
          if (args.length >= 1) {
            nodes.push(makePseudo("INCLUDE", [{ value: String(args[0]) }], pos));
          }
        } else if (op === "EXTERN") {
          const args = instr.operands ?? [];
          nodes.push(makePseudo("EXTERN", args.map((a: any) => ({ value: String(a) })), pos));
        } else if (op === "SECTION") {
          const args = instr.operands ?? [];
          if (args.length >= 1) {
            nodes.push(makePseudo("SECTION", [{ value: String(args[0]) }], pos));
          }
        } else if (op === "ALIGN") {
          const args = instr.operands ?? [];
          if (args.length >= 1) {
            nodes.push(makePseudo("ALIGN", [{ value: String(args[0]) }], pos));
          }
        } else if (op === ".SYMLEN") {
          const args = instr.operands ?? [];
          nodes.push(makePseudo(".SYMLEN", args.length > 0 ? [{ value: String(args[0]) }] : [], pos));
        } else if (op === ".WORD32") {
          nodes.push(makePseudo(".WORD32", [], pos));
        } else {
          // Unknown pseudo
          nodes.push(makePseudo(op, [], pos));
        }
        continue;
      }

      if (instr.type === "instruction") {
        const pos = locToPos(ctx, instr.pos ?? item.pos);
        const args: string[] = [];

        if (instr.condition) {
          args.push(String(instr.condition));
        }

        for (const op of instr.operands ?? []) {
          args.push(operandToRaw(op));
        }

        const opName = String(instr.mnemonic).toUpperCase();
        if (useMacroOverride && hasMacro(opName)) {
          nodes.push({ kind: "macroInvoke", name: opName, args, pos } as NodeMacroInvoke);
        } else {
          nodes.push(makeInstr(opName, args, pos));
        }
        continue;
      }
    }
  }

  return nodes;
}
