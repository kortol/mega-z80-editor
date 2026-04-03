"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeEvalCtx = makeEvalCtx;
exports.evalConst = evalConst;
exports.evalExpr = evalExpr;
const errors_1 = require("../errors");
function makeEvalCtx(ac) {
    return {
        symbols: ac.symbols,
        // ★ externs は unresolved からではなく AsmContext.externs から作る
        externs: new Set(ac.externs),
        pass: 1,
        errors: ac.errors,
        visiting: new Set(),
        loc: ac.loc, // ★ $ 用に現在アドレスも持たせる
    };
}
function evalConst(expr, ctx) {
    if (!expr)
        return 0;
    // 🟩 デバッグ出力
    console.log(`[evalConst] evaluating:`, expr);
    // --- 比較演算式対応（WHILE counter<3 等） ---
    if (expr && typeof expr.text === "string") {
        const text = expr.text.trim();
        // より柔軟に空白・大文字小文字を許容
        const m = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*([<>]=?|==|!=)\s*(\d+)$/i);
        if (m) {
            const [, sym, op, rhsRaw] = m;
            const rhs = parseInt(rhsRaw, 10);
            const key = ctx.caseInsensitive ? sym.toUpperCase() : sym;
            const symEntry = ctx.symbols.get(key);
            const lhs = symEntry?.value ?? 0;
            console.log(`[evalConst] compare: ${lhs} ${op} ${rhs}`);
            switch (op) {
                case "<": return lhs < rhs ? 1 : 0;
                case "<=": return lhs <= rhs ? 1 : 0;
                case ">": return lhs > rhs ? 1 : 0;
                case ">=": return lhs >= rhs ? 1 : 0;
                case "==": return lhs === rhs ? 1 : 0;
                case "!=": return lhs !== rhs ? 1 : 0;
            }
        }
    }
    // --- フォールバック ---
    if (typeof expr === "number")
        return expr;
    if (typeof expr?.value === "number")
        return expr.value;
    if (typeof expr?.value === "function")
        return expr.value(); // ✅関数なら実行
    if (typeof expr.text === "string") {
        const sym = ctx.symbols.get(ctx.caseInsensitive ? expr.text.toUpperCase() : expr.text);
        if (sym)
            return sym.value;
    }
    return 0;
}
// evalExpr: 式を評価し Const か Reloc を返す（Error は返さない）
// - $ は Const(ctx.loc)
// - 未定義/外部はエラーにせず Reloc(sym, addend)
// - Reloc ± Const は加減算のみ許可
function evalExpr(expr, ctx) {
    switch (expr.kind) {
        case "Const":
            return { kind: "Const", value: expr.value };
        case "Symbol": {
            // ★ $ は現在アドレス
            if (expr.name === "$") {
                return { kind: "Const", value: ctx.loc ?? 0 };
            }
            // 定義済みなら即値 or 再帰評価
            if (ctx.symbols.has(expr.name)) {
                const entry = ctx.symbols.get(expr.name);
                if (typeof entry.value === "number") {
                    return { kind: "Const", value: entry.value };
                }
                else if (typeof entry === "number") {
                    // 古いMapを扱うコード互換用（後方互換）
                    return { kind: "Const", value: entry };
                }
                else {
                    if (ctx.visiting.has(expr.name)) {
                        ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.ExprCircularRef, `Circular reference detected: ${expr.name}`));
                        return { kind: "Error", code: errors_1.AssemblerErrorCode.ExprCircularRef };
                    }
                    ctx.visiting.add(expr.name);
                    const res = evalExpr(entry, ctx);
                    ctx.visiting.delete(expr.name);
                    return res;
                }
            }
            // 外部 or 未定義は Reloc として返す（ここではエラーを積まない）
            if (ctx.externs.has(expr.name)) {
                return { kind: "Reloc", sym: expr.name, addend: 0 };
            }
            // ★ undefined symbol → エラー＋Reloc
            ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.ExprUndefinedSymbol, `Undefined symbol: ${expr.name}`));
            return { kind: "Reloc", sym: expr.name, addend: 0 };
        }
        case "Unary": {
            const v = evalExpr(expr.expr, ctx);
            if (v.kind === "Const") {
                switch (expr.op) {
                    case "-":
                        return { kind: "Const", value: -v.value };
                    case "+":
                        return { kind: "Const", value: +v.value };
                    case "~":
                        return { kind: "Const", value: ~v.value };
                    case "!":
                        return { kind: "Const", value: v.value === 0 ? 1 : 0 };
                }
                return { kind: "Const", value: v.value };
            }
            // Reloc に単項マイナス等は非対応
            ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.ExprExternArithmetic, "Unary operator on relocatable expression is not supported"));
            return { kind: "Error", code: errors_1.AssemblerErrorCode.ExprExternArithmetic };
        }
        case "Binary": {
            const L = evalExpr(expr.left, ctx);
            const R = evalExpr(expr.right, ctx);
            // --- Const 同士 ---
            if (L.kind === "Const" && R.kind === "Const") {
                const val = evalBinary(expr.op, L.value, R.value, ctx);
                if (ctx.__forceError) {
                    delete ctx.__forceError;
                    return { kind: "Error", code: ctx.errors.at(-1)?.code ?? errors_1.AssemblerErrorCode.ExprNaN };
                }
                if (!Number.isFinite(val)) {
                    ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.ExprNaN, `Invalid numeric result: ${val}`));
                    return { kind: "Error", code: errors_1.AssemblerErrorCode.ExprNaN };
                }
                return { kind: "Const", value: val };
            }
            // --- Const * Reloc or Reloc * Const ---
            if ((L.kind === "Const" && R.kind === "Reloc") || (L.kind === "Reloc" && R.kind === "Const")) {
                if (["*", "/", "%"].includes(expr.op)) {
                    ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.ExprExternArithmetic, "Invalid extern arithmetic"));
                    return { kind: "Error", code: errors_1.AssemblerErrorCode.ExprExternArithmetic };
                }
            }
            // Reloc ± Const は許可（addend 調整）
            if (L.kind === "Reloc" && R.kind === "Const") {
                if (expr.op === "+")
                    return { kind: "Reloc", sym: L.sym, addend: (L.addend ?? 0) + R.value };
                if (expr.op === "-")
                    return { kind: "Reloc", sym: L.sym, addend: (L.addend ?? 0) - R.value };
                ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.ExprExternArithmetic, "Unsupported op with relocatable + const"));
                return { kind: "Const", value: 0 };
            }
            // --- Const + Reloc ---
            if (L.kind === "Const" && R.kind === "Reloc") {
                if (expr.op === "+")
                    return { kind: "Reloc", sym: R.sym, addend: (R.addend ?? 0) + L.value };
                if (expr.op === "-") {
                    // const - extern はリンク時に扱いづらいので非対応
                    ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.ExprConstMinusExtern, "const - extern is not supported"));
                    return { kind: "Error", code: errors_1.AssemblerErrorCode.ExprConstMinusExtern };
                }
                ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.ExprExternArithmetic, "Unsupported op with const + relocatable"));
                return { kind: "Const", value: 0 };
            }
            // Reloc 同士やその他の演算は非対応（リンク時に解決不能）
            if (L.kind === "Reloc" || R.kind === "Reloc") {
                ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.ExprExternArithmetic, "Relocatable expression not reducible"));
                return { kind: "Error", code: errors_1.AssemblerErrorCode.ExprExternArithmetic };
            }
            // 想定外
            ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.ExprNaN, "Unexpected expr combination"));
            return { kind: "Error", code: errors_1.AssemblerErrorCode.ExprNaN };
        }
        default:
            ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.ExprNaN, `Unknown expression node kind: ${expr.kind}`));
            return { kind: "Error", code: errors_1.AssemblerErrorCode.ExprNaN };
    }
}
function evalBinary(op, left, right, ctx) {
    let result;
    switch (op) {
        case "+":
            result = left + right;
            break;
        case "-":
            result = left - right;
            break;
        case "*":
            result = left * right;
            break;
        case "/":
            if (right === 0) {
                ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.ExprDivideByZero, "Division by zero"));
                ctx.__forceError = true;
                return 0;
            }
            result = Math.trunc(left / right);
            break;
        case "%":
            if (right === 0) {
                ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.ExprDivideByZero, "Modulo by zero"));
                ctx.__forceError = true;
                return 0;
            }
            result = left % right;
            break;
        case "<<":
            result = left * (2 ** right);
            break;
        case ">>":
            result = Math.trunc(left / (2 ** right));
            break;
        case "<":
            result = left < right ? 1 : 0;
            break;
        case "<=":
            result = left <= right ? 1 : 0;
            break;
        case ">":
            result = left > right ? 1 : 0;
            break;
        case ">=":
            result = left >= right ? 1 : 0;
            break;
        case "==":
            result = left === right ? 1 : 0;
            break;
        case "!=":
            result = left !== right ? 1 : 0;
            break;
        case "&":
            result = left & right;
            break;
        case "|":
            result = left | right;
            break;
        case "^":
            result = left ^ right;
            break;
        default:
            ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.ExprNaN, `Unsupported binary op '${op}'`));
            ctx.__forceError = true;
            return 0;
    }
    // 🚨 NaN / Infinity 検出：Const(0)を返しつつエラーをpush
    if (!Number.isFinite(result)) {
        ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.ExprNaN, `Expression evaluated to NaN or Infinity (op=${op})`));
        return 0;
    }
    return result;
}
