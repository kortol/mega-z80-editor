// packages\cli\src\assembler\context.ts
import { Logger } from "../logger";
import { getZ80OpcodeTable } from "./encoder";
import { AssemblerError, AssemblerErrorCode, makeError, makeWarning } from "./errors";
import { MacroScope } from "./macro";
import { Node, NodeMacroDef } from "./parser";
import { AsmPhase } from "./phaseManager";
import { RelocEntry } from "./rel/types";
import { Token } from "./tokenizer";

export type AsmOptions = {
  caseSensitive?: boolean;   // 既定 false
  strictMacro?: boolean;     // 既定 false（M80互換: マクロ優先）
  // ...他既存
  relVersion?: number;       // Relファイルバージョン
  verbose?: boolean;         // verboseフラグ
  /** 🔹 仮想ファイルキャッシュ（INCLUDE単体テスト用） */
  virtualFiles?: Map<string, string>;
};

// 定数 or ラベル or 未知を統一的に表す型(だけど先送り中)
export interface SymbolEntry {
  /** シンボルの数値値（絶対 or 相対） */
  value: number;
  /** 属するセクションID（0=.text, 1=.data, 2=.bss, ...） */
  sectionId: number;
  /** シンボル種別 */
  type: "LABEL" | "CONST" | "EXTERN";
}

export interface RequesterInfo {
  op: string;
  phase: "assemble" | "link";
  pos: SourcePos;
}

export interface UnresolvedEntry {
  addr: number; // アドレス
  symbol: string; // 未解決シンボル名
  size: 1 | 2 | 4; // バイト数 1 or 2（現状Rは常に16bit適用だが、addendの保持が必要）
  relative?: boolean; // JR/DJNZ など相対ジャンプなら true
  addend?: number; // ← 追加：式中の ±n を持たせる
  requester: RequesterInfo; // 
}

export interface AsmText {
  addr: number;
  data: number[];
  pos: SourcePos;
  sectionId?: number; // セクションID（0=TEXT, 1=DATA, 2=BSS, 3以降=CUSTOM）
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
  /** 実際のファイルサイズ (byte) */
  relSize?: number;
  /** 対応する .sym のパス */
  symPath?: string;
  /** 対応する .lst のパス */
  lstPath?: string;
  /** 生成日時 */
  generatedAt?: Date;
}

export interface SourceFrame {
  file: string;             // 現在のファイルパス（絶対パス推奨）
  lines: string[];          // ファイル内容（split済み）
  parent?: SourceFrame;     // 呼び出し元 (INCLUDE / MACRO)
  lineBase?: number;        // 呼び出し位置（親側の行番号）
  macroName?: string;       // マクロ展開時のみ使用
}

export interface SourcePos {
  file: string;           // 実際に記述されているファイル名
  line: number;           // 行番号
  column?: number;        // 列番号
  parent?: SourcePos;     // include元 / マクロ呼び出し元の位置
  phase: AsmPhase;        // フェーズ
}

export interface AsmContext {
  loc: number; // 現在のアセンブル位置 (アドレスカウンタ: ORG, DB/DW などで進む)
  moduleName: string; // モジュール名 (RELファイルの H レコード用、デフォルト "NONAME")
  inputFile: string;
  symbols: Map<string, SymbolEntry>; // 定義済みシンボル表 (EQU/ラベルで登録される)
  unresolved: UnresolvedEntry[]; // 未解決シンボル参照リスト (外部シンボルや後方参照)
  modeWord32: boolean; // `.WORD32` モードが有効なら true (通常16bit, 拡張32bit用)
  modeSymLen: number; // シンボル長の基準 (通常 6、`.SYMLEN` 疑似命令で変更可能)
  caseInsensitive: boolean; // シンボル名の大文字小文字を区別しない場合 true
  texts: AsmText[]; // 出力済みテキストレコードのリスト (アドレス＋バイト列)
  endReached?: boolean; // END 疑似命令に到達したかどうか (trueなら以降アセンブル停止)
  maxSymbolLen?: number; // 許可されるシンボル名の最大長 (未設定なら無制限扱い)
  entry?: number; // エントリポイント (END 疑似命令で指定された場合に設定)
  externs: Set<string>; // EXTERN 宣言された外部シンボル一覧 (リンカで解決する対象)
  options: AsmOptions; // アセンブル時オプション
  sourceLines?: string[]; // 元ソース行を保持（.lst生成用）
  sections: Map<number, SectionState>; // セクションIDをキーとしたセクション状態のマップ
  output: OutputInfo;
  source?: string; // ソース全文
  tokens?: Token[]; // トークン解析結果
  nodes?: Node[]; // 構文解析結果
  phase: AsmPhase; // フェーズ
  logger?: Logger; // ロガー
  verbose: boolean;

