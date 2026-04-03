"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloneTokens = cloneTokens;
exports.tokenize = tokenize;
exports.parseNumber = parseNumber;
// src/assembler/tokenizer.ts
const context_1 = require("./context");
// TODO: replace with actual tokenizer.cloneTokens
function cloneTokens(tokens) {
    return tokens.map((t) => ({ ...t }));
}
function tokenize(ctx, src) {
    if (src == null)
        return [];
    // --- CP/M EOF (0x1A) で打ち切り ---
    const eofIdx = src.indexOf("\x1A");
    if (eofIdx >= 0) {
        src = src.slice(0, eofIdx);
    }
    const tokens = [];
    const lines = src.split(/\r?\n/);
    const isTrailingNewline = src.endsWith("\n") || src.endsWith("\r") || src.endsWith("\r\n");
    for (let lineNo = 0; lineNo < lines.length; lineNo++) {
        ctx.currentPos.line = lineNo;
        let line = lines[lineNo];
        // --- 最終行が空文字なら無視（末尾改行による空行のみ） ---
        if (lineNo === lines.length - 1 && line === "" && isTrailingNewline) {
            break;
        }
        // --- コメント削除 ---
        const commentIdx = line.indexOf(";");
        if (commentIdx >= 0)
            line = line.substring(0, commentIdx);
        ctx.currentPos.column = 0;
        while (ctx.currentPos.column < line.length) {
            const rest = line.slice(ctx.currentPos.column);
            // 空白スキップ
            if (/^\s+/.test(rest)) {
                ctx.currentPos.column += rest.match(/^\s+/)[0].length;
                continue;
            }
            // --- 2文字演算子 ---
            const op2 = ["<=", ">=", "==", "!=", "<<", ">>", ":="];
            const op2Match = op2.find((op) => rest.startsWith(op));
            if (op2Match) {
                tokens.push({ kind: "op", text: op2Match, pos: (0, context_1.cloneSourcePos)(ctx.currentPos) });
                ctx.currentPos.column += op2Match.length;
                continue;
            }
            // --- 記号/1文字演算子 ---
            if (/^[,:()+\-*/=<>!~&|^]/.test(rest[0])) {
                const ch = rest[0];
                let kind;
                switch (ch) {
                    case ",":
                        kind = "comma";
                        break;
                    case ":":
                        kind = "colon";
                        break;
                    case "(":
                        kind = "lparen";
                        break;
                    case ")":
                        kind = "rparen";
                        break;
                    case "+":
                    case "-":
                    case "*":
                    case "/":
                    case "=":
                    case "<":
                    case ">":
                    case "!":
                    case "~":
                    case "&":
                    case "|":
                    case "^":
                        kind = "op";
                        break;
                    default:
                        throw new Error(`Unhandled symbol ${ch}`);
                }
                tokens.push({ kind, text: ch, pos: (0, context_1.cloneSourcePos)(ctx.currentPos) });
                ctx.currentPos.column += 1;
                continue;
            }
            // --- 文字リテラル ---
            if (rest[0] === "'") {
                if (/^'.'/.test(rest) && rest.length >= 3 && rest[2] === "'") {
                    const text = rest.slice(0, 3); // 'A'
                    const value = parseNumber(text);
                    tokens.push({ kind: "num", text, value, pos: (0, context_1.cloneSourcePos)(ctx.currentPos) });
                    ctx.currentPos.column += 3;
                    continue;
                }
                else if (/^'\\./.test(rest) && rest.length >= 4 && rest[3] === "'") {
                    const text = rest.slice(0, 4); // '\n' とか '\''
                    const value = parseNumber(text);
                    tokens.push({ kind: "num", text, value, pos: (0, context_1.cloneSourcePos)(ctx.currentPos) });
                    ctx.currentPos.column += 4;
                    continue;
                }
                else {
                    throw new Error(`Tokenizer error at line ${lineNo + 1}, col ${ctx.currentPos.column}: '${rest[0]}'`);
                }
            }
            // --- 文字列リテラル (INCLUDE "file.inc" 等) ---
            if (rest[0] === '"' || rest[0] === "'") {
                const quote = rest[0];
                // 正規表現: 同じクォートで閉じるまでを取得（改行を跨がない）
                const strMatch = rest.match(new RegExp(`^${quote}([^${quote}]*)${quote}`));
                if (!strMatch) {
                    throw new Error(`Tokenizer error at line ${lineNo + 1}, col ${ctx.currentPos.column}: unterminated string literal`);
                }
                const text = strMatch[0];
                const stringValue = strMatch[1]; // 中身だけ取り出す
                tokens.push({
                    kind: "string",
                    text,
                    stringValue,
                    pos: (0, context_1.cloneSourcePos)(ctx.currentPos),
                });
                ctx.currentPos.column += text.length;
                continue;
            }
            // %の場合、%(0|1)+は数値でそれ以外はoperator
            // if (rest[0] === "%") {
            //   const m = /^(%[01]+)/.exec(rest);
            //   if (m) {
            //     const text = m[1];
            //     const value = parseNumber(text); // parseNumber が throw する場合は即エラー
            //     tokens.push({ kind: "num", text, value, pos: cloneSourcePos(ctx.currentPos) });
            //     ctx.currentPos.column += text.length;
            //     continue;
            //   } else {
            //     tokens.push({ kind: "op", text: "%", pos: cloneSourcePos(ctx.currentPos) });
            //     ctx.currentPos.column += 1;
            //     continue;
            //   }
            // }
            // --- % の特別処理 ---
            if (rest[0] === "%") {
                // 連続する %（%%...）はローカルラベル識別子として扱う
                const percents = rest.match(/^%+/)?.[0] ?? "";
                const after = rest.slice(percents.length);
                // case1: %%で始まるローカルラベル
                if (percents.length >= 2 && /^[A-Za-z_]/.test(after)) {
                    const labelMatch = rest.match(/^%+[A-Za-z0-9_]+/);
                    if (labelMatch) {
                        const text = labelMatch[0];
                        tokens.push({ kind: "ident", text, pos: (0, context_1.cloneSourcePos)(ctx.currentPos) });
                        ctx.currentPos.column += text.length;
                        continue;
                    }
                }
                // case2: %0101（二進数）
                const binMatch = /^(%[01]+)/.exec(rest);
                if (binMatch) {
                    const text = binMatch[1];
                    const value = parseNumber(text);
                    tokens.push({ kind: "num", text, value, pos: (0, context_1.cloneSourcePos)(ctx.currentPos) });
                    ctx.currentPos.column += text.length;
                    continue;
                }
                // その他は演算子として扱う
                tokens.push({ kind: "op", text: "%", pos: (0, context_1.cloneSourcePos)(ctx.currentPos) });
                ctx.currentPos.column += 1;
                continue;
            }
            // --- バックスラッシュ始まり (\# / \##n / \VAR) ---
            if (rest[0] === "\\") {
                const match = /^\\[A-Za-z0-9_#]+/.exec(rest);
                if (match) {
                    const text = match[0];
                    tokens.push({
                        kind: "ident",
                        text,
                        pos: (0, context_1.cloneSourcePos)(ctx.currentPos),
                    });
                    ctx.currentPos.column += text.length;
                    continue;
                }
                else {
                    // 孤立した '\' は構文エラー
                    throw new Error(`Tokenizer error at line ${lineNo + 1}, col ${ctx.currentPos.column}: '${rest[0]}'`);
                }
            }
            // --- @# (sjasm REPEAT カウンタ) ---
            if (rest.startsWith("@#")) {
                const name = ctx.caseInsensitive ? "COUNTER" : "counter";
                tokens.push({ kind: "ident", text: name, pos: (0, context_1.cloneSourcePos)(ctx.currentPos) });
                ctx.currentPos.column += 2;
                continue;
            }
            // --- 数値または識別子（$,%含む） ---
            const m = /^([A-Za-z0-9_\$][A-Za-z0-9_.$@]*|\.[A-Za-z_@][A-Za-z0-9_.$@]*|@[A-Za-z_][A-Za-z0-9_.$@]*)/.exec(rest);
            if (m) {
                const text = m[1];
                if (text === "$") {
                    // 現在アドレス → 特殊記号なので ident 扱い
                    tokens.push({ kind: "ident", text, pos: (0, context_1.cloneSourcePos)(ctx.currentPos) });
                }
                else if (/^(0X|[0-9]|[$])/.test(text)) {
                    // 数値リテラルの可能性がある場合は厳格チェック
                    const value = parseNumber(text); // parseNumber が throw する場合は即エラー
                    tokens.push({ kind: "num", text, value, pos: (0, context_1.cloneSourcePos)(ctx.currentPos) });
                }
                else {
                    tokens.push({ kind: "ident", text, pos: (0, context_1.cloneSourcePos)(ctx.currentPos) });
                }
                ctx.currentPos.column += text.length;
                continue;
            }
            throw new Error(`Tokenizer error at line ${lineNo + 1}, col ${ctx.currentPos.column}: '${rest[0]}'`);
        }
        ctx.currentPos.column = line.length;
        tokens.push({
            kind: "eol",
            text: "\n",
            pos: (0, context_1.cloneSourcePos)(ctx.currentPos)
        });
    }
    // 🔽 最終行が改行で終わらなかった場合も eol を保証
    ctx.currentPos.line = lines.length;
    ctx.currentPos.column = lines[lines.length - 1].length;
    if (tokens.length === 0 || tokens[tokens.length - 1].kind !== "eol") {
        tokens.push({
            kind: "eol",
            text: "\n",
            pos: (0, context_1.cloneSourcePos)(ctx.currentPos)
        });
    }
    return tokens;
}
// --- 数値変換処理（厳格版） ---
function parseNumber(text) {
    const s = text.toUpperCase();
    // 文字リテラル
    if (/^'.'$/.test(text)) {
        return text.charCodeAt(1);
    }
    if (/^'\\n'$/.test(text)) {
        return 10;
    }
    if (/^'\\''$/.test(text)) {
        return 0x27; // シングルクォート
    }
    // 16進
    if (/^0X[0-9A-F]+$/.test(s)) {
        return parseInt(s.slice(2), 16);
    }
    if (/^\$[0-9A-F]+$/.test(s)) {
        return parseInt(s.slice(1), 16);
    }
    if (/^[0-9A-F]+H$/.test(s)) {
        return parseInt(s.slice(0, -1), 16);
    }
    // 2進
    if (/^%[01]+$/.test(s)) {
        return parseInt(s.slice(1), 2);
    }
    if (/^[01]+B$/.test(s)) {
        return parseInt(s.slice(0, -1), 2);
    }
    // 10進
    if (/^[0-9]+$/.test(s)) {
        return parseInt(s, 10);
    }
    throw new Error(`Invalid number literal: ${text}`);
}
