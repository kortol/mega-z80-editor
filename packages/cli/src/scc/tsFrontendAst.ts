export type ScalarType = "char" | "int";
export type AggregateKind = "struct" | "union";

export type AggregateTypeRef = {
  kind: "aggregate";
  aggregateKind: AggregateKind;
  name: string;
};

export type PointerPointee = ScalarType | AggregateTypeRef;

export type SourceType =
  | {
    kind: "scalar";
    name: ScalarType;
  }
  | AggregateTypeRef
  | {
    kind: "pointer";
    pointee: PointerPointee;
  }
  | {
    kind: "array";
    elementType: "char";
    length?: number;
  };

export type SourceProgram = {
  kind: "program";
  aggregates: SourceAggregateDef[];
  functions: SourceFunction[];
};

export type SourceAggregateField = {
  kind: "field";
  name: string;
  type: Extract<SourceType, { kind: "scalar" }>;
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
  returnType: SourceType;
  params: SourceParam[];
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
  initializer?: SourceExpr;
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

export type SourceStmt =
  | {
    kind: "return";
    expr: SourceExpr;
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
  };

export type SourceSimpleStmt =
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
  };

export type SourceForInit =
  | SourceSimpleStmt
  | {
    kind: "localDecl";
    name: string;
    type: SourceType;
    initializer?: SourceExpr;
  };

export type SourceExpr =
  | { kind: "const"; value: number }
  | { kind: "string"; value: string }
  | { kind: "ref"; name: string }
  | { kind: "memberAccess"; name: string; field: string }
  | { kind: "memberExprAccess"; target: SourceExpr; field: string }
  | { kind: "pointerMemberAccess"; name: string; field: string }
  | { kind: "pointerMemberExprAccess"; target: SourceExpr; field: string }
  | { kind: "addressOf"; name: string }
  | { kind: "addressOfExpr"; expr: SourceExpr }
  | { kind: "deref"; expr: SourceExpr }
  | { kind: "arrayIndex"; name: string; index: SourceExpr }
  | { kind: "call"; target: string; args: SourceExpr[] }
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
  | { kind: "pointerMemberAssign"; name: string; field: string; expr: SourceExpr }
  | { kind: "pointerMemberExprAssign"; target: SourceExpr; field: string; expr: SourceExpr }
  | { kind: "derefAssign"; target: SourceExpr; expr: SourceExpr }
  | { kind: "sizeofType"; type: SourceType }
  | { kind: "sizeofExpr"; expr: SourceExpr }
  | { kind: "comma"; left: SourceExpr; right: SourceExpr }
  | { kind: "conditional"; condition: SourceExpr; thenExpr: SourceExpr; elseExpr: SourceExpr }
  | { kind: "binary"; left: SourceExpr; right: SourceExpr; op: BinaryOp };
