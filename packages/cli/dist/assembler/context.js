"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canon = void 0;
exports.deepMerge = deepMerge;
exports.createAsmContext = createAsmContext;
exports.createContext = createContext;
exports.defineSymbol = defineSymbol;
exports.makeSourcePos = makeSourcePos;
exports.cloneSourcePos = cloneSourcePos;
exports.createSourcePos = createSourcePos;
exports.resolveLocalLabel = resolveLocalLabel;
exports.pushLoop = pushLoop;
exports.popLoop = popLoop;
exports.currentLoop = currentLoop;
exports.getLoop = getLoop;
exports.resolveCounterToken = resolveCounterToken;
exports.traceLoopStack = traceLoopStack;
exports.getLocalValue = getLocalValue;
exports.attachLoopContext = attachLoopContext;
// packages/cli/src/assembler/context.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
const logger_1 = require("../logger");
const encoder_1 = require("./encoder");
const errors_1 = require("./errors");
/* =====================================================================================
 * ユーティリティ
 * ===================================================================================== */
/** Map/Set/Array を deep に複製しつつ shallow object は上書きするマージ */
function deepMerge(target, src) {
    const out = { ...target };
    for (const [k, v] of Object.entries(src ?? {})) {
        if (v === undefined || v === null)
            continue;
        if (v instanceof Map) {
            // ✅ Mapコピー（valueも再帰コピー）
            out[k] = new Map(Array.from(v.entries(), ([key, val]) => [key, deepClone(val)]));
        }
        else if (v instanceof Set) {
            // ✅ Setコピー
            out[k] = new Set(v);
        }
        else if (Array.isArray(v)) {
            // ✅ Arrayコピー（中身を再帰）
            out[k] = v.map((i) => deepClone(i));
        }
        else if (typeof v === "object") {
            // ✅ Objectネスト対応
            out[k] = deepMerge(target[k] ?? {}, v);
        }
        else {
            out[k] = v;
        }
    }
    return out;
}
/** 内部で使う単純なdeep cloneユーティリティ */
function deepClone(value) {
    if (value instanceof Map)
        return new Map(Array.from(value.entries(), ([k, v]) => [k, deepClone(v)]));
    if (value instanceof Set)
        return new Set(value);
    if (Array.isArray(value))
        return value.map((v) => deepClone(v));
    if (value && typeof value === "object")
        return { ...value };
    return value;
}
/** 一意ID生成（Node/Edge どちらでも動く簡易版） */
function newCtxId() {
    const rnd = globalThis.crypto?.randomUUID?.() ??
        `CTX${Date.now().toString(36)}${Math.random().toString(16).slice(2, 6)}`;
    return rnd;
}
/* =====================================================================================
 * AsmContext ファクトリ（新定義）
 * ===================================================================================== */
/**
 * 🧩 createAsmContext()
 * ステートレスかつ並列安全なコンテキストを毎回新規生成する。
 * - Map/Set/Array は各インスタンス固有で初期化（共有禁止）
 * - opcodes は getZ80OpcodeTable() を都度生成
 * - logger は [CTX#id] でプレフィクス付与
 */
function createAsmContext(overrides = {}) {
    const id = overrides.id ?? newCtxId();
    const logLevel = overrides.options?.verbose ? "verbose" : "normal";
    const logger = (0, logger_1.createLogger)(logLevel, id);
    // デフォルト構成（共有のない fresh なインスタンス）
    const defaults = {
        id,
        loc: 0,
        moduleName: "NONAME",
        inputFile: "",
        endReached: false,
        entry: undefined,
        symbols: new Map(),
        unresolved: [],
        externs: new Set(),
        exportSymbols: new Set(),
        modeWord32: false,
        modeSymLen: 32,
        caseInsensitive: true,
        options: { caseSensitive: false, strictMacro: false, relVersion: 2, verbose: false },
        texts: [],
        relocs: [],
        output: { relVersion: 2 },
        sourceLines: [],
        sections: new Map(),
        currentSection: 0,
        currentPos: { file: "", line: 0, phase: "tokenize" },
        includeStack: [],
        includeCache: new Set(),
        sectionStack: [],
        includePaths: [],
        macroTable: new Map(),
        macroTableStack: [],
        expansionStack: [],
        localMacroStack: [],
        seenMacroSites: new Set(),
        didExpand: false,
        opcodes: (0, encoder_1.getZ80OpcodeTable)(),
        phase: "tokenize",
        verbose: false,
        logger: undefined, // 後段で prefix 付きに差し替え
        errors: [],
        warnings: [],
        sourceMap: new Map(),
        loopSeq: 0,
        loopStack: [],
        condStack: [],
        listingControl: {
            enabled: true,
        },
        currentGlobalLabel: undefined,
    };
    // deepMerge で overrides を取り込み（Map/Set/Array を複製して採用）
    const merged = deepMerge(defaults, overrides);
    if (merged.options?.symLen != null) {
        merged.modeSymLen = merged.options.symLen;
    }
    if (merged.options?.includePaths) {
        merged.includePaths = [...merged.options.includePaths];
    }
    // logger の最終確定（ctx.id でプレフィクス）
    merged.logger = overrides.logger ?? logger;
    merged.verbose = merged.options?.verbose ?? merged.verbose ?? false;
    if (merged.logger && typeof merged.logger.info === "function") {
        merged.logger.info("AsmContext initialized.");
    }
    return merged;
}
/* =====================================================================================
 * 既存互換（Deprecated）：createContext
 * ===================================================================================== */
