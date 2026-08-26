export type ScalarType = "char" | "int";
export type AggregateKind = "struct" | "union";
export type TypeQualifiers = {
  isConst?: boolean;
  isVolatile?: boolean;
  isRestrict?: boolean;
};
export type VoidTypeRef = {
  kind: "void";
  qualifiers?: TypeQualifiers;
};

export type AggregateTypeRef = {
  kind: "aggregate";
  aggregateKind: AggregateKind;
  name: string;
  qualifiers?: TypeQualifiers;
};

export type PointerTypeRef = {
  kind: "pointer";
  pointee: PointerPointee;
  // Qualifiers on the pointer object itself (`int * const p`).
  qualifiers?: TypeQualifiers;
  // Qualifiers on the immediate pointee (`const int *p`). Pointer pointees
  // retain their own qualifiers recursively through PointerPointee.
  pointeeQualifiers?: TypeQualifiers;
};

export type ArrayPointerTypeRef = {
  kind: "arrayPointer";
  elementType: ScalarType;
  elementValueType?: AggregateTypeRef | PointerTypeRef | FunctionPointerTypeRef | ArrayPointerTypeRef;
  length: number;
  // Further array bounds, represented recursively in elementValueType.  This
  // makes `T (*)[a][b]` distinct from `T (*)[a]` without a parallel type.
  qualifiers?: TypeQualifiers;
  elementQualifiers?: TypeQualifiers;
};

export type FunctionPointerTypeRef = {
  kind: "functionPointer";
  returnType: SourceType;
  params: SourceType[];
  isVariadic?: boolean;
  qualifiers?: TypeQualifiers;
};

export type ArrayElementTypeRef = ScalarType | AggregateTypeRef | PointerTypeRef | FunctionPointerTypeRef;

export type PointerPointee = ScalarType | AggregateTypeRef | PointerTypeRef | ArrayPointerTypeRef | FunctionPointerTypeRef;

export type SourceType =
  | VoidTypeRef
  | {
    kind: "scalar";
    name: ScalarType;
    qualifiers?: TypeQualifiers;
  }
  | AggregateTypeRef
  | PointerTypeRef
  | FunctionPointerTypeRef
  | {
    kind: "array";
    elementType: ScalarType;
    // Scalar arrays retain elementType; non-scalar arrays use this descriptor.
    elementValueType?: Exclude<ArrayElementTypeRef, ScalarType>;
    // The outermost bound is length; subsequent bounds preserve row shape.
    dimensions?: number[];
    length?: number;
    qualifiers?: TypeQualifiers;
    elementQualifiers?: TypeQualifiers;
  };

export type SourceProgram = {
  kind: "program";
  aggregates: SourceAggregateDef[];
  globals: SourceGlobalDecl[];
  functions: SourceFunction[];
};

export type SourceAggregateField = {
  kind: "field";
  name: string;
  type: SourceType;
};

export type SourceAggregateDef = {
  kind: "aggregateDef";
  aggregateKind: AggregateKind;
  name: string;
  fields: SourceAggregateField[];
};

export type SourceFunction = {
  kind: "function";
  name: string;
  isStatic?: boolean;
  returnType: SourceType;
  params: SourceParam[];
  isVariadic?: boolean;
  body: SourceBlock;
};

export type SourceParam = {
  kind: "param";
  name: string;
  type: SourceType;
};

export type SourceLocalDecl = {
  kind: "localDecl";
  name: string;
  type: SourceType;
  isStatic?: boolean;
  initializer?: SourceInitializer;
};

export type SourceGlobalDecl = {
  kind: "globalDecl";
  name: string;
  type: SourceType;
  isStatic?: boolean;
  isExtern?: boolean;
  initializer?: SourceInitializer;
};

export type SourceInitializer =
  | {
    kind: "expr";
    expr: SourceExpr;
  }
  | {
    kind: "list";
    items: SourceInitializer[];
  };

export type SourceBlock = {
  kind: "block";
  declarations: SourceLocalDecl[];
  statements: SourceStmt[];
};

export type SourceSwitchCase = {
  kind: "switchCase";
  value: number;
  body: SourceBlock;
};

