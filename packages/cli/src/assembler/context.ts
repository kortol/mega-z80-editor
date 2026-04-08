// packages/cli/src/assembler/context.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createLogger, Logger } from "../logger";
import { getZ80OpcodeTable } from "./encoder";
import { AssemblerError, AssemblerErrorCode, makeError, makeWarning } from "./errors";
import { MacroScope } from "./macro";
import { Node, NodeMacroDef } from "./node";
import { AsmPhase } from "./phaseManager";
import { RelocEntry } from "./rel/types";
import { Token } from "./tokenizer";

/* =====================================================================================
 * AsmOptions / 型定義
 * ===================================================================================== */

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
  /** 既定のシンボル長 (.SYMLEN) */
  symLen?: number;
  /** INCLUDE 検索パス */
  includePaths?: string[];
};

// 定数 or ラベル or 未知を統一的に表す型(だけど先送り中)
export interface SymbolEntry {
  value: number;                  // シンボル数値（絶対 or 相対）
  sectionId: number;              // セクションID（0=.text, 1=.data, 2=.bss, ...）
  type: "LABEL" | "CONST" | "EXTERN";
  pos?: SourcePos;                // 定義元ソース位置
}

export interface RequesterInfo {
  op: string;
  phase: "assemble" | "link";
  pos: SourcePos;
}

export interface UnresolvedEntry {
  addr: number;                  // 参照アドレス
  symbol: string;                // 未解決シンボル名
  size: 1 | 2 | 4;               // バイト幅
  relative?: boolean;            // JR/DJNZ 相対なら true
  addend?: number;               // 式中の ±n
  requester: RequesterInfo;
}

export interface AsmText {
  addr: number;
  data: number[];
  pos: SourcePos;
  sectionId?: number;            // 0=TEXT, 1=DATA, 2=BSS, 3+=CUSTOM
}

export interface LstEntry {
  addr: number;
  bytes: number[];
  pos: SourcePos;
  sectionId?: number;
  text?: string;
  kind?: "label" | "instr" | "pseudo";
}

// --- セクション管理 ---
export interface SectionState {
  id: number;
  name: string;
  kind: "TEXT" | "DATA" | "BSS" | "CUSTOM";
  align: number;
  flags: number;
  lc: number;
  size: number;
  bytes: number[];
}

// 命令定義テーブル型（省略でも可）
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
  file: string;                  // 現在のファイルパス（絶対推奨）
  lines: string[];               // ファイル内容（split済み）
  parent?: SourceFrame;          // 呼び出し元 (INCLUDE / MACRO)
  lineBase?: number;             // 呼び出し位置（親側の行番号）
  macroName?: string;            // マクロ展開時のみ
}

export interface SourcePos {
  file: string;                  // 実ファイル名
  line: number;                  // 行番号
  column?: number;               // 列番号
  parent?: SourcePos;            // include元/マクロ呼出元
  phase: AsmPhase;               // フェーズ
}

/* =====================================================================================
 * AsmContext 本体
 * ===================================================================================== */

export interface AsmContext {
  /** 🆔 並列安全性のための一意識別子（ログ/出力トレース用） */
  id: string;

  // --- アセンブル状態 ---
  loc: number;                   // 現在のアドレスカウンタ
  moduleName: string;            // RELのHレコード用（デフォルト "NONAME"）
  inputFile: string;

  /** ✅ END 疑似命令に到達したか（以降のアセンブル停止） */
  endReached?: boolean;

  /** ✅ エントリポイント（END で指定された場合に設定） */
  entry?: number;

  // --- シンボル/未解決 ---
  symbols: Map<string, SymbolEntry>;
  unresolved: UnresolvedEntry[];
  externs: Set<string>;
  exportSymbols: Set<string>;

  // --- モード/オプション ---
  modeWord32: boolean;           // `.WORD32` 拡張（通常false）
  modeSymLen: number;            // `.SYMLEN` 基準（通常6）
  caseInsensitive: boolean;      // 大文字小文字を区別しない場合 true
  options: AsmOptions;

  // --- 出力/中間 ---
  texts: AsmText[];
  listing?: LstEntry[];
  relocs: RelocEntry[];
  output: OutputInfo;

  // --- ソース/解析 ---
  source?: string;               // ソース全文
  tokens?: Token[];              // トークン解析結果
  nodes?: Node[];                // 構文解析結果

  // --- フェーズ/ログ ---
  phase: AsmPhase;               // 現在フェーズ
  logger?: Logger;               // ロガー（[CTX#id] 付与ラップ）
  verbose: boolean;

