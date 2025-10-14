// packages/cli/src/assembler/testUtils.ts
import fs from "fs";
import path from "path";
import { assemble, runAnalyze, runEmit } from "../cli/mz80-as";
import { createContext, type AsmContext } from "./context";
import { initCodegen } from "./codegen/emit";
import { setPhase } from "./phaseManager";
import { tokenize } from "./tokenizer";
import { parse } from "./parser";

/**
 * 簡易アセンブル関数。
 * 文字列ソースを一時ファイルに書き出し、CLI版assembleを呼び出す。
 *
 * デフォルト ("TEST") の場合は出力先も一時ディレクトリにリダイレクトする。
 */
export function assembleSource(assemble: (
  inputFile: string,
  outputFile: string,
  options?: { verbose?: boolean; relVersion?: number }
) => AsmContext, source: string, outfile: string = "TEST"): AsmContext {
  // 一時ディレクトリを確保
  const tmpDir = path.join(process.cwd(), ".tmp_tests");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  // 入力用一時ASMファイル
  const tmpAsm = path.join(tmpDir, `${outfile}.asm`);
  fs.writeFileSync(tmpAsm, source.trim() + "\n", "utf-8");

  // 出力ファイル名を決定
  // outfile が "TEST" の場合は一時RELを使用
  const actualOutfile =
    outfile === "TEST"
      ? path.join(tmpDir, `${outfile}.rel`)
      : outfile;

  // CLI版 assemble 実行
  const ctx = assemble(tmpAsm, actualOutfile, { verbose: true });

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

export function phaseAnalyze(inputFile: string, outputFile: string, options?: { verbose?: boolean; relVersion?: number }) {
  const ctx = createContext({
    moduleName: "TEST",
    output: { relVersion: options?.relVersion ?? 1 },
    inputFile,
  });
  initCodegen(ctx, { withDefaultSections: true });
  // PASS 0 : トークン化と構文解析
  const source = fs.readFileSync(inputFile, "utf-8");

  // --- PHASE: tokenize ---
  setPhase(ctx, "tokenize");
  ctx.tokens = tokenize(source);

  // --- PHASE: parse ---
  setPhase(ctx, "parse");
  ctx.nodes = parse(ctx.tokens);
  ctx.source = source;

  // --- PHASE: analyze ---
  setPhase(ctx, "analyze");
  runAnalyze(ctx);

  return ctx;
}

export function phaseEmit(inputFile: string, outputFile: string, options?: { verbose?: boolean; relVersion?: number }) {
  const ctx = createContext({
    moduleName: "TEST",
    output: { relVersion: options?.relVersion ?? 1 },
    inputFile,
  });
  initCodegen(ctx, { withDefaultSections: true });
  // PASS 0 : トークン化と構文解析
  const source = fs.readFileSync(inputFile, "utf-8");

  // --- PHASE: tokenize ---
  setPhase(ctx, "tokenize");
  ctx.tokens = tokenize(source);

  // --- PHASE: parse ---
  setPhase(ctx, "parse");
  ctx.nodes = parse(ctx.tokens);
  ctx.source = source;

  // --- PHASE: analyze ---
  setPhase(ctx, "analyze");
  runAnalyze(ctx);

  // --- PHASE: emit ---
  setPhase(ctx, "emit");
  runEmit(ctx);

  return ctx;
}