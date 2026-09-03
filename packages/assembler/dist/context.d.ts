import { Logger } from "@mz80/core";
import { AssemblerError } from "./errors";
import { MacroScope } from "./macro";
import { Node, NodeMacroDef } from "./node";
import { AsmPhase } from "./phaseManager";
import { RelocEntry } from "@mz80/core";
import { Token } from "./tokenizer";
export type AsmOptions = {
    /** 既定 false（大文字小文字は区別しない） */
    caseSensitive?: boolean;
    /** 既定 false（M80互換: マクロ優先解釈） */
    strictMacro?: boolean;
    /** .rel フォーマットバージョン */
    relVersion?: number;
    /** verbose ログ */
    verbose?: boolean;
    /** INCLUDE 単体テスト用の仮想ファイルキャッシュ */
    virtualFiles?: Map<string, string>;
    /** 既定 false（オーバーフロー範囲外を警告として扱う） */
    strictOverflow?: boolean;
    /** .sym 出力 */
    sym?: boolean;
    /** .lst 出力 */
    lst?: boolean;
    /** .smap 出力 */
    smap?: boolean;
    /** 既定のシンボル長 (.SYMLEN) */
    symLen?: number;
    /** INCLUDE 検索パス */
    includePaths?: string[];
    /** sjasm/8080系の互換解釈を有効化 */
    sjasmCompat?: boolean;
};
export interface SymbolEntry {
    value: number;
    sectionId: number;
    type: "LABEL" | "CONST" | "EXTERN";
    pos?: SourcePos;
    /** Context が注入する互換シンボル。REL export table には出力しない。 */
    internal?: boolean;
}
export interface RequesterInfo {
    op: string;
    phase: "assemble" | "link";
    pos: SourcePos;
}
export interface UnresolvedEntry {
    addr: number;
    symbol: string;
    size: 1 | 2 | 4;
    sectionId?: number;
    relative?: boolean;
    addend?: number;
    requester: RequesterInfo;
}
export interface AsmText {
    addr: number;
    data: number[];
    pos: SourcePos;
    sectionId?: number;
}
export interface LstEntry {
    addr: number;
    bytes: number[];
    pos: SourcePos;
    sectionId?: number;
    text?: string;
    kind?: "label" | "instr" | "pseudo";
}
export interface SectionState {
    id: number;
    name: string;
    kind: "TEXT" | "DATA" | "BSS" | "CUSTOM" | "ASEG";
    align: number;
    flags: number;
    lc: number;
    size: number;
    bytes: number[];
    org?: number;
    orgDefined?: boolean;
}
export type OpcodeDef = {
    mnemonic: string;
    encode: Function;
    bytes?: number[];
};
export interface OutputInfo {
    /** 出力フォーマットバージョン (1=旧, 2=multi-section) */
    relVersion: number;
    /** 出力された .rel のファイルパス */
    relPath?: string;
    /** 実ファイルサイズ */
    relSize?: number;
    /** .sym のパス */
    symPath?: string;
    /** .lst のパス */
    lstPath?: string;
    /** 生成日時 */
    generatedAt?: Date;
}
export interface SourceFrame {
    file: string;
    lines: string[];
    parent?: SourceFrame;
    lineBase?: number;
    macroName?: string;
}
export interface SourcePos {
    file: string;
    line: number;
    column?: number;
    parent?: SourcePos;
    phase: AsmPhase;
}
export interface AsmContext {
    /** 🆔 並列安全性のための一意識別子（ログ/出力トレース用） */
    id: string;
    loc: number;
    moduleName: string;
    inputFile: string;
    /** ✅ END 疑似命令に到達したか（以降のアセンブル停止） */
    endReached?: boolean;
    /** ✅ エントリポイント（END で指定された場合に設定） */
    entry?: number;
    symbols: Map<string, SymbolEntry>;
    stringDefines?: Map<string, string>;
    sjasmArrays?: Map<string, string[]>;
    unresolved: UnresolvedEntry[];
    externs: Set<string>;
    exportSymbols: Set<string>;
    modeWord32: boolean;
    modeSymLen: number;
    caseInsensitive: boolean;
    options: AsmOptions;
    texts: AsmText[];
    listing?: LstEntry[];
    relocs: RelocEntry[];
    output: OutputInfo;
    source?: string;
    tokens?: Token[];
    nodes?: Node[];
    phase: AsmPhase;
    logger?: Logger;
    verbose: boolean;
    currentPos: SourcePos;
    currentSection: number;
    sections: Map<number, SectionState>;
    includeStack: SourceFrame[];
    includeCache: Set<string>;
    sectionStack: string[];
    includePaths?: string[];
    macroTable: Map<string, NodeMacroDef>;
    macroTableStack: Map<string, NodeMacroDef>[];
    expansionStack: string[];
    localMacroStack?: MacroScope[];
    opcodes: Map<string, OpcodeDef>;
    errors: AssemblerError[];
    warnings: AssemblerError[];
    sourceLines?: string[];
    sourceMap: Map<string, string[]>;
    seenMacroSites?: Set<string>;
    didExpand?: boolean;
    loopStack: LoopFrame[];
    loopSeq: number;
    condStack: CondFrame[];
    listingControl: {
        enabled: boolean;
        title?: string;
        page?: number;
    };
    currentGlobalLabel?: string;
}
/** Map/Set/Array を deep に複製しつつ shallow object は上書きするマージ */
export declare function deepMerge<T extends Record<string, any>>(target: T, src: Partial<T>): T;
/**
 * 🧩 createAsmContext()
 * ステートレスかつ並列安全なコンテキストを毎回新規生成する。
 * - Map/Set/Array は各インスタンス固有で初期化（共有禁止）
 * - opcodes は getZ80OpcodeTable() を都度生成
 * - logger は [CTX#id] でプレフィクス付与
 */
