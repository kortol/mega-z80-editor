import { Token } from "../tokenizer";
import { BinaryOp, Expr, UnaryOp } from "./types";

// --- 型ガード ---
function isUnaryOp(text: string): text is UnaryOp {
  return text === "+" || text === "-";
}

function isBinaryOp(text: string): text is BinaryOp {
  return (
    text === "+" || text === "-" || text === "*" || text === "/" || text === "%"
  );
}

export function parseExpr(tokens: Token[]): Expr {
  let pos = 0;

  function peek(): Token | null {
    return pos < tokens.length ? tokens[pos] : null;
  }
  function consume(): Token {
    if (pos >= tokens.length) throw new Error("Unexpected end of expression");
    return tokens[pos++];
  }
  function expect(kind: string, text?: string): Token {
    const tok = consume();
    if (tok.kind !== kind || (text && tok.text !== text)) {
      throw new Error(`Syntax error at line ${tok.line}, col ${tok.col}`);
    }
    return tok;
  }

  // --- Grammar implementation ---

  function parsePrimary(): Expr {
    const tok = peek();
    if (!tok) throw new Error("Unexpected end of expression");

    if (tok.kind === "num") {
      consume();
      return { kind: "Const", value: tok.value! };
    }
    if (tok.kind === "ident") {
      consume();
      return { kind: "Symbol", name: tok.text };
    }
    if (tok.kind === "lparen") {
      consume();
      const e = parseAdd();
      expect("rparen");
      return e;
    }
    throw new Error(`Syntax error at line ${tok.line}, col ${tok.col}`);
  }

  function parseUnary(): Expr {
    const tok = peek();
    if (tok && tok.kind === "op" && isUnaryOp(tok.text)) {
      const op: UnaryOp = tok.text;
      consume();
      const expr = parseUnary(); // 再帰で右側を取る
      return { kind: "Unary", op, expr };
    }
    return parsePrimary();
  }

  function parseMul(): Expr {
    let node = parseUnary();
    while (true) {
      const tok = peek();
      if (
        tok &&
        tok.kind === "op" &&
        (tok.text === "*" || tok.text === "/" || tok.text === "%")
      ) {
        const op: BinaryOp = tok.text;
        consume();
        const right = parseUnary();
        node = { kind: "Binary", op, left: node, right };
        continue;
      }
      break;
    }
    return node;
  }

  function parseAdd(): Expr {
    let node = parseMul();
    while (true) {
      const tok = peek();
      if (tok && tok.kind === "op" && (tok.text === "+" || tok.text === "-")) {
        const op: BinaryOp = tok.text;
        consume();
        const right = parseMul();
        node = { kind: "Binary", op, left: node, right };
        continue;
      }
      break;
    }
    return node;
  }

  const expr = parseAdd();
  if (pos < tokens.length) {
    throw new Error(`Unexpected token '${tokens[pos].text}'`);
  }
  return expr;
}