  // --- 位置/セクション ---
  currentPos: SourcePos;
  currentSection: number;        // 現在セクションID
  sections: Map<number, SectionState>;

  // --- ネスト/INCLUDE ---
  includeStack: SourceFrame[];   // INCLUDE 呼出し階層
  includeCache: Set<string>;     // 重複防止（#pragma once 相当）
  sectionStack: string[];        // INCLUDE中のSECTION復帰用
  includePaths?: string[];       // INCLUDE 検索パス

  // --- マクロ管理 ---
  macroTable: Map<string, NodeMacroDef>;
  macroTableStack: Map<string, NodeMacroDef>[];
  expansionStack: string[];      // 循環検知
  localMacroStack?: MacroScope[];// ローカルスコープ

  // --- 命令定義 ---
  opcodes: Map<string, OpcodeDef>;

  // --- 診断 ---
  errors: AssemblerError[];      // エラー収集
  warnings: AssemblerError[];    // 警告収集

  // --- キャッシュ ---
  sourceLines?: string[];        // .lst 生成用
  sourceMap: Map<string, string[]>;
  seenMacroSites?: Set<string>;  // マクロ定義サイト一意識別
  didExpand?: boolean;           // 二重展開防止フラグ

  // --- ループマクロ ---
  loopStack: LoopFrame[];
  loopSeq: number;

  // --- 条件アセンブル ---
  condStack: CondFrame[];
  listingControl: {
    enabled: boolean;
    title?: string;
    page?: number;
  };
  // --- local label resolution ---
  currentGlobalLabel?: string;
}

/* =====================================================================================
 * ユーティリティ
 * ===================================================================================== */

/** Map/Set/Array を deep に複製しつつ shallow object は上書きするマージ */
export function deepMerge<T extends Record<string, any>>(target: T, src: Partial<T>): T {
  const out: any = { ...target };

  for (const [k, v] of Object.entries(src ?? {})) {
    if (v === undefined || v === null) continue;

    if (v instanceof Map) {
      // ✅ Mapコピー（valueも再帰コピー）
      out[k] = new Map(Array.from(v.entries(), ([key, val]) => [key, deepClone(val)]));
    } else if (v instanceof Set) {
      // ✅ Setコピー
      out[k] = new Set(v);
    } else if (Array.isArray(v)) {
      // ✅ Arrayコピー（中身を再帰）
      out[k] = v.map((i) => deepClone(i));
    } else if (typeof v === "object") {
      // ✅ Objectネスト対応
      out[k] = deepMerge((target as any)[k] ?? {}, v);
    } else {
      out[k] = v;
    }
  }

  return out as T;
}

/** 内部で使う単純なdeep cloneユーティリティ */
function deepClone(value: any): any {
  if (value instanceof Map)
    return new Map(Array.from(value.entries(), ([k, v]) => [k, deepClone(v)]));
  if (value instanceof Set) return new Set(value);
  if (Array.isArray(value)) return value.map((v) => deepClone(v));
  if (value && typeof value === "object") return { ...value };
  return value;
}

/** 一意ID生成（Node/Edge どちらでも動く簡易版） */
function newCtxId(): string {
  const rnd =
    (globalThis as any).crypto?.randomUUID?.() ??
    `CTX${Date.now().toString(36)}${Math.random().toString(16).slice(2, 6)}`;
  return rnd;
}

/* =====================================================================================
 * AsmContext ファクトリ（新定義）
 * ===================================================================================== */

/**
 * 🧩 createAsmContext()
 * ステートレスかつ並列安全なコンテキストを毎回新規生成する。
 * - Map/Set/Array は各インスタンス固有で初期化（共有禁止）
 * - opcodes は getZ80OpcodeTable() を都度生成
 * - logger は [CTX#id] でプレフィクス付与
 */
