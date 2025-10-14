// packages\cli\src\assembler\context.ts
import { AssemblerError } from "./errors";
import { Node } from "./parser";
import { Token } from "./tokenizer";

// 定数 or ラベル or 未知を統一的に表す型(だけど先送り中)
export type SymbolEntry = number;

export interface UnresolvedEntry {
  addr: number; // アドレス
  symbol: string; // 未解決シンボル名
  size: number; // バイト数 1 or 2（現状Rは常に16bit適用だが、addendの保持が必要）
  relative?: boolean; // JR/DJNZ など相対ジャンプなら true
  addend?: number; // ← 追加：式中の ±n を持たせる
}

export interface AsmText {
  addr: number;
  data: number[];
  line?: number; // 元ソース行番号（1-based）
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

export interface AsmContext {
  loc: number; // 現在のアセンブル位置 (アドレスカウンタ: ORG, DB/DW などで進む)
  moduleName: string; // モジュール名 (RELファイルの H レコード用、デフォルト "NONAME")
  symbols: Map<string, SymbolEntry>; // 定義済みシンボル表 (EQU/ラベルで登録される)
  unresolved: UnresolvedEntry[]; // 未解決シンボル参照リスト (外部シンボルや後方参照)
  modeWord32: boolean; // `.WORD32` モードが有効なら true (通常16bit, 拡張32bit用)
  modeSymLen: number; // シンボル長の基準 (通常 6、`.SYMLEN` 疑似命令で変更可能)
  caseInsensitive: boolean; // シンボル名の大文字小文字を区別しない場合 true
  texts: AsmText[]; // 出力済みテキストレコードのリスト (アドレス＋バイト列)
  endReached?: boolean; // END 疑似命令に到達したかどうか (trueなら以降アセンブル停止)
  warnings?: string[]; // 警告メッセージの収集 (範囲外定数の切り捨てなど)
  maxSymbolLen?: number; // 許可されるシンボル名の最大長 (未設定なら無制限扱い)
  entry?: number; // エントリポイント (END 疑似命令で指定された場合に設定)
  errors: AssemblerError[]; // エラーメッセージのリスト (コンパイル中に収集)
  externs: Set<string>; // EXTERN 宣言された外部シンボル一覧 (リンカで解決する対象)
  options?: { verbose?: boolean }; // アセンブル時オプション
  pass?: number; // 現在のアセンブルパス番号（1 or 2）
  sourceLines?: string[]; // 元ソース行を保持（.lst生成用）
  currentSection: number; // 現在のセクションID（0がTEXT、1がDATA、2がBSS、3以降がCUSTOM）
  sections: Map<number, SectionState>; // セクションIDをキーとしたセクション状態のマップ
  output: OutputInfo;
  source?: string; // ソース全文
  tokens?: Token[]; // トークン解析結果
  nodes?: Node[]; // 構文解析結果
}


/**
 * AsmContext を生成するファクトリ関数。
 * オプション指定した項目のみ上書き可能。
 */
export function createContext(overrides: Partial<AsmContext> = {}): AsmContext {
  const defaults: AsmContext = {
    loc: 0,
    moduleName: "NONAME",
    symbols: new Map(),
    unresolved: [],
    modeWord32: false,
    modeSymLen: 6,
    caseInsensitive: true,
    texts: [],
    errors: [],
    externs: new Set(),
    warnings: [],
    pass: 2,
    sourceLines: [],
    currentSection: 0,
    sections: new Map([
      [
        0,
        {
          id: 0,
          name: ".text",
          kind: "TEXT",
          align: 1,
          flags: 5,      // RO + EXEC
          lc: 0,
          size: 0,
          bytes: [],
        },
      ],
    ]),
    output: {
      relVersion: 1,
    },
  };
  return { ...defaults, ...overrides };
}