export type CompareOp = "==" | "!=" | ">" | "<" | ">=" | "<=";
export type ShiftOp = "<<" | ">>";
export type AdditiveOp = "+" | "-";
export type MultiplicativeOp = "*" | "/" | "%";
export type LogicalOp = "&&" | "||";
export type BitwiseOp = "&" | "^" | "|";
export type BinaryOp = LogicalOp | BitwiseOp | CompareOp | ShiftOp | AdditiveOp | MultiplicativeOp;

export type SourceStmt = (
  | {
    kind: "return";
    expr: SourceExpr;
  }
  | {
    kind: "returnVoid";
  }
  | {
    kind: "expr";
    expr: SourceExpr;
  }
  | {
    kind: "if";
    condition: SourceExpr;
    thenBlock: SourceBlock;
    elseBlock?: SourceBlock;
  }
  | {
    kind: "while";
    condition: SourceExpr;
    body: SourceBlock;
  }
  | {
    kind: "doWhile";
    body: SourceBlock;
    condition: SourceExpr;
  }
  | {
    kind: "for";
    initializer?: SourceForInit;
    condition?: SourceExpr;
    step?: SourceSimpleStmt;
    body: SourceBlock;
  }
  | {
    kind: "switch";
    expr: SourceExpr;
    cases: SourceSwitchCase[];
    defaultCase?: SourceBlock;
  }
  | {
    kind: "assign";
    name: string;
    expr: SourceExpr;
  }
  | {
    kind: "arrayAssign";
    name: string;
    index: SourceExpr;
    expr: SourceExpr;
  }
  | {
    kind: "memberAssign";
    name: string;
    field: string;
    expr: SourceExpr;
  }
  | {
    kind: "memberExprAssign";
    target: SourceExpr;
    field: string;
    expr: SourceExpr;
  }
  | {
    kind: "memberArrayAssign";
    target: SourceExpr;
    field: string;
    index: SourceExpr;
    expr: SourceExpr;
  }
  | {
    kind: "pointerMemberArrayAssign";
    name: string;
    field: string;
    index: SourceExpr;
    expr: SourceExpr;
  }
  | {
    kind: "pointerMemberAssign";
    name: string;
    field: string;
    expr: SourceExpr;
  }
  | {
    kind: "pointerMemberExprAssign";
    target: SourceExpr;
    field: string;
    expr: SourceExpr;
  }
  | {
    kind: "break";
  }
  | {
    kind: "continue";
  }) & { isInitialization?: boolean };

export type SourceSimpleStmt = (
  | {
    kind: "expr";
    expr: SourceExpr;
  }
  | {
    kind: "assign";
    name: string;
    expr: SourceExpr;
  }
  | {
    kind: "arrayAssign";
    name: string;
    index: SourceExpr;
    expr: SourceExpr;
  }
  | {
    kind: "memberAssign";
    name: string;
    field: string;
    expr: SourceExpr;
  }
  | {
    kind: "memberExprAssign";
    target: SourceExpr;
    field: string;
    expr: SourceExpr;
  }
  | {
    kind: "memberArrayAssign";
    target: SourceExpr;
    field: string;
    index: SourceExpr;
    expr: SourceExpr;
  }
  | {
    kind: "pointerMemberArrayAssign";
    name: string;
    field: string;
    index: SourceExpr;
    expr: SourceExpr;
  }
  | {
    kind: "pointerMemberAssign";
    name: string;
    field: string;
    expr: SourceExpr;
  }
  | {
    kind: "pointerMemberExprAssign";
    target: SourceExpr;
    field: string;
    expr: SourceExpr;
  }) & { isInitialization?: boolean };

export type SourceForInit =
  | SourceSimpleStmt
  | {
    kind: "localDecl";
    name: string;
    type: SourceType;
    isStatic?: boolean;
    initializer?: SourceInitializer;
    initStatements?: SourceSimpleStmt[];
  };

