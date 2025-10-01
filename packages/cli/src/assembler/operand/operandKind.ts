export enum OperandKind {
  REG8, REG8X,
  REG16, REG16X,
  REG_AF, REG_AFd, REG_IR,
  IMM, EXPR,
  MEM, REG_IND, IDX,
  FLAG,
  UNKNOWN,
}
