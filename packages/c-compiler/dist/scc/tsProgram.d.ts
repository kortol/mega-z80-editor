export type ValueWidth = 1 | 2;
export type ProgramSpec = {
    moduleName: string;
    exports?: string[];
    externs?: string[];
    data?: DataSpec[];
    bss?: DataSpec[];
    functions: FunctionSpec[];
    includeBss?: boolean;
};
export type AggregateProducerSpec = {
    kind: "aggregateRef";
    scope: "local" | "arg";
    offset: number;
    size: number;
} | {
    kind: "aggregateRef";
    scope: "global";
    name: string;
    size: number;
} | {
    kind: "aggregateAddress";
    pointer: ExprSpec;
    size: number;
} | {
    kind: "aggregateAssignExpr";
    effectDestination: Exclude<AggregateDestinationSpec, {
        kind: "returnSlot";
    }>;
    valueDestination: Extract<AggregateDestinationSpec, {
        kind: "localSlot";
    }>;
    source: AggregateProducerSpec;
    size: number;
} | {
    kind: "call";
    target: string;
    args?: CallArgSpec[];
    size: number;
    isVariadic?: boolean;
} | {
    kind: "indirectCall";
    target: ExprSpec;
    args?: CallArgSpec[];
    size: number;
    isVariadic?: boolean;
} | {
    kind: "comma";
    left: ExprSpec;
    right: AggregateProducerSpec;
    size: number;
} | {
    kind: "conditional";
    condition: ExprSpec;
    thenExpr: AggregateProducerSpec;
    elseExpr: AggregateProducerSpec;
    size: number;
};
export type AggregateDestinationSpec = {
    kind: "localSlot";
    offset: number;
    size: number;
} | {
    kind: "globalSymbol";
    name: string;
    size: number;
} | {
    kind: "pointer";
    pointer: ExprSpec;
    size: number;
} | {
    kind: "returnSlot";
    size: number;
};
export type AggregateConsumerSpec = {
    kind: "addressArg";
    source: AggregateProducerSpec;
    tempOffset: number;
} | {
    kind: "fieldRead";
    source: AggregateProducerSpec;
    tempOffset?: number;
    offset: number;
    width: ValueWidth;
} | {
    kind: "fieldAddress";
    source: AggregateProducerSpec;
    tempOffset?: number;
    offset: number;
};
export type CallArgSpec = {
    kind: "expr";
    expr: ExprSpec;
} | {
    kind: "aggregateConsumer";
    consumer: Extract<AggregateConsumerSpec, {
        kind: "addressArg";
    }>;
};
export type ExprSpec = {
    kind: "const";
    value: number;
} | {
    kind: "dataAddress";
    label: string;
} | {
    kind: "globalAddress";
    name: string;
} | {
    kind: "variadicStartAddress";
    offset: number;
} | {
    kind: "vaArg";
    listOffset: number;
    width: ValueWidth;
} | {
    kind: "localAddress";
    offset: number;
} | {
    kind: "localArrayElement";
    offset: number;
} | {
    kind: "localArrayElementExpr";
    offset: number;
    index: ExprSpec;
} | {
    kind: "globalArrayElement";
    name: string;
    index: ExprSpec;
} | {
    kind: "argArrayElement";
    offset: number;
    index: ExprSpec;
} | {
    kind: "pointerAdd";
    pointer: ExprSpec;
    index: ExprSpec;
    scale: number;
} | {
    kind: "derefByte";
    pointer: ExprSpec;
} | {
    kind: "derefWord";
    pointer: ExprSpec;
} | {
    kind: "assignDerefByte";
    pointer: ExprSpec;
    expr: ExprSpec;
} | {
    kind: "assignDerefWord";
    pointer: ExprSpec;
    expr: ExprSpec;
} | {
    kind: "incDecDeref";
    pointer: ExprSpec;
    width: ValueWidth;
    op: "++" | "--";
    mode: "prefix" | "postfix";
} | {
    kind: "call";
    target: string;
    args?: CallArgSpec[];
    isVariadic?: boolean;
} | {
    kind: "incDecLocal";
    offset: number;
    width: ValueWidth;
    step: 1 | 2;
    op: "++" | "--";
    mode: "prefix" | "postfix";
} | {
    kind: "incDecLocalArray";
    offset: number;
    index: ExprSpec;
    op: "++" | "--";
    mode: "prefix" | "postfix";
} | {
    kind: "incDecArgArray";
    offset: number;
    index: ExprSpec;
    op: "++" | "--";
    mode: "prefix" | "postfix";
} | {
    kind: "assignLocal";
    offset: number;
    width: ValueWidth;
    expr: ExprSpec;
} | {
    kind: "assignGlobal";
    name: string;
    width: ValueWidth;
    expr: ExprSpec;
} | {
    kind: "assignLocalArray";
    offset: number;
    index: ExprSpec;
    expr: ExprSpec;
} | {
    kind: "assignGlobalArray";
    name: string;
    index: ExprSpec;
    expr: ExprSpec;
} | {
    kind: "assignArgArray";
    offset: number;
    index: ExprSpec;
    expr: ExprSpec;
} | {
    kind: "comma";
    left: ExprSpec;
    right: ExprSpec;
} | {
    kind: "indirectCall";
    target: ExprSpec;
    args?: CallArgSpec[];
    isVariadic?: boolean;
} | {
    kind: "conditional";
    condition: ExprSpec;
    thenExpr: ExprSpec;
    elseExpr: ExprSpec;
} | {
    kind: "logical";
    left: ExprSpec;
    right: ExprSpec;
    op: "&&" | "||";
} | {
    kind: "bitwise";
    left: ExprSpec;
    right: ExprSpec;
    op: "&" | "^" | "|";
} | {
    kind: "helperBinary";
    left: ExprSpec;
    right: ExprSpec;
    helper: ".mul" | ".asl" | ".asr";
} | {
    kind: "divmod";
    left: ExprSpec;
    right: ExprSpec;
    result: "quotient" | "remainder";
} | {
    kind: "compare";
    left: ExprSpec;
    right: ExprSpec;
    helper: string;
} | {
    kind: "additive";
    left: ExprSpec;
    right: ExprSpec;
    op: "+" | "-";
} | {
    kind: "aggregateConsumer";
    consumer: Extract<AggregateConsumerSpec, {
        kind: "fieldRead" | "fieldAddress";
    }>;
} | {
    kind: "localChar";
    offset: number;
} | {
    kind: "localInt";
    offset: number;
} | {
    kind: "argChar";
    offset: number;
} | {
    kind: "argInt";
    offset: number;
} | {
    kind: "globalRef";
    name: string;
    width: ValueWidth;
};
export type FunctionSpec = {
    name: string;
    statements: StatementSpec[];
};
export type DataSpec = {
    label?: string;
    directive: ".ascii" | ".asciz" | ".db" | ".dw" | ".ds";
    value: string;
};
export type RefIR = {
    kind: "ref";
    scope: "local" | "arg";
    width: ValueWidth;
    slot: number;
};
export type AggregateProducerIR = {
    kind: "aggregateRef";
    scope: "local" | "arg";
    slot: number;
    size: number;
} | {
    kind: "aggregateRef";
    scope: "global";
    slot: string;
    size: number;
} | {
    kind: "aggregateAddress";
    pointer: ExprIR;
    size: number;
} | {
    kind: "aggregateAssignExpr";
    effectDestination: Exclude<AggregateDestinationIR, {
        kind: "returnSlot";
    }>;
    valueDestination: Extract<AggregateDestinationIR, {
        kind: "localSlot";
    }>;
    source: AggregateProducerIR;
    size: number;
} | {
    kind: "call";
    target: string;
    args?: CallArgIR[];
    size: number;
    isVariadic?: boolean;
} | {
    kind: "indirectCall";
    target: ExprIR;
    args?: CallArgIR[];
    size: number;
    isVariadic?: boolean;
} | {
    kind: "comma";
    left: ExprIR;
    right: AggregateProducerIR;
    size: number;
} | {
    kind: "conditional";
    condition: ExprIR;
    thenExpr: AggregateProducerIR;
    elseExpr: AggregateProducerIR;
    size: number;
};
export type AggregateDestinationIR = {
    kind: "localSlot";
    slot: number;
    size: number;
} | {
    kind: "globalSymbol";
    name: string;
    size: number;
} | {
    kind: "pointer";
    pointer: ExprIR;
    size: number;
} | {
    kind: "returnSlot";
    size: number;
};
export type AggregateConsumerIR = {
    kind: "addressArg";
    source: AggregateProducerIR;
    tempSlot: number;
} | {
    kind: "fieldRead";
    source: AggregateProducerIR;
    tempSlot?: number;
    offset: number;
    width: ValueWidth;
} | {
    kind: "fieldAddress";
    source: AggregateProducerIR;
    tempSlot?: number;
    offset: number;
};
export type CallArgIR = {
    kind: "expr";
    expr: ExprIR;
} | {
    kind: "aggregateConsumer";
    consumer: Extract<AggregateConsumerIR, {
        kind: "addressArg";
    }>;
};
export type ExprIR = {
    kind: "const";
    value: number;
} | {
    kind: "dataAddress";
    label: string;
} | {
    kind: "globalAddress";
    name: string;
} | {
    kind: "variadicStartAddress";
} | {
    kind: "vaArg";
    listSlot: number;
    width: ValueWidth;
} | {
    kind: "localAddress";
    slot: number;
} | {
    kind: "localArrayElement";
    slot: number;
    index: ExprIR;
} | {
    kind: "globalArrayElement";
    name: string;
    index: ExprIR;
} | {
    kind: "argArrayElement";
    slot: number;
    index: ExprIR;
} | {
    kind: "pointerAdd";
    pointer: ExprIR;
    index: ExprIR;
    scale: number;
} | {
    kind: "derefByte";
    pointer: ExprIR;
} | {
    kind: "derefWord";
    pointer: ExprIR;
} | {
    kind: "assignDerefByte";
    pointer: ExprIR;
    expr: ExprIR;
} | {
    kind: "assignDerefWord";
    pointer: ExprIR;
    expr: ExprIR;
} | {
    kind: "incDecDeref";
    pointer: ExprIR;
    width: ValueWidth;
    op: "++" | "--";
    mode: "prefix" | "postfix";
} | RefIR | {
    kind: "incDecLocal";
    slot: number;
    width: ValueWidth;
    step: 1 | 2;
    op: "++" | "--";
    mode: "prefix" | "postfix";
} | {
    kind: "incDecLocalArray";
    slot: number;
    index: ExprIR;
    op: "++" | "--";
    mode: "prefix" | "postfix";
} | {
    kind: "incDecArgArray";
    slot: number;
    index: ExprIR;
    op: "++" | "--";
    mode: "prefix" | "postfix";
} | {
    kind: "assignLocal";
    slot: number;
    width: ValueWidth;
    expr: ExprIR;
} | {
    kind: "assignGlobal";
    name: string;
    width: ValueWidth;
    expr: ExprIR;
} | {
    kind: "assignLocalArray";
    slot: number;
    index: ExprIR;
    expr: ExprIR;
} | {
    kind: "assignGlobalArray";
    name: string;
    index: ExprIR;
    expr: ExprIR;
} | {
    kind: "assignArgArray";
    slot: number;
    index: ExprIR;
    expr: ExprIR;
} | {
    kind: "comma";
    left: ExprIR;
    right: ExprIR;
} | {
    kind: "indirectCall";
    target: ExprIR;
    args?: CallArgIR[];
    isVariadic?: boolean;
} | {
    kind: "conditional";
    condition: ExprIR;
    thenExpr: ExprIR;
    elseExpr: ExprIR;
} | {
    kind: "logical";
    left: ExprIR;
    right: ExprIR;
    op: "&&" | "||";
} | {
    kind: "bitwise";
    left: ExprIR;
    right: ExprIR;
    op: "&" | "^" | "|";
} | {
    kind: "helperBinary";
    left: ExprIR;
    right: ExprIR;
    helper: ".mul" | ".asl" | ".asr";
} | {
    kind: "divmod";
    left: ExprIR;
    right: ExprIR;
    result: "quotient" | "remainder";
} | {
    kind: "compare";
    left: ExprIR;
    right: ExprIR;
    helper: string;
} | {
    kind: "additive";
    left: ExprIR;
    right: ExprIR;
    op: "+" | "-";
} | {
    kind: "aggregateConsumer";
    consumer: Extract<AggregateConsumerIR, {
        kind: "fieldRead" | "fieldAddress";
    }>;
} | {
    kind: "globalRef";
    name: string;
    width: ValueWidth;
} | {
    kind: "call";
    target: string;
    args?: CallArgIR[];
    isVariadic?: boolean;
};
export type FunctionIR = {
    name: string;
    params: ValueWidth[];
    isVariadic?: boolean;
    locals: number[];
    body: StmtIRHigh[];
};
export type StmtIRHigh = {
    kind: "materializeAggregateProducer";
    destination: AggregateDestinationIR;
    source: AggregateProducerIR;
} | {
    kind: "assignLocalConst";
    slot: number;
    width: ValueWidth;
    value: number;
} | {
    kind: "assignLocalExpr";
    slot: number;
    width: ValueWidth;
    expr: ExprIR;
} | {
    kind: "assignLocalArrayConst";
    slot: number;
    index: number;
    value: number;
} | {
    kind: "assignLocalArrayExpr";
    slot: number;
    index: number;
    expr: ExprIR;
} | {
    kind: "assignLocalArrayDynamic";
    slot: number;
    index: ExprIR;
    expr: ExprIR;
} | {
    kind: "assignArgArrayDynamic";
    slot: number;
    index: ExprIR;
    expr: ExprIR;
} | {
    kind: "compareReturn";
    left: ExprIR;
    right: ExprIR;
    helper: string;
} | {
    kind: "returnExpr";
    expr: ExprIR;
} | {
    kind: "evalExpr";
    expr: ExprIR;
} | {
    kind: "returnVoid";
} | {
    kind: "emitExprChar";
    expr: ExprIR;
} | {
    kind: "callModeAArg";
    target: string;
    mode: number;
    expr: ExprIR;
} | {
    kind: "decLocalByte";
    slot: number;
} | {
    kind: "emitChar";
    value: number;
} | {
    kind: "whileExprNonZero";
    expr: ExprIR;
    body: StmtIRHigh[];
    stepBody?: StmtIRHigh[];
} | {
    kind: "doWhileExprNonZero";
    body: StmtIRHigh[];
    expr: ExprIR;
} | {
    kind: "switchExpr";
    expr: ExprIR;
    cases: Array<{
        value: number;
        body: StmtIRHigh[];
    }>;
    defaultBody: StmtIRHigh[];
} | {
    kind: "break";
} | {
    kind: "continue";
} | {
    kind: "ifExprZero";
    expr: ExprIR;
    thenBody: StmtIRHigh[];
    elseBody: StmtIRHigh[];
};
type StatementSpec = {
    kind: "materializeAggregateProducer";
    destination: AggregateDestinationSpec;
    source: AggregateProducerSpec;
} | {
    kind: "call";
    target: string;
} | {
    kind: "loadConstHl";
    value: number;
} | {
    kind: "loadDataAddressHl";
    label: string;
} | {
    kind: "loadExprHl";
    expr: ExprSpec;
} | {
    kind: "pushExprArg";
    expr: ExprSpec;
} | {
    kind: "pushHlArg";
} | {
    kind: "popBc";
} | {
    kind: "ret";
} | {
    kind: "callWithModeA";
    target: string;
    mode: number;
} | {
    kind: "truthJumpZero";
    target: string;
} | {
    kind: "label";
    name: string;
} | {
    kind: "jump";
    target: string;
} | {
    kind: "decSp";
} | {
    kind: "incSp";
} | {
    kind: "reserveBytes";
    count: number;
} | {
    kind: "releaseBytes";
    count: number;
} | {
    kind: "loadLocalAddrHl";
    offset: number;
} | {
    kind: "storeImmToLocal";
    offset: number;
    value: number;
} | {
    kind: "storeExprToLocalByte";
    offset: number;
    expr: ExprSpec;
} | {
    kind: "storeExprToLocalArrayByte";
    offset: number;
    index: ExprSpec;
    expr: ExprSpec;
} | {
    kind: "storeExprToArgArrayByte";
    offset: number;
    index: ExprSpec;
    expr: ExprSpec;
} | {
    kind: "loadLocalCharToHl";
    offset: number;
} | {
    kind: "storeImm16ToLocal";
    offset: number;
    value: number;
} | {
    kind: "storeExprToLocalWord";
    offset: number;
    expr: ExprSpec;
} | {
    kind: "loadLocalIntToHl";
    offset: number;
} | {
    kind: "decLocalByte";
    offset: number;
} | {
    kind: "compareExprHelper";
    left: ExprSpec;
    right: ExprSpec;
    helper: string;
};
export declare function emitProgram(spec: ProgramSpec): string;
export declare function lowerFunctionIR(fn: FunctionIR): FunctionSpec;
export {};