export type SourceExpr =
  | { kind: "const"; value: number }
  | { kind: "string"; value: string }
  | { kind: "ref"; name: string }
  | { kind: "memberArrayIndex"; name: string; field: string; index: SourceExpr }
  | { kind: "memberExprArrayIndex"; target: SourceExpr; field: string; index: SourceExpr }
  | { kind: "pointerMemberArrayIndex"; name: string; field: string; index: SourceExpr }
  | { kind: "pointerMemberExprArrayIndex"; target: SourceExpr; field: string; index: SourceExpr }
  | { kind: "memberAccess"; name: string; field: string }
  | { kind: "memberExprAccess"; target: SourceExpr; field: string }
  | { kind: "pointerMemberAccess"; name: string; field: string }
  | { kind: "pointerMemberExprAccess"; target: SourceExpr; field: string }
  | { kind: "addressOf"; name: string }
  | { kind: "addressOfExpr"; expr: SourceExpr }
  | { kind: "deref"; expr: SourceExpr }
  | { kind: "arrayIndex"; name: string; index: SourceExpr }
  | { kind: "arrayPointerElement"; pointer: SourceExpr; index: SourceExpr }
  | { kind: "call"; target: string; args: SourceExpr[] }
  | { kind: "indirectCall"; target: SourceExpr; args: SourceExpr[] }
  | { kind: "vaStart"; list: string; lastFixed: string }
  | { kind: "vaArg"; list: string; type: SourceType }
  | { kind: "vaEnd"; list: string }
  | { kind: "preIncDec"; name: string; op: "++" | "--" }
  | { kind: "postIncDec"; name: string; op: "++" | "--" }
  | { kind: "preArrayIncDec"; name: string; index: SourceExpr; op: "++" | "--" }
  | { kind: "postArrayIncDec"; name: string; index: SourceExpr; op: "++" | "--" }
  | { kind: "preDerefIncDec"; target: SourceExpr; op: "++" | "--" }
  | { kind: "postDerefIncDec"; target: SourceExpr; op: "++" | "--" }
  | { kind: "preMemberIncDec"; name: string; field: string; op: "++" | "--" }
  | { kind: "postMemberIncDec"; name: string; field: string; op: "++" | "--" }
  | { kind: "preMemberExprIncDec"; target: SourceExpr; field: string; op: "++" | "--" }
  | { kind: "postMemberExprIncDec"; target: SourceExpr; field: string; op: "++" | "--" }
  | { kind: "prePointerMemberIncDec"; name: string; field: string; op: "++" | "--" }
  | { kind: "postPointerMemberIncDec"; name: string; field: string; op: "++" | "--" }
  | { kind: "prePointerMemberExprIncDec"; target: SourceExpr; field: string; op: "++" | "--" }
  | { kind: "postPointerMemberExprIncDec"; target: SourceExpr; field: string; op: "++" | "--" }
  | { kind: "assign"; name: string; expr: SourceExpr }
  | { kind: "arrayAssign"; name: string; index: SourceExpr; expr: SourceExpr }
  | { kind: "memberAssign"; name: string; field: string; expr: SourceExpr }
  | { kind: "memberExprAssign"; target: SourceExpr; field: string; expr: SourceExpr }
  | { kind: "memberArrayAssign"; target: SourceExpr; field: string; index: SourceExpr; expr: SourceExpr }
  | { kind: "pointerMemberArrayAssign"; name: string; field: string; index: SourceExpr; expr: SourceExpr }
  | { kind: "pointerMemberAssign"; name: string; field: string; expr: SourceExpr }
  | { kind: "pointerMemberExprAssign"; target: SourceExpr; field: string; expr: SourceExpr }
  | { kind: "derefAssign"; target: SourceExpr; expr: SourceExpr }
  | { kind: "sizeofType"; type: SourceType }
  | { kind: "sizeofExpr"; expr: SourceExpr }
  | { kind: "cast"; type: SourceType; expr: SourceExpr }
  | { kind: "comma"; left: SourceExpr; right: SourceExpr }
  | { kind: "conditional"; condition: SourceExpr; thenExpr: SourceExpr; elseExpr: SourceExpr }
  | { kind: "binary"; left: SourceExpr; right: SourceExpr; op: BinaryOp };
