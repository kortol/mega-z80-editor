import { SourceFrame, SourcePos } from "./context";
export declare enum AssemblerErrorCode {
    Unknown = "A0000",
    IncludeSyntaxError = "A1001",
    IncludeNotFound = "A1002",
    IncludeLoop = "A1003",
    IncludeDuplicate = "A1004",
    ExprOverflow = "A2001",// 幅外れ (下位ビット採用)
    ExprUndefinedSymbol = "A2100",// 未定義シンボル
    ExprExternArithmetic = "A2101",// EXT ± EXT
    ExprConstMinusExtern = "A2102",// const - EXT
    ExprCircularRef = "A2103",// シンボルの循環参照
    ExprNotConstant = "A2104",// 定数ではない
    ExprDivideByZero = "A2200",// ゼロ除算/剰余ゼロ
    ExprNaN = "A2201",// 演算結果がNaN/Infinity
    ExprOutRange = "A2202",// 演算結果が範囲外
    UnexpectedToken = "A3000",
    UnterminatedString = "A3001",
    InvalidEquSyntax = "A3002",
    ExprExternInEnd = "A3101",
    RedefSymbol = "A3102",// シンボルの再定義
    SyntaxError = "A3103",
    InvalidOperand = "A4000",
    RangeError = "A4001",
    ExternMissingSymbol = "A4002",// ★ 新規
    MissingOperand = "A4003",
    UnresolvedExtern = "A5000",
    OrgBackward = "A6000",// ORGが後退
    MacroMissingName = "A7000",// MACRO の前にラベルがない
    MacroNestedNotAllowed = "A7001",// ネストした MACRO 定義
    MacroEndmMissing = "A7002",// ENDM が見つからない
    MacroGarbageAfterEndm = "A7003",// ENDM の後に余分なトークン
    MacroRedefined = "A7004",// 同名マクロの再定義
    MacroRecursionLimit = "A7005",// マクロ展開の再帰上限超過
    MacroArgTooFew = "A7100",// 実引数不足
    MacroArgTooMany = "A7101",// 実引数過剰
    MacroArgCountMismatch = "A7102",// 実引数数が定義と異なる（汎用）
    MacroInvalidParamName = "A7103",// 不正なパラメータ名
    MacroLocalNameClash = "A7104",// ローカルラベル衝突
    MacroRecursive = "A7105",// 自己再帰呼び出し
    MacroNotFound = "A7106",// 未定義マクロ呼び出し
    MacroNameReserved = "A7107",// strictモード: 命令名を上書き禁止
    MacroOverridesInstr = "A7108",// 通常モード: 命令名を上書き（警告）
    OutOfRange8 = "A8000",
    OutOfRangeRel = "A8001",
    ReptCountNegative = "A9000",// REPT カウントが負数
    ReptCountNonConst = "A9001",// REPT カウントが定数でない
    ReptLimitExceeded = "A9002",// REPT 展開回数が上限超過
    ReptMissingEndm = "A9003",// ENDM が欠落
    WhileLimitExceeded = "A9010",// WHILE の無限ループ防止上限
    WhileConditionInvalid = "A9011",// WHILE 条件が不正（未解決など）
    LoopCounterOutside = "A9020",// \# がループ外で使われた
    LoopCounterOutOfScope = "A9021",// \##n が範囲外
    LoopNestLimitExceeded = "A9022",// ループのネスト上限超過
    LoopLimitExceeded = "A9023",// 全ループ共通の反復上限
    LocalUnbound = "A9030",// IRP/IRPC で未束縛のローカル変数参照
    LocalValueNotNumeric = "A9031",// IRP/IRPC のローカル値が数値変換できない
    IrpcCharExpectSingle = "A9032"
}
export interface AssemblerError {
    code: AssemblerErrorCode;
    message: string;
    symbol?: string;
    pos?: SourcePos;
    /** INCLUDE / MACRO 呼び出しなどのスタック情報 */
    frame?: SourceFrame;
    /** ネストした呼び出しトレース（INCLUDEスタックなど） */
    trace?: SourceFrame[];
}
export declare function makeError(code: AssemblerErrorCode, message: string, opts?: Partial<AssemblerError>): AssemblerError;
export declare function makeWarning(code: AssemblerErrorCode, message: string, opts?: Partial<AssemblerError>): AssemblerError;
