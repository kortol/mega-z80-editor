"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseExpr = parseExpr;
// --- 型ガード ---
function isUnaryOp(text) {
    return text === "+" || text === "-" || text === "~" || text === "!";
}
function isBinaryOp(text) {
    return (text === "+" ||
        text === "-" ||
        text === "*" ||
        text === "/" ||
        text === "%" ||
        text === "<<" ||
        text === ">>" ||
        text === "<" ||
        text === "<=" ||
        text === ">" ||
        text === ">=" ||
        text === "==" ||
        text === "!=" ||
        text === "&" ||
        text === "^" ||
        text === "|");
}
function parseExpr(tokens) {
    let pos = 0;
    function peek() {
        return pos < tokens.length ? tokens[pos] : null;
    }
    function consume() {
        if (pos >= tokens.length)
            throw new Error("Unexpected end of expression");
        return tokens[pos++];
    }
    function expect(kind, text) {
        const tok = consume();
        if (tok.kind !== kind || (text && tok.text !== text)) {
            throw new Error(`Syntax error at line ${tok.pos.line}, col ${tok.pos.column}`);
        }
        return tok;
    }
    // --- Grammar implementation ---
    function parsePrimary() {
        const tok = peek();
        if (!tok)
            throw new Error("Unexpected end of expression");
        if (tok.kind === "num") {
            consume();
            return { kind: "Const", value: tok.value };
        }
        if (tok.kind === "ident") {
            consume();
            return { kind: "Symbol", name: tok.text };
        }
        if (tok.kind === "lparen") {
            consume();
            const e = parseOr();
            expect("rparen");
            return e;
        }
        throw new Error(`Syntax error at line ${tok.pos.line}, col ${tok.pos.column}`);
    }
    function parseUnary() {
        const tok = peek();
        if (tok && tok.kind === "op" && isUnaryOp(tok.text)) {
            const op = tok.text;
            consume();
            const expr = parseUnary(); // 再帰で右側を取る
            return { kind: "Unary", op, expr };
        }
        return parsePrimary();
    }
    function parseMul() {
        let node = parseUnary();
        while (true) {
            const tok = peek();
            if (tok &&
                tok.kind === "op" &&
                (tok.text === "*" || tok.text === "/" || tok.text === "%")) {
                const op = tok.text;
                consume();
                const right = parseUnary();
                node = { kind: "Binary", op, left: node, right };
                continue;
            }
            break;
        }
        return node;
    }
    function parseAdd() {
        let node = parseMul();
        while (true) {
            const tok = peek();
            if (tok && tok.kind === "op" && (tok.text === "+" || tok.text === "-")) {
                const op = tok.text;
                consume();
                const right = parseMul();
                node = { kind: "Binary", op, left: node, right };
                continue;
            }
            break;
        }
        return node;
    }
    function parseShift() {
        let node = parseAdd();
        while (true) {
            const tok = peek();
            if (tok && tok.kind === "op" && (tok.text === "<<" || tok.text === ">>")) {
                const op = tok.text;
                consume();
                const right = parseAdd();
                node = { kind: "Binary", op, left: node, right };
                continue;
            }
            break;
        }
        return node;
    }
    function parseRel() {
        let node = parseShift();
        while (true) {
            const tok = peek();
            if (tok &&
                tok.kind === "op" &&
                (tok.text === "<" || tok.text === "<=" || tok.text === ">" || tok.text === ">=")) {
                const op = tok.text;
                consume();
                const right = parseShift();
                node = { kind: "Binary", op, left: node, right };
                continue;
            }
            break;
        }
        return node;
    }
    function parseEq() {
        let node = parseRel();
        while (true) {
            const tok = peek();
            if (tok && tok.kind === "op" && (tok.text === "==" || tok.text === "!=")) {
                const op = tok.text;
                consume();
                const right = parseRel();
                node = { kind: "Binary", op, left: node, right };
                continue;
            }
            break;
        }
        return node;
    }
    function parseBitAnd() {
        let node = parseEq();
        while (true) {
            const tok = peek();
            if (tok && tok.kind === "op" && tok.text === "&") {
                const op = tok.text;
                consume();
                const right = parseEq();
                node = { kind: "Binary", op, left: node, right };
                continue;
            }
            break;
        }
        return node;
    }
    function parseBitXor() {
        let node = parseBitAnd();
        while (true) {
            const tok = peek();
            if (tok && tok.kind === "op" && tok.text === "^") {
                const op = tok.text;
                consume();
                const right = parseBitAnd();
                node = { kind: "Binary", op, left: node, right };
                continue;
            }
            break;
        }
        return node;
    }
    function parseOr() {
        let node = parseBitXor();
        while (true) {
            const tok = peek();
            if (tok && tok.kind === "op" && tok.text === "|") {
                const op = tok.text;
                consume();
                const right = parseBitXor();
                node = { kind: "Binary", op, left: node, right };
                continue;
            }
            break;
        }
        return node;
    }
    const expr = parseOr();
    if (pos < tokens.length) {
        throw new Error(`Unexpected token '${tokens[pos].text}'`);
    }
    return expr;
}
