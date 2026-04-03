import type { LoopKind, SourcePos } from "./context";
import type { Token } from "./tokenizer";

export type Node =
  NodeInstr |
  NodePseudo |
  NodeLabel |
  NodeMacroDef |
  NodeMacroInvoke |
  NodeLoopBase |
  NodeEmpty;

export interface NodeInstr {
  kind: "instr";
  op: string;
  args: string[];
  pos: SourcePos;
}

export interface PseudoArg {
  key?: string;
  value: string;
}

export interface NodePseudo {
  kind: "pseudo";
  op: string;
  args: PseudoArg[];
  pos: SourcePos;
}

export interface NodeLabel {
  kind: "label";
  name: string;
  pos: SourcePos;
}

export interface NodeMacroDef {
  kind: "macroDef";
  name: string;
  params: string[];
  bodyTokens: Token[];
  startPos: SourcePos;
  endPos: SourcePos;
  pos: SourcePos;
  isLocal: boolean;
}

export interface NodeMacroInvoke {
  kind: "macroInvoke";
  name: string;
  args: string[];
  pos: SourcePos;
}

export interface NodeEmpty {
  kind: "empty";
  pos: SourcePos;
}

/**
 * NodeLoopBase: REPT / WHILE / IRP / IRPC を共通で表すノード型
 */
export interface NodeLoopBase {
  kind: "macroLoop";
  op: LoopKind;
  bodyTokens: any[];
  pos: any;
  countExpr?: any;
  condExpr?: any;
  args?: any[];
  strLiteral?: string;
  symbolName?: string;
}