  relocs: RelocEntry[]; // ✅ 再配置エントリ (Rレコード用)

  // --- 現在状態 ---

  currentPos: SourcePos;
  currentSection: number; // 現在のセクションID（0がTEXT、1がDATA、2がBSS、3以降がCUSTOM）

  // --- ネスト管理 ---
  includeStack: SourceFrame[];    // INCLUDE呼出し階層
  includeCache: Set<string>;      // 重複防止（#pragma once 相当）

  // --- セクション管理 ---
  sectionStack: string[];         // INCLUDE中のSECTION復帰用

  // --- マクロ管理 ---
  macroTable: Map<string, NodeMacroDef>;
  macroTableStack: Map<string, NodeMacroDef>[];
  expansionStack: string[]; // マクロ展開スタック（循環検知）
  localMacroStack?: MacroScope[]; // ✨ ローカルスコープ管理スタック

  // --- 命令定義テーブル ---
  opcodes: Map<string, OpcodeDef>,

  // --- エラー／診断 ---
  errors: AssemblerError[]; // エラーメッセージのリスト (コンパイル中に収集)
  warnings: AssemblerError[]; // 警告メッセージの収集 (範囲外定数の切り捨てなど)

  sourceMap: Map<string, string[]>; // ソースキャッシュ

  /** フェーズを跨いでも同一マクロ定義サイトを一意識別するためのキャッシュ */
  seenMacroSites?: Set<string>;

  /** マクロ展開済みフラグ（二重展開防止用） */
  didExpand?: boolean;
}


/**
 * AsmContext を生成するファクトリ関数。
 * オプション指定した項目のみ上書き可能。
 */
export function createContext(overrides: Partial<AsmContext> = {}): AsmContext {
  const base = new Map<string, NodeMacroDef>();
  const defaults: AsmContext = {
    loc: 0,
    moduleName: "NONAME",
    symbols: new Map<string, SymbolEntry>(),
    unresolved: [],
    modeWord32: false,
    modeSymLen: 6,
    caseInsensitive: true,
    texts: [],
    errors: [],
    externs: new Set<string>(),
    warnings: [],
    sourceLines: [],
    currentSection: 0,
    sections: new Map<number, SectionState>(),
    output: {
      relVersion: 1,
    },
    phase: "tokenize",
    verbose: false,
    inputFile: "",
    relocs: [],
    currentPos: { file: "", line: 0 } as SourcePos,
    includeStack: [],
    includeCache: new Set<string>(),
    sectionStack: [],
    macroTable: base,
    macroTableStack: [],
    expansionStack: [],
    opcodes: getZ80OpcodeTable(),
    sourceMap: new Map<string, string[]>(),
    options: {},
    seenMacroSites: new Set<string>(),
    localMacroStack: [],
  };
  return { ...defaults, ...overrides };
}

/**
 * シンボル登録用ユーティリティ関数
 * - 現在セクションを自動的に付与
 * - 既存登録がある場合は上書き警告を発行
 */
export function defineSymbol(
  ctx: AsmContext,
  name: string,
  value: number,
  type: SymbolEntry["type"] = "LABEL"
) {
  const sectionId = ctx.currentSection;
  const existing = ctx.symbols.get(name);

  if (existing) {
    ctx.warnings.push(
      makeWarning(
        AssemblerErrorCode.RedefSymbol,
        `Symbol redefined: ${name} (old=${existing.value.toString(
          16
        )}, new=${value.toString(16)})`,
        { pos: ctx.currentPos },
      )
    );
  }

  ctx.symbols.set(name, { value, sectionId, type });
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
    parent: pos?.parent ? cloneSourcePos(pos.parent) : undefined, // 再帰的コピー
    phase: pos.phase ?? "",
  };
}

export function createSourcePos(file: string, line: number, column: number, phase: AsmPhase, parent?: SourcePos): SourcePos {
  return { file, line, column, parent, phase };
}

// 共通のキー正規化
export const canon = (s: string, ctx: AsmContext) =>
  ctx.options.caseSensitive ? s : s.toUpperCase();

