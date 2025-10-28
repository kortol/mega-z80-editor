// packages/cli/src/assembler/testUtils.ts
import fs from "fs";
import path from "path";
import { assemble, runEmit } from "../cli/mz80-as";
import { AsmOptions, createContext, type AsmContext } from "./context";
import { initCodegen } from "./codegen/emit";
import { setPhase } from "./phaseManager";
import { tokenize } from "./tokenizer";
import { parse } from "./parser";
import { runAnalyze } from "./analyze";
import { expandMacros } from "./macro";
import { console } from "inspector";
import { randomUUID } from "crypto";

/**
 * 簡易アセンブル関数。
 * 文字列ソースを一時ファイルに書き出し、CLI版assembleを呼び出す。
 *
 * デフォルト ("TEST") の場合は出力先も一時ディレクトリにリダイレクトする。
 */
export function assembleSource(
  assemble: (
    inputFile: string,
    outputFile: string,
    options?: AsmOptions
  ) => AsmContext,
  source: string,
  options?: AsmOptions,
  outfile: string = "TEST"
): AsmContext {
  // 一時ディレクトリを確保
  const tmpDir = path.join(process.cwd(), ".tmp_tests." + randomUUID());
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  // 入力用一時ASMファイル
  const tmpAsm = path.join(tmpDir, `${outfile}.asm`);
  fs.writeFileSync(tmpAsm, source.trim() + "\n", "utf-8");

  // 出力ファイル名を決定
  // outfile が "TEST" の場合は一時RELを使用
  const actualOutfile =
    outfile === "TEST" ? path.join(tmpDir, `${outfile}.rel`) : outfile;

  console.log(options);

  // CLI版 assemble 実行
  // const ctx = assemble(tmpAsm, actualOutfile, { ...options, verbose: true });
  const ctx = assemble(tmpAsm, actualOutfile, { ...options });

  // Cleanup: テストの邪魔にならないように削除
  try {
    fs.unlinkSync(tmpAsm);
    if (outfile === "TEST" && fs.existsSync(actualOutfile)) {
      fs.unlinkSync(actualOutfile);
    }
  } catch {
    /* ignore */
  }

  return ctx;
}

export function assembleSourceMulti(
  phase: any,
  files: Record<string, string>,
  options?: any
): AsmContext {
  // 🔹 仮想ファイルマップを作成
  const virtualFiles = new Map(Object.entries(files));

  // 🔹 起点ファイル（main.asm）を取得
  const mainSrc = files["main.asm"];
  if (!mainSrc) {
    throw new Error("assembleSourceMulti: missing entry 'main.asm'");
  }

  const ctx = assembleSource(phase, mainSrc, { ...options, virtualFiles });

  return ctx;
}

export function phaseAnalyze(
  inputFile: string,
  outputFile: string,
  options?: AsmOptions
) {
  const ctx = createContext({
    moduleName: "TEST",
    output: { relVersion: options?.relVersion ?? 1 },
    inputFile,
    options,
  });
  initCodegen(ctx, { withDefaultSections: true });
  // PASS 0 : トークン化と構文解析
  const source = fs.readFileSync(inputFile, "utf-8");

  // --- PHASE: tokenize ---
  setPhase(ctx, "tokenize");
  ctx.tokens = tokenize(ctx, source);

  // --- PHASE: parse ---
  setPhase(ctx, "parse");
  ctx.nodes = parse(ctx, ctx.tokens);
  ctx.source = source;

  // --- 🧩 PHASE: macro-expand ---
  setPhase(ctx, "macroExpand");
  expandMacros(ctx);

  // --- PHASE: analyze ---
  setPhase(ctx, "analyze");
  runAnalyze(ctx);

  return ctx;
}

export function phaseEmit(
  inputFile: string,
  outputFile: string,
  options?: AsmOptions
) {
  const ctx = createContext({
    moduleName: "TEST",
    output: { relVersion: options?.relVersion ?? 1 },
    inputFile,
    options,
  });
  initCodegen(ctx, { withDefaultSections: true });
  // PASS 0 : トークン化と構文解析
  const source = fs.existsSync(inputFile)
    ? fs.readFileSync(inputFile, "utf-8")
    : ctx.options.virtualFiles?.get(inputFile) ?? "";

  // --- PHASE: tokenize ---
  setPhase(ctx, "tokenize");
  ctx.tokens = tokenize(ctx, source);

  // --- PHASE: parse ---
  setPhase(ctx, "parse");
  ctx.nodes = parse(ctx, ctx.tokens);
  ctx.source = source;

  // --- 🧩 PHASE: macro-expand ---
  setPhase(ctx, "macroExpand");
  expandMacros(ctx);

  // --- PHASE: analyze ---
  setPhase(ctx, "analyze");
  runAnalyze(ctx);

  // console.log(ctx);
  // for (let n of ctx.nodes) {
  //   console.log(n);
  // }

  // --- PHASE: emit ---
  setPhase(ctx, "emit");
  runEmit(ctx);

  return ctx;
}
