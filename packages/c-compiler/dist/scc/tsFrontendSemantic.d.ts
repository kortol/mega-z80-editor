import { AggregateKind, AdditiveOp, BitwiseOp, CompareOp, LogicalOp, MultiplicativeOp, PointerPointee, ScalarType, ShiftOp, SourceInitializer, SourceProgram, SourceType, TypeQualifiers, VoidTypeRef } from "./tsFrontendAst";
import { ValueWidth } from "./tsProgram";
export type SemanticScalarType = {
    kind: "scalar";
    name: ScalarType;
    width: ValueWidth;
    qualifiers?: TypeQualifiers;
};
export type SemanticArrayType = {
    kind: "array";
    elementType: ScalarType;
    elementValueType?: SemanticAggregateType | SemanticPointerType | SemanticFunctionPointerType;
    dimensions?: number[];
    length?: number;
    qualifiers?: TypeQualifiers;
    elementQualifiers?: TypeQualifiers;
};
export type SemanticPointerType = {
    kind: "pointer";
    pointee: PointerPointee;
    width: 2;
    qualifiers?: TypeQualifiers;
    pointeeQualifiers?: TypeQualifiers;
};
export type SemanticFunctionPointerType = {
    kind: "functionPointer";
    returnType: SemanticType;
    params: SemanticType[];
    isVariadic?: boolean;
    width: 2;
    qualifiers?: TypeQualifiers;
};
export type SemanticAggregateType = {
    kind: "aggregate";
    aggregateKind: AggregateKind;
    name: string;
    size: number;
    qualifiers?: TypeQualifiers;
};
export type SemanticVoidType = VoidTypeRef;
export type SemanticType = SemanticVoidType | SemanticScalarType | SemanticArrayType | SemanticPointerType | SemanticFunctionPointerType | SemanticAggregateType;
export type BoundFunctionSymbol = {
    kind: "function";
    name: string;
    returnType: SemanticType;
    params: SemanticType[];
    isVariadic?: boolean;
};
export type BoundParamSymbol = {
    kind: "param";
    name: string;
    type: SemanticType;
    slot: number;
};
export type BoundLocalSymbol = {
    kind: "local";
    name: string;
    type: SemanticType;
    storageBytes: number;
    slot: number;
};
export type BoundGlobalSymbol = {
    kind: "global";
    name: string;
    type: SemanticType;
    isStatic?: boolean;
    isExtern?: boolean;
    initializer?: SourceInitializer;
};
export type BoundProgram = {
    kind: "boundProgram";
    globals: BoundGlobalSymbol[];
    functions: BoundFunction[];
};
export type BoundFunction = {
    kind: "boundFunction";
    name: string;
    isStatic?: boolean;
    isVariadic?: boolean;
    returnType: SemanticType;
    params: BoundParamSymbol[];
    locals: BoundLocalSymbol[];
    body: BoundBlock;
};
export type BoundBlock = {
    kind: "boundBlock";
    statements: BoundStmt[];
};
export type BoundSwitchCase = {
    kind: "boundSwitchCase";
    value: number;
    body: BoundBlock;
};
export type BoundAggregateValueExpr = {
    kind: "aggregateRef";
    symbol: (BoundLocalSymbol | BoundParamSymbol | BoundGlobalSymbol) & {
        type: SemanticAggregateType;
    };
    type: SemanticAggregateType;
} | {
    kind: "aggregateAddress";
    pointer: BoundExpr;
    type: SemanticAggregateType;
} | {
    kind: "aggregateAssignExpr";
    target: BoundAggregateAssignmentTarget;
    source: BoundAggregateValueExpr;
    type: SemanticAggregateType;
} | {
    kind: "call";
    target: BoundFunctionSymbol;
    args: BoundCallArg[];
    type: SemanticAggregateType;
} | {
    kind: "indirectCall";
    target: BoundExpr;
    signature: SemanticFunctionPointerType;
    args: BoundCallArg[];
    type: SemanticAggregateType;
} | {
    kind: "comma";
    left: BoundExpr;
    right: BoundAggregateValueExpr;
    type: SemanticAggregateType;
} | {
    kind: "conditional";
    condition: BoundExpr;
    thenExpr: BoundAggregateValueExpr;
    elseExpr: BoundAggregateValueExpr;
    type: SemanticAggregateType;
};
type BoundAggregateAssignmentTarget = ((BoundLocalSymbol | BoundGlobalSymbol) & {
    type: SemanticAggregateType;
}) | {
    kind: "aggregateAddress";
    pointer: BoundExpr;
    type: SemanticAggregateType;
};
export type BoundCallArg = BoundExpr | BoundAggregateValueExpr;
export type BoundStmt = {
    kind: "return";
    expr: BoundExpr | BoundAggregateValueExpr;
} | {
    kind: "returnVoid";
} | {
    kind: "expr";
    expr: BoundExpr;
} | {
    kind: "if";
    condition: BoundExpr;
    thenBlock: BoundBlock;
    elseBlock?: BoundBlock;
} | {
    kind: "while";
    condition: BoundExpr;
    body: BoundBlock;
} | {
    kind: "doWhile";
    body: BoundBlock;
    condition: BoundExpr;
} | {
    kind: "for";
    initializer?: BoundForInit;
    condition?: BoundExpr;
    step?: BoundSimpleStmt;
    body: BoundBlock;
} | {
    kind: "switch";
    expr: BoundExpr;
    cases: BoundSwitchCase[];
    defaultCase?: BoundBlock;
} | {
    kind: "assign";
    local: BoundLocalSymbol;
    expr: BoundExpr;
} | {
    kind: "aggregateAssign";
    target: BoundLocalSymbol | BoundGlobalSymbol | {
        kind: "aggregateAddress";
        pointer: BoundExpr;
        type: SemanticAggregateType;
    };
    source: BoundAggregateValueExpr;
} | {
    kind: "arrayAssign";
    target: BoundLocalSymbol | BoundParamSymbol;
    index: BoundExpr;
    expr: BoundExpr;
} | {
    kind: "break";
} | {
    kind: "continue";
};
export type BoundSimpleStmt = {
    kind: "expr";
    expr: BoundExpr;
} | {
    kind: "assign";
    local: BoundLocalSymbol;
    expr: BoundExpr;
} | {
    kind: "aggregateAssign";
    target: BoundLocalSymbol | BoundGlobalSymbol | {
        kind: "aggregateAddress";
        pointer: BoundExpr;
        type: SemanticAggregateType;
    };
    source: BoundAggregateValueExpr;
} | {
    kind: "arrayAssign";
    target: BoundLocalSymbol | BoundParamSymbol;
    index: BoundExpr;
    expr: BoundExpr;
};
export type BoundForInit = BoundSimpleStmt | {
    kind: "localDecl";
    local: BoundLocalSymbol;
    initializer?: BoundExpr | BoundAggregateValueExpr;
    initStatements?: BoundSimpleStmt[];
} | {
    kind: "staticDecl";
};
export type BoundExpr = {
    kind: "const";
    value: number;
    type: SemanticScalarType;
} | {
    kind: "string";
    value: string;
    type: SemanticScalarType;
} | {
    kind: "ref";
    symbol: BoundParamSymbol | BoundLocalSymbol;
    type: SemanticScalarType | SemanticPointerType | SemanticFunctionPointerType;
} | {
    kind: "globalRef";
    symbol: BoundGlobalSymbol;
    type: SemanticScalarType | SemanticPointerType | SemanticFunctionPointerType;
} | {
    kind: "functionAddress";
    name: string;
    type: SemanticFunctionPointerType;
} | {
    kind: "localAddress";
    symbol: BoundLocalSymbol;
    type: SemanticPointerType;
} | {
    kind: "globalAddress";
    symbol: BoundGlobalSymbol;
    type: SemanticPointerType;
} | {
    kind: "aggregateFieldAccess";
    symbol: BoundLocalSymbol | BoundParamSymbol | BoundGlobalSymbol;
    offset: number;
    type: SemanticScalarType;
} | {
    kind: "aggregateProducerFieldRead";
    source: BoundAggregateValueExpr;
    offset: number;
    type: SemanticScalarType | SemanticPointerType | SemanticFunctionPointerType;
} | {
    kind: "aggregateProducerFieldAddress";
    source: BoundAggregateValueExpr;
    offset: number;
    type: SemanticPointerType;
} | {
    kind: "pointerAdd";
    pointer: BoundExpr;
    index: BoundExpr;
    pointee: PointerPointee;
    type: SemanticPointerType;
} | {
    kind: "arrayElementAddress";
    base: BoundExpr;
    indices: BoundExpr[];
    scales: number[];
    type: SemanticPointerType;
} | {
    kind: "localArrayElement";
    symbol: BoundLocalSymbol;
    index: BoundExpr;
    type: SemanticScalarType;
} | {
    kind: "paramArrayElement";
    symbol: BoundParamSymbol;
    index: BoundExpr;
    type: SemanticScalarType;
} | {
    kind: "globalArrayElement";
    symbol: BoundGlobalSymbol;
    index: BoundExpr;
    type: SemanticScalarType;
} | {
    kind: "deref";
    pointer: BoundExpr;
    type: SemanticScalarType | SemanticPointerType | SemanticFunctionPointerType;
} | {
    kind: "derefAssign";
    pointer: BoundExpr;
    expr: BoundExpr;
    type: SemanticScalarType | SemanticPointerType | SemanticFunctionPointerType;
} | {
    kind: "call";
    target: BoundFunctionSymbol | {
        kind: "extern";
        name: string;
        isVariadic?: boolean;
    };
    args: BoundCallArg[];
    type: SemanticScalarType | SemanticPointerType;
} | {
    kind: "indirectCall";
    target: BoundExpr;
    signature: SemanticFunctionPointerType;
    args: BoundCallArg[];
    type: SemanticScalarType | SemanticPointerType;
} | {
    kind: "vaStart";
    list: BoundLocalSymbol;
    type: SemanticScalarType;
} | {
    kind: "vaArg";
    list: BoundLocalSymbol;
    width: ValueWidth;
    type: SemanticScalarType | SemanticPointerType | SemanticFunctionPointerType;
} | {
    kind: "vaEnd";
    type: SemanticScalarType;
} | {
    kind: "preIncDec";
    local: BoundLocalSymbol;
    op: "++" | "--";
    type: SemanticScalarType | SemanticPointerType;
} | {
    kind: "postIncDec";
    local: BoundLocalSymbol;
    op: "++" | "--";
    type: SemanticScalarType | SemanticPointerType;
} | {
    kind: "preArrayIncDec";
    target: BoundLocalSymbol | BoundParamSymbol;
    index: BoundExpr;
    op: "++" | "--";
    type: SemanticScalarType;
} | {
    kind: "postArrayIncDec";
    target: BoundLocalSymbol | BoundParamSymbol;
    index: BoundExpr;
    op: "++" | "--";
    type: SemanticScalarType;
} | {
    kind: "derefIncDec";
    pointer: BoundExpr;
    op: "++" | "--";
    mode: "prefix" | "postfix";
    type: SemanticScalarType;
} | {
    kind: "assign";
    local: BoundLocalSymbol;
    expr: BoundExpr;
    type: SemanticScalarType | SemanticPointerType | SemanticFunctionPointerType;
} | {
    kind: "assignGlobal";
    global: BoundGlobalSymbol;
    expr: BoundExpr;
    type: SemanticScalarType | SemanticPointerType | SemanticFunctionPointerType;
} | {
    kind: "arrayAssignExpr";
    target: BoundLocalSymbol | BoundParamSymbol;
    index: BoundExpr;
    expr: BoundExpr;
    type: SemanticScalarType;
} | {
    kind: "globalArrayAssignExpr";
    target: BoundGlobalSymbol;
    index: BoundExpr;
    expr: BoundExpr;
    type: SemanticScalarType;
} | {
    kind: "cast";
    expr: BoundExpr;
    type: SemanticScalarType | SemanticPointerType;
} | {
    kind: "comma";
    left: BoundExpr;
    right: BoundExpr;
    type: SemanticScalarType | SemanticPointerType;
} | {
    kind: "conditional";
    condition: BoundExpr;
    thenExpr: BoundExpr;
    elseExpr: BoundExpr;
    type: SemanticScalarType | SemanticPointerType;
} | {
    kind: "compare";
    left: BoundExpr;
    right: BoundExpr;
    op: CompareOp;
    type: SemanticScalarType;
} | {
    kind: "logical";
    left: BoundExpr;
    right: BoundExpr;
    op: LogicalOp;
    type: SemanticScalarType;
} | {
    kind: "bitwise";
    left: BoundExpr;
    right: BoundExpr;
    op: BitwiseOp;
    type: SemanticScalarType;
} | {
    kind: "shift";
    left: BoundExpr;
    right: BoundExpr;
    op: ShiftOp;
    type: SemanticScalarType;
} | {
    kind: "multiplicative";
    left: BoundExpr;
    right: BoundExpr;
    op: MultiplicativeOp;
    type: SemanticScalarType;
} | {
    kind: "additive";
    left: BoundExpr;
    right: BoundExpr;
    op: AdditiveOp;
    type: SemanticScalarType;
};
export declare function getAggregateLayoutFields(type: Pick<SemanticAggregateType, "aggregateKind" | "name">): Array<{
    name: string;
    type: SourceType;
    size: number;
}>;
export declare function getAggregateLayoutSize(type: Pick<SemanticAggregateType, "aggregateKind" | "name">): number;
export declare function analyzeProgram(program: SourceProgram, sourceText: string, file?: string, options?: {
    runtimeVariadicNames?: ReadonlySet<string>;
}): BoundProgram;
export {};
