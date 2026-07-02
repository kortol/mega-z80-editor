export type ScalarType = "char" | "int";

export type SourceType = {
  kind: "scalar";
  name: ScalarType;
};

export type SourceProgram = {
  kind: "program";
  functions: SourceFunction[];
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

export type CompareOp = "==" | "!=" | ">" | "<" | ">=" | "<=";
export type AdditiveOp = "+" | "-";
export type BinaryOp = CompareOp | AdditiveOp;

export type SourceStmt =
  | {
    kind: "return";
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
    kind: "assign";
    name: string;
    expr: SourceExpr;
  };

export type SourceExpr =
  | { kind: "const"; value: number }
  | { kind: "ref"; name: string }
  | { kind: "call"; target: string; args: SourceExpr[] }
  | { kind: "binary"; left: SourceExpr; right: SourceExpr; op: BinaryOp };
