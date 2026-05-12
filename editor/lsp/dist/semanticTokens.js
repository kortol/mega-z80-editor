"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSemanticTokenLegend = getSemanticTokenLegend;
exports.collectSemanticTokens = collectSemanticTokens;
const asmPipeline_1 = require("./asmPipeline");
const tokenTypes = ["variable", "function", "parameter"];
const tokenModifiers = ["declaration", "readonly"];
const tokenTypeIndex = new Map(tokenTypes.map((name, index) => [name, index]));
const tokenModifierBit = new Map(tokenModifiers.map((name, index) => [name, 1 << index]));
const registerNames = new Set([
    "A", "B", "C", "D", "E", "F", "H", "L",
    "AF", "BC", "DE", "HL", "IX", "IY", "SP", "PC", "I", "R",
    "IXH", "IXL", "IYH", "IYL",
]);
const conditionNames = new Set(["NZ", "Z", "NC", "C", "PO", "PE", "P", "M"]);
function normalize(name) {
    return name.toUpperCase();
}
function isReferenceCandidate(token) {
    if (token.kind !== "ident")
        return false;
    if (token.text === "$")
        return false;
    if (token.text.startsWith("\\"))
        return false;
    const upper = normalize(token.text);
    if (registerNames.has(upper) || conditionNames.has(upper))
        return false;
    return /^[.@]?[A-Za-z_@%][A-Za-z0-9_.$@%]*$/u.test(token.text);
}
function keyOf(token) {
    return `${token.pos.line}:${token.pos.column ?? 0}:${token.text.length}`;
}
function groupTokensByLine(tokens) {
    const byLine = new Map();
    for (const token of tokens) {
        if (token.kind === "eol")
            continue;
        const line = token.pos.line;
        const bucket = byLine.get(line);
        if (bucket)
            bucket.push(token);
        else
            byLine.set(line, [token]);
    }
    return byLine;
}
function buildMacroMaps(nodes) {
    const defs = new Set();
    const invokesByLine = new Map();
    for (const node of nodes) {
        if (node.kind === "macroDef") {
            defs.add(normalize(node.name));
            continue;
        }
        if (node.kind === "macroInvoke") {
            const line = node.pos.line;
            const bucket = invokesByLine.get(line) ?? new Set();
            bucket.add(normalize(node.name));
            invokesByLine.set(line, bucket);
        }
    }
    return { defs, invokesByLine };
}
function addToken(store, token, type, modifiers, priority) {
    const line = token.pos.line;
    const start = token.pos.column ?? 0;
    const length = token.text.length;
    if (length <= 0)
        return;
    const entry = { line, start, length, type, modifiers, priority };
    const key = keyOf(token);
    const current = store.get(key);
    if (!current || current.priority <= priority) {
        store.set(key, entry);
    }
}
function collectExplicitTokens(lineTokens, macroInvokesOnLine, store) {
    if (lineTokens.length === 0)
        return;
    let index = 0;
    if (lineTokens[0]?.kind === "ident" &&
        lineTokens[1]?.kind === "colon") {
        addToken(store, lineTokens[0], "variable", ["declaration"], 30);
        index = 2;
    }
    else if (lineTokens[0]?.kind === "ident" &&
        ((lineTokens[1]?.kind === "ident" && /^(EQU|DEFL)$/iu.test(lineTokens[1].text)) ||
            (lineTokens[1]?.kind === "op" && lineTokens[1].text === ":="))) {
        addToken(store, lineTokens[0], "variable", ["declaration"], 30);
        index = 1;
    }
    const head = lineTokens[index];
    const next = lineTokens[index + 1];
    if (!head || head.kind !== "ident")
        return;
    if (next?.kind === "ident" && normalize(next.text) === "MACRO") {
        addToken(store, head, "function", ["declaration"], 40);
        for (let i = index + 2; i < lineTokens.length; i++) {
            const token = lineTokens[i];
            if (token.kind === "ident") {
                addToken(store, token, "parameter", ["declaration"], 20);
            }
        }
        return;
    }
    const headUpper = normalize(head.text);
    if (/^(EXTERN|EXT|EXTERNAL)$/u.test(headUpper)) {
        for (let i = index + 1; i < lineTokens.length; i++) {
            const token = lineTokens[i];
            if (token.kind === "ident") {
                addToken(store, token, "variable", ["declaration", "readonly"], 35);
            }
        }
        return;
    }
    if (/^(PUBLIC|GLOBAL|LOCAL)$/u.test(headUpper)) {
        for (let i = index + 1; i < lineTokens.length; i++) {
            const token = lineTokens[i];
            if (token.kind === "ident") {
                addToken(store, token, "variable", ["declaration"], 25);
            }
        }
        return;
    }
    if (macroInvokesOnLine?.has(headUpper)) {
        addToken(store, head, "function", [], 25);
    }
}
function encodeTokens(store) {
    const ordered = [...store.values()].sort((a, b) => a.line - b.line || a.start - b.start || a.length - b.length);
    const data = [];
    let prevLine = 0;
    let prevStart = 0;
    for (const token of ordered) {
        const deltaLine = token.line - prevLine;
        const deltaStart = deltaLine === 0 ? token.start - prevStart : token.start;
        const tokenType = tokenTypeIndex.get(token.type) ?? 0;
        const modifiers = token.modifiers.reduce((bits, modifier) => bits | (tokenModifierBit.get(modifier) ?? 0), 0);
        data.push(deltaLine, deltaStart, token.length, tokenType, modifiers);
        prevLine = token.line;
        prevStart = token.start;
    }
    return { data };
}
function getSemanticTokenLegend() {
    return {
        tokenTypes,
        tokenModifiers,
    };
}
function collectSemanticTokens(document, _params) {
    const pipeline = (0, asmPipeline_1.createPipeline)(document);
    const { ctx, parsedNodes, tokens } = pipeline;
    (0, asmPipeline_1.runAnalysis)(pipeline);
    const byLine = groupTokensByLine(tokens);
    const { defs: macroDefs, invokesByLine } = buildMacroMaps(parsedNodes);
    const store = new Map();
    for (const lineTokens of byLine.values()) {
        const line = lineTokens[0]?.pos.line ?? 0;
        collectExplicitTokens(lineTokens, invokesByLine.get(line), store);
    }
    for (const token of tokens) {
        if (!isReferenceCandidate(token))
            continue;
        const key = keyOf(token);
        if (store.has(key))
            continue;
        const upper = normalize(token.text);
        if (macroDefs.has(upper)) {
            addToken(store, token, "function", [], 10);
            continue;
        }
        if (ctx.externs.has(upper)) {
            addToken(store, token, "variable", ["readonly"], 10);
            continue;
        }
        if (ctx.symbols.has(upper)) {
            addToken(store, token, "variable", [], 5);
        }
    }
    return encodeTokens(store);
}
