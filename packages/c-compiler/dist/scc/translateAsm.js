"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.translateSccAsm = translateSccAsm;
const AREA_TO_SECTION = {
    "_CODE": "TEXT",
    "_DATA": "DATA",
    "_BSS": "BSS",
    "_STACK": "BSS",
};
function splitComment(line) {
    const idx = line.indexOf(";");
    if (idx < 0)
        return { code: line, comment: "" };
    return { code: line.slice(0, idx), comment: line.slice(idx) };
}
function normalizeWhitespace(text) {
    return text.replace(/\r\n/g, "\n");
}
function collectNumericLocalLabels(lines) {
    const map = new Map();
    for (const line of lines) {
        const { code } = splitComment(line);
        const trimmed = code.trim();
        const match = trimmed.match(/^(\.\d+):/);
        if (!match)
            continue;
        const original = match[1];
        if (!map.has(original)) {
            map.set(original, `__scc_local_${original.slice(1)}`);
        }
    }
    return map;
}
function collectDottedSymbols(lines) {
    const map = new Map();
    for (const line of lines) {
        const { code } = splitComment(line);
        const trimmed = code.trim();
        const labelMatch = trimmed.match(/^(\.[A-Za-z_@$][A-Za-z0-9_@$]*):/);
        if (labelMatch && !map.has(labelMatch[1])) {
            map.set(labelMatch[1], `__scc_dot_${labelMatch[1].slice(1)}`);
        }
        const globlMatch = trimmed.match(/^\.globl\s+(.+)$/i);
        if (!globlMatch)
            continue;
        const symbols = globlMatch[1]
            .split(",")
            .map((part) => part.trim())
            .filter((part) => /^\.[A-Za-z_@$][A-Za-z0-9_@$]*$/.test(part));
        for (const sym of symbols) {
            if (!map.has(sym)) {
                map.set(sym, `__scc_dot_${sym.slice(1)}`);
            }
        }
    }
    return map;
}
function replaceNumericLocalRefs(text, map) {
    return text.replace(/(?<![A-Za-z0-9_])\.(\d+)(?![A-Za-z0-9_])/g, (full) => map.get(full) ?? full);
}
function replaceDottedSymbolRefs(text, map) {
    return text.replace(/(?<![A-Za-z0-9_])\.[A-Za-z_@$][A-Za-z0-9_@$]*/g, (full) => map.get(full) ?? full);
}
function normalizeImmediate(code) {
    return code.replace(/#(?=(?:0x[0-9A-Fa-f]+|\d+|'.*?'|".*?"|[.\w_+-]))/g, "");
}
function normalizeJump(code) {
    return code.replace(/^\s*j(\s+)/i, "        JP$1");
}
function normalizeDottedDataDirective(op, args) {
    const upper = op.toUpperCase();
    if (upper === ".ASCII")
        return `        DB ${args}`;
    if (upper === ".ASCIZ")
        return `        DZ ${args}`;
    if (upper === ".DB")
        return `        DB ${args}`;
    if (upper === ".DW")
        return `        DW ${args}`;
    if (upper === ".DS")
        return `        DS ${args}`;
    return `        ${upper.slice(1)} ${args}`;
}
function translateSccAsm(source, options = {}) {
    const lines = normalizeWhitespace(source).split("\n");
    const numericLocalLabels = collectNumericLocalLabels(lines);
    const dottedSymbols = collectDottedSymbols(lines);
    const defined = new Set();
    const exports = new Set();
    const externs = new Set();
    const body = [];
    const prologue = [];
    for (const originalLine of lines) {
        const { code, comment } = splitComment(originalLine);
        const normalizedCode = replaceDottedSymbolRefs(replaceNumericLocalRefs(code, numericLocalLabels), dottedSymbols);
        const trimmed = normalizedCode.trim();
        if (!trimmed) {
            body.push(comment ? comment : "");
            continue;
        }
        const labelMatch = trimmed.match(/^([.\w@]+):\s*$/);
        if (labelMatch) {
            defined.add(labelMatch[1].toUpperCase());
            body.push(`${labelMatch[1]}:${comment ? " " + comment : ""}`.trimEnd());
            continue;
        }
        const locationCounterMatch = trimmed.match(/^\.\s*=\s*(.+)$/);
        if (locationCounterMatch) {
            const expr = locationCounterMatch[1].trim().replace(/(^|[^A-Za-z0-9_@$])\.(?=([^A-Za-z0-9_@$]|$))/g, "$1$");
            body.push(`        ORG ${expr}${comment ? " " + comment : ""}`.trimEnd());
            continue;
        }
        const moduleMatch = trimmed.match(/^\.module\s+(.+)$/i);
        if (moduleMatch) {
            const moduleName = options.moduleName ?? moduleMatch[1].trim();
            prologue.push(`; translated from SCC module ${moduleName}`);
            continue;
        }
        const globlMatch = trimmed.match(/^\.globl\s+(.+)$/i);
        if (globlMatch) {
            const symbols = globlMatch[1]
                .split(",")
                .map((part) => part.trim())
                .filter((part) => part.length > 0);
            for (const sym of symbols) {
                exports.add(sym);
            }
            continue;
        }
        const areaMatch = trimmed.match(/^\.area\s+(.+)$/i);
        if (areaMatch) {
            const raw = areaMatch[1].trim().toUpperCase();
            const sec = AREA_TO_SECTION[raw] ?? raw.replace(/^_+/, "");
            body.push(`        SECTION ${sec}${comment ? " " + comment : ""}`.trimEnd());
            continue;
        }
        const dottedDataMatch = trimmed.match(/^(\.(?:ascii|asciz|db|dw|ds))\s+(.+)$/i);
        if (dottedDataMatch) {
            body.push(`${normalizeDottedDataDirective(dottedDataMatch[1], dottedDataMatch[2].trim())}${comment ? " " + comment : ""}`.trimEnd());
            continue;
        }
        const labelInstrMatch = trimmed.match(/^([.\w@]+):\s*(.*)$/);
        if (labelInstrMatch) {
            defined.add(labelInstrMatch[1].toUpperCase());
            const rest = labelInstrMatch[2].trim();
            const dottedDataMatch2 = rest.match(/^(\.(?:ascii|asciz|db|dw|ds))\s+(.+)$/i);
            if (dottedDataMatch2) {
                body.push(`${labelInstrMatch[1]}: ${normalizeDottedDataDirective(dottedDataMatch2[1], dottedDataMatch2[2].trim())}${comment ? " " + comment : ""}`.trimEnd());
                continue;
            }
            const rewritten = normalizeJump(normalizeImmediate(rest));
            body.push(`${labelInstrMatch[1]}: ${rewritten}${comment ? " " + comment : ""}`.trimEnd());
            continue;
        }
        const rewritten = normalizeJump(normalizeImmediate(normalizedCode));
        body.push(`${rewritten}${comment ? " " + comment : ""}`.trimEnd());
    }
    for (const sym of exports) {
        if (defined.has(sym.toUpperCase())) {
            prologue.push(`        PUBLIC ${sym}`);
        }
        else {
            externs.add(sym);
        }
    }
    for (const sym of Array.from(externs).sort((a, b) => a.localeCompare(b))) {
        prologue.push(`        EXTERN ${sym}`);
    }
    return [...prologue, ...body].join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