export function createAsmContext(overrides: Partial<AsmContext> = {}): AsmContext {
  const id = overrides.id ?? newCtxId();

  const logLevel: "quiet" | "normal" | "verbose" =
    overrides.options?.verbose ? "verbose" : "normal";

  const logger = createLogger(logLevel, id);

  // デフォルト構成（共有のない fresh なインスタンス）
  const defaults: AsmContext = {
    id,
    loc: 0,
    moduleName: "NONAME",
    inputFile: "",
    endReached: false,
    entry: undefined,
    symbols: new Map<string, SymbolEntry>(),
    unresolved: [],
    externs: new Set<string>(),
    exportSymbols: new Set<string>(),
    modeWord32: false,
    modeSymLen: 32,
    caseInsensitive: true,
    options: { caseSensitive: false, strictMacro: false, relVersion: 2, verbose: false },
    texts: [],
    relocs: [],
    output: { relVersion: 2 },
    sourceLines: [],
    sections: new Map<number, SectionState>(),
    currentSection: 0,
    currentPos: { file: "", line: 0, phase: "tokenize" as AsmPhase },

    includeStack: [],
    includeCache: new Set<string>(),
    sectionStack: [],
    includePaths: [],

    macroTable: new Map<string, NodeMacroDef>(),
    macroTableStack: [],
    expansionStack: [],
    localMacroStack: [],
    seenMacroSites: new Set<string>(),
    didExpand: false,

    opcodes: getZ80OpcodeTable(),

    phase: "tokenize" as AsmPhase,
    verbose: false,
    logger: undefined, // 後段で prefix 付きに差し替え

    errors: [],
    warnings: [],

    sourceMap: new Map<string, string[]>(),

    loopSeq: 0,
    loopStack: [],

    condStack: [],
    listingControl: {
      enabled: true,
    },
    currentGlobalLabel: undefined,
  };

  // deepMerge で overrides を取り込み（Map/Set/Array を複製して採用）
  const merged = deepMerge(defaults, overrides);

  if (merged.options?.symLen != null) {
    merged.modeSymLen = merged.options.symLen;
  }
  if (merged.options?.includePaths) {
    merged.includePaths = [...merged.options.includePaths];
  }

  // logger の最終確定（ctx.id でプレフィクス）
  merged.logger = overrides.logger ?? logger;
  merged.verbose = merged.options?.verbose ?? merged.verbose ?? false;

  if (merged.logger && typeof (merged.logger as any).info === "function") {
    (merged.logger as any).info("AsmContext initialized.");
  }
  return merged;
}

/* =====================================================================================
 * 既存互換（Deprecated）：createContext
 * ===================================================================================== */

/**
 * @deprecated P2-K 以降は `createAsmContext()` を使用してください。
 * 互換維持のため残置。内部で `createAsmContext()` を呼びます。
 */
export function createContext(overrides: Partial<AsmContext> = {}): AsmContext {
  const ctx = createAsmContext(overrides);
  // 旧呼び出し箇所で気づけるよう、verbose 時のみ注意喚起
  if (ctx.verbose) ctx.logger?.warn("createContext() is deprecated. Use createAsmContext().");
  return ctx;
}

/* =====================================================================================
 * 既存ユーティリティ（互換維持）
 * ===================================================================================== */

/**
 * シンボル登録ユーティリティ
 * - 現在セクションを自動付与
 * - 再定義時は警告を発行
 */
export function defineSymbol(
  ctx: AsmContext,
  name: string,
  value: number,
  type: SymbolEntry["type"] = "LABEL",
  pos?: SourcePos,
) {
  const resolved = canon(resolveLocalLabel(ctx, name), ctx);
  const sectionId = ctx.currentSection;
  const existing = ctx.symbols.get(resolved);
  const defPos = pos ?? ctx.currentPos;

  if (existing) {
    ctx.warnings.push(
      makeWarning(
        AssemblerErrorCode.RedefSymbol,
        `Symbol redefined: ${resolved} (old=${existing.value.toString(16)}, new=${value.toString(16)})`,
        { pos: defPos },
      )
    );
  }

  ctx.symbols.set(resolved, { value, sectionId, type, pos: defPos });
}

export function makeSourcePos(
  frame: SourceFrame,
  line: number,
  phase: AsmPhase,
  column?: number,
): SourcePos {
  return {
    file: frame.file,
    line,
    column,
    parent: frame.parent
      ? makeSourcePos(frame.parent, frame.lineBase ?? 0, phase)
      : undefined,
    phase,
  };
}

export function cloneSourcePos(pos: SourcePos): SourcePos {
  return {
    file: pos?.file ?? "",
    line: pos?.line ?? 0,
    column: pos?.column ?? 0,
    parent: pos?.parent ? cloneSourcePos(pos.parent) : undefined,
    phase: (pos.phase ?? "") as AsmPhase,
  };
}

export function createSourcePos(
  file: string,
  line: number,
  column: number,
  phase: AsmPhase,
  parent?: SourcePos
): SourcePos {
  return { file, line, column, parent, phase };
}

/** 共通のキー正規化（caseSensitive が false のとき大文字化） */
export const canon = (s: string, ctx: AsmContext) =>
  ctx.options.caseSensitive ? s : s.toUpperCase();

/** Resolve dot-local labels against current global label. */
export function resolveLocalLabel(ctx: AsmContext, name: string): string {
  if (!name?.startsWith(".")) return name;
  if (!ctx.currentGlobalLabel) return name;
  return `${ctx.currentGlobalLabel}${name}`;
}