/**
 * @deprecated P2-K 以降は `createAsmContext()` を使用してください。
 * 互換維持のため残置。内部で `createAsmContext()` を呼びます。
 */
function createContext(overrides = {}) {
    const ctx = createAsmContext(overrides);
    // 旧呼び出し箇所で気づけるよう、verbose 時のみ注意喚起
    if (ctx.verbose)
        ctx.logger?.warn("createContext() is deprecated. Use createAsmContext().");
    return ctx;
}
/* =====================================================================================
 * 既存ユーティリティ（互換維持）
 * ===================================================================================== */
/**
 * シンボル登録ユーティリティ
 * - 現在セクションを自動付与
 * - 再定義時は警告を発行
 */
function defineSymbol(ctx, name, value, type = "LABEL", pos) {
    const resolved = (0, exports.canon)(resolveLocalLabel(ctx, name), ctx);
    const sectionId = ctx.currentSection;
    const existing = ctx.symbols.get(resolved);
    const defPos = pos ?? ctx.currentPos;
    if (existing) {
        ctx.warnings.push((0, errors_1.makeWarning)(errors_1.AssemblerErrorCode.RedefSymbol, `Symbol redefined: ${resolved} (old=${existing.value.toString(16)}, new=${value.toString(16)})`, { pos: defPos }));
    }
    ctx.symbols.set(resolved, { value, sectionId, type, pos: defPos });
}
function makeSourcePos(frame, line, phase, column) {
    return {
        file: frame.file,
        line,
        column,
        parent: frame.parent
            ? makeSourcePos(frame.parent, frame.lineBase ?? 0, phase)
            : undefined,
        phase,
    };
}
function cloneSourcePos(pos) {
    return {
        file: pos?.file ?? "",
        line: pos?.line ?? 0,
        column: pos?.column ?? 0,
        parent: pos?.parent ? cloneSourcePos(pos.parent) : undefined,
        phase: (pos.phase ?? ""),
    };
}
function createSourcePos(file, line, column, phase, parent) {
    return { file, line, column, parent, phase };
}
/** 共通のキー正規化（caseSensitive が false のとき大文字化） */
const canon = (s, ctx) => ctx.options.caseSensitive ? s : s.toUpperCase();
exports.canon = canon;
/** Resolve dot-local labels against current global label. */
function resolveLocalLabel(ctx, name) {
    if (!name?.startsWith("."))
        return name;
    if (!ctx.currentGlobalLabel)
        return name;
    return `${ctx.currentGlobalLabel}${name}`;
}
/**
 * 新しい LoopFrame を push する
 */
function pushLoop(ctx, kind, meta, total) {
    const level = (ctx.loopStack?.length ?? 0) + 1;
    const frame = {
        id: ++ctx.loopSeq,
        kind,
        index: 0,
        maxIndex: (total ?? 1) - 1,
        total,
        parent: ctx.loopStack.at(-1),
        locals: new Map(),
        meta: { ...meta, level },
    };
    if (!ctx.loopStack)
        ctx.loopStack = [];
    ctx.loopStack.push(frame);
    return frame;
}
/**
 * LoopFrame を pop する
 */
function popLoop(ctx) {
    if (!ctx.loopStack?.length)
        return undefined;
    return ctx.loopStack.pop();
}
/**
 * 現在の最内層 LoopFrame を取得
 */
function currentLoop(ctx) {
    return ctx.loopStack?.at(-1);
}
/**
 * 外層レベル指定で LoopFrame を取得 (0=最内層)
 */
function getLoop(ctx, level) {
    if (!ctx.loopStack?.length)
        return undefined;
    return ctx.loopStack.at(-(level + 1));
}
/**
 * \# / \##n / \##MAX を整数リテラルに解決する
 */
function resolveCounterToken(str, ctx) {
    const m = str.match(/^\\#(MAX|[0-9]*)$/) ?? str.match(/^@#(MAX|[0-9]*)$/);
    if (!m)
        return str;
    const { loopStack } = ctx;
    if (!loopStack?.length) {
        throw (0, errors_1.makeError)(errors_1.AssemblerErrorCode.LoopCounterOutside, "Loop counter used outside any loop.");
    }
    const level = m[1] === "MAX" ? loopStack.length - 1 : Number(m[1] || 0);
    const frame = loopStack.at(-(level + 1));
    if (!frame) {
        throw (0, errors_1.makeError)(errors_1.AssemblerErrorCode.LoopCounterOutOfScope, `No outer loop level #${level} to reference.`);
    }
    return String(frame.index);
}
/**
 * 現在の loopStack を LST トレース用にフォーマットする
 */
function traceLoopStack(ctx) {
    if (!ctx.loopStack?.length)
        return "";
    return ctx.loopStack
        .map((f) => `[${f.kind.toUpperCase()} i=${f.index}/${f.total ?? "?"} lvl=${f.meta.level} id=${f.id}]`)
        .join(" > ");
}
/**
 * locals 変数を検索 (IRP/IRPC)
 */
function getLocalValue(ctx, name) {
    const frame = ctx.loopStack?.at(-1);
    return frame?.locals?.get(name);
}
// createAsmContext() に初期値を追加するため、末尾で再定義補助
function attachLoopContext(ctx) {
    if (!ctx.loopStack)
        ctx.loopStack = [];
    if (typeof ctx.loopSeq !== "number")
        ctx.loopSeq = 0;
}
