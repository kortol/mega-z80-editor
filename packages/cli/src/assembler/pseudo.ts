import { AsmContext } from "./context";
import { NodePseudo } from "./parser";
import { parseNumber } from "./tokenizer";

export function handlePseudo(ctx: AsmContext, node: NodePseudo): void {
  switch (node.op.toUpperCase()) {
    case "ORG":
      ctx.loc = parseNumber(node.args[0]);
      break;

    case "END":
      ctx.endReached = true;
      break;

    case "DB": {
      const data = node.args.map(a => parseNumber(a) & 0xFF);
      ctx.texts.push({ addr: ctx.loc, data });
      ctx.loc += data.length;
      break;
    }

    case "DW": {
      for (const a of node.args) {
        const val = parseNumber(a);
        ctx.texts.push({
          addr: ctx.loc,
          data: [val & 0xFF, (val >> 8) & 0xFF],
        });
        ctx.loc += 2;
      }
      break;
    }

    case "EQU": {
      const [sym, valStr] = node.args;
      if (ctx.symbols.has(sym)) {
        throw new Error(`Symbol ${sym} redefined`);
      }
      const val = parseNumber(valStr);
      ctx.symbols.set(sym, val);
      break;
    }

    case ".WORD32":
      ctx.modeWord32 = true;
      break;

    case ".SYMLEN":
      ctx.modeSymLen = parseInt(node.args[0], 10);
      break;

    default:
      throw new Error(`Unknown pseudo op ${node.op} at line ${node.line}`);
  }
}