// =====================================================================================
// 🧩 LoopFrame モデル (P3-B 拡張)
// =====================================================================================

export type LoopKind = "REPT" | "IRP" | "IRPC" | "WHILE" | "ENDW" | "ENDM";

/**
 * 各ループフレームのメタ情報
 */
export interface LoopFrameMeta {
  file: string;
  line: number;
  level: number;      // ネスト階層（1=最外層）
  exprText?: string;  // WHILEなど条件式テキスト
}

/**
 * ループ展開状態を表すコンテキストフレーム
 * - REPT/WHILE/IRP/IRPC 全対応
 */
export interface LoopFrame {
  id: number;                     // 一意ID
  kind: LoopKind;                 // ループ種別
  index: number;                  // 現在の反復インデックス（0-based）
  maxIndex: number;               // ループの最大インデックス値（count-1）
  total?: number;                 // 総回数（REPT系）
  parent?: LoopFrame;             // 外側フレーム
  locals: Map<string, any>;       // IRP/IRPC ローカル変数束縛
  meta: LoopFrameMeta;            // 位置・式情報など
  breakFlag?: boolean;            // BREAK/EXITM制御用
  continueFlag?: boolean;         // CONTINUE制御用
}

// =====================================================================================
// 🧩 Conditional Assemble
// =====================================================================================

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
export function pushLoop(
  ctx: AsmContext,
  kind: LoopKind,
  meta: LoopFrameMeta,
  total?: number
): LoopFrame {
  const level = (ctx.loopStack?.length ?? 0) + 1;
  const frame: LoopFrame = {
    id: ++ctx.loopSeq,
    kind,
    index: 0,
    maxIndex: (total ?? 1) - 1,
    total,
    parent: ctx.loopStack.at(-1),
    locals: new Map(),
    meta: { ...meta, level },
  };

  if (!ctx.loopStack) ctx.loopStack = [];
  ctx.loopStack.push(frame);
  return frame;
}

/**
 * LoopFrame を pop する
 */
export function popLoop(ctx: AsmContext): LoopFrame | undefined {
  if (!ctx.loopStack?.length) return undefined;
  return ctx.loopStack.pop();
}

/**
 * 現在の最内層 LoopFrame を取得
 */
export function currentLoop(ctx: AsmContext): LoopFrame | undefined {
  return ctx.loopStack?.at(-1);
}

/**
 * 外層レベル指定で LoopFrame を取得 (0=最内層)
 */
export function getLoop(ctx: AsmContext, level: number): LoopFrame | undefined {
  if (!ctx.loopStack?.length) return undefined;
  return ctx.loopStack.at(-(level + 1));
}

/**
 * \# / \##n / \##MAX を整数リテラルに解決する
 */
export function resolveCounterToken(str: string, ctx: AsmContext): string {
  const m = str.match(/^\\#(MAX|[0-9]*)$/) ?? str.match(/^@#(MAX|[0-9]*)$/);
  if (!m) return str;

  const { loopStack } = ctx;
  if (!loopStack?.length) {
    throw makeError(
      AssemblerErrorCode.LoopCounterOutside,
      "Loop counter used outside any loop."
    );
  }

  const level =
    m[1] === "MAX" ? loopStack.length - 1 : Number(m[1] || 0);
  const frame = loopStack.at(-(level + 1));
  if (!frame) {
    throw makeError(
      AssemblerErrorCode.LoopCounterOutOfScope,
      `No outer loop level #${level} to reference.`
    );
  }

  return String(frame.index);
}

/**
 * 現在の loopStack を LST トレース用にフォーマットする
 */
export function traceLoopStack(ctx: AsmContext): string {
  if (!ctx.loopStack?.length) return "";
  return ctx.loopStack
    .map(
      (f) =>
        `[${f.kind.toUpperCase()} i=${f.index}/${f.total ?? "?"
        } lvl=${f.meta.level} id=${f.id}]`
    )
    .join(" > ");
}

/**
 * locals 変数を検索 (IRP/IRPC)
 */
export function getLocalValue(ctx: AsmContext, name: string): any | undefined {
  const frame = ctx.loopStack?.at(-1);
  return frame?.locals?.get(name);
}

// =====================================================================================
// AsmContext への統合 (拡張プロパティ)
// =====================================================================================

declare module "./context" {
  interface AsmContext {
  }
}

// createAsmContext() に初期値を追加するため、末尾で再定義補助
export function attachLoopContext(ctx: AsmContext) {
  if (!ctx.loopStack) ctx.loopStack = [];
  if (typeof ctx.loopSeq !== "number") ctx.loopSeq = 0;
}
