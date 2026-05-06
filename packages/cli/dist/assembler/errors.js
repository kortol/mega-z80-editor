"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssemblerErrorCode = void 0;
exports.makeError = makeError;
exports.makeWarning = makeWarning;
// エラーコードをまとめた列挙型
var AssemblerErrorCode;
(function (AssemblerErrorCode) {
    // 汎用
    AssemblerErrorCode["Unknown"] = "A0000";
    AssemblerErrorCode["IncludeSyntaxError"] = "A1001";
    AssemblerErrorCode["IncludeNotFound"] = "A1002";
    AssemblerErrorCode["IncludeLoop"] = "A1003";
    AssemblerErrorCode["IncludeDuplicate"] = "A1004";
    // Expr 系
    AssemblerErrorCode["ExprOverflow"] = "A2001";
    AssemblerErrorCode["ExprUndefinedSymbol"] = "A2100";
    AssemblerErrorCode["ExprExternArithmetic"] = "A2101";
    AssemblerErrorCode["ExprConstMinusExtern"] = "A2102";
    AssemblerErrorCode["ExprCircularRef"] = "A2103";
    AssemblerErrorCode["ExprNotConstant"] = "A2104";
    AssemblerErrorCode["ExprDivideByZero"] = "A2200";
    AssemblerErrorCode["ExprNaN"] = "A2201";
    AssemblerErrorCode["ExprOutRange"] = "A2202";
    // Parser 系
    AssemblerErrorCode["UnexpectedToken"] = "A3000";
    AssemblerErrorCode["UnterminatedString"] = "A3001";
    AssemblerErrorCode["InvalidEquSyntax"] = "A3002";
    AssemblerErrorCode["ExprExternInEnd"] = "A3101";
    AssemblerErrorCode["RedefSymbol"] = "A3102";
    AssemblerErrorCode["SyntaxError"] = "A3103";
    // Encoder 系
    AssemblerErrorCode["InvalidOperand"] = "A4000";
    AssemblerErrorCode["RangeError"] = "A4001";
    AssemblerErrorCode["ExternMissingSymbol"] = "A4002";
    AssemblerErrorCode["MissingOperand"] = "A4003";
    // Linker 系
    AssemblerErrorCode["UnresolvedExtern"] = "A5000";
    // Section 系
    AssemblerErrorCode["OrgBackward"] = "A6000";
    // --- Macro 系 ---
    AssemblerErrorCode["MacroMissingName"] = "A7000";
    AssemblerErrorCode["MacroNestedNotAllowed"] = "A7001";
    AssemblerErrorCode["MacroEndmMissing"] = "A7002";
    AssemblerErrorCode["MacroGarbageAfterEndm"] = "A7003";
    AssemblerErrorCode["MacroRedefined"] = "A7004";
    AssemblerErrorCode["MacroRecursionLimit"] = "A7005";
    // --- P2-G Stage 2: 引数展開／命令衝突対応 ---
    AssemblerErrorCode["MacroArgTooFew"] = "A7100";
    AssemblerErrorCode["MacroArgTooMany"] = "A7101";
    AssemblerErrorCode["MacroArgCountMismatch"] = "A7102";
    AssemblerErrorCode["MacroInvalidParamName"] = "A7103";
    AssemblerErrorCode["MacroLocalNameClash"] = "A7104";
    AssemblerErrorCode["MacroRecursive"] = "A7105";
    AssemblerErrorCode["MacroNotFound"] = "A7106";
    AssemblerErrorCode["MacroNameReserved"] = "A7107";
    AssemblerErrorCode["MacroOverridesInstr"] = "A7108";
    // Branch 系
    AssemblerErrorCode["OutOfRange8"] = "A8000";
    AssemblerErrorCode["OutOfRangeRel"] = "A8001";
    // --- LoopFrame / REPT / WHILE 系 (P3-A / P3-B 拡張) ---
    AssemblerErrorCode["ReptCountNegative"] = "A9000";
    AssemblerErrorCode["ReptCountNonConst"] = "A9001";
    AssemblerErrorCode["ReptLimitExceeded"] = "A9002";
    AssemblerErrorCode["ReptMissingEndm"] = "A9003";
    AssemblerErrorCode["WhileLimitExceeded"] = "A9010";
    AssemblerErrorCode["WhileConditionInvalid"] = "A9011";
    AssemblerErrorCode["LoopCounterOutside"] = "A9020";
    AssemblerErrorCode["LoopCounterOutOfScope"] = "A9021";
    AssemblerErrorCode["LoopNestLimitExceeded"] = "A9022";
    AssemblerErrorCode["LoopLimitExceeded"] = "A9023";
    AssemblerErrorCode["LocalUnbound"] = "A9030";
    AssemblerErrorCode["LocalValueNotNumeric"] = "A9031";
    AssemblerErrorCode["IrpcCharExpectSingle"] = "A9032";
})(AssemblerErrorCode || (exports.AssemblerErrorCode = AssemblerErrorCode = {}));
// メッセージを組み立てるヘルパー
function makeError(code, message, opts = {}) {
    return { code, message, ...opts };
}
// --- 警告メッセージを生成するヘルパー（P2-G 用） ---
function makeWarning(code, message, opts = {}) {
    return { code, message, ...opts };
}