export declare function createAsmContext(overrides?: Partial<AsmContext>): AsmContext;
/**
 * @deprecated P2-K 以降は `createAsmContext()` を使用してください。
 * 互換維持のため残置。内部で `createAsmContext()` を呼びます。
 */
export declare function createContext(overrides?: Partial<AsmContext>): AsmContext;
/**
 * シンボル登録ユーティリティ
 * - 現在セクションを自動付与
 * - 再定義時は警告を発行
 */
export declare function defineSymbol(ctx: AsmContext, name: string, value: number, type?: SymbolEntry["type"], pos?: SourcePos): void;
export declare function makeSourcePos(frame: SourceFrame, line: number, phase: AsmPhase, column?: number): SourcePos;
export declare function cloneSourcePos(pos: SourcePos): SourcePos;
export declare function createSourcePos(file: string, line: number, column: number, phase: AsmPhase, parent?: SourcePos): SourcePos;
/** 共通のキー正規化（caseSensitive が false のとき大文字化） */
export declare const canon: (s: string, ctx: AsmContext) => string;
/** Resolve dot-local labels against current global label. */
export declare function resolveLocalLabel(ctx: AsmContext, name: string): string;
export type LoopKind = "REPT" | "IRP" | "IRPC" | "WHILE" | "ENDW" | "ENDM";
/**
 * 各ループフレームのメタ情報
 */
export interface LoopFrameMeta {
    file: string;
    line: number;
    level: number;
    exprText?: string;
}
/**
 * ループ展開状態を表すコンテキストフレーム
 * - REPT/WHILE/IRP/IRPC 全対応
 */
export interface LoopFrame {
    id: number;
    kind: LoopKind;
    index: number;
    maxIndex: number;
    total?: number;
    parent?: LoopFrame;
    locals: Map<string, any>;
    meta: LoopFrameMeta;
    breakFlag?: boolean;
    continueFlag?: boolean;
}
export interface CondFrame {
    parentActive: boolean;
    active: boolean;
    satisfied: boolean;
    elseSeen?: boolean;
}
/**
 * LoopFrame スタック操作用のヘルパ
 */
export interface LoopContext {
    loopStack: LoopFrame[];
    loopSeq: number;
}
/**
 * 新しい LoopFrame を push する
 */
export declare function pushLoop(ctx: AsmContext, kind: LoopKind, meta: LoopFrameMeta, total?: number): LoopFrame;
/**
 * LoopFrame を pop する
 */
export declare function popLoop(ctx: AsmContext): LoopFrame | undefined;
/**
 * 現在の最内層 LoopFrame を取得
 */
export declare function currentLoop(ctx: AsmContext): LoopFrame | undefined;
/**
 * 外層レベル指定で LoopFrame を取得 (0=最内層)
 */
export declare function getLoop(ctx: AsmContext, level: number): LoopFrame | undefined;
/**
 * \# / \##n / \##MAX を整数リテラルに解決する
 */
export declare function resolveCounterToken(str: string, ctx: AsmContext): string;
/**
 * 現在の loopStack を LST トレース用にフォーマットする
 */
export declare function traceLoopStack(ctx: AsmContext): string;
/**
 * locals 変数を検索 (IRP/IRPC)
 */
export declare function getLocalValue(ctx: AsmContext, name: string): any | undefined;
declare module "./context" {
    interface AsmContext {
    }
}
export declare function attachLoopContext(ctx: AsmContext): void;
