// packages/cli/src/assembler/testUtils.ts
import fs from "fs";
import path from "path";
import { assemble } from "../cli/mz80-as";
import type { AsmContext } from "./context";

/**
 * 簡易アセンブル関数。
 * 文字列ソースを一時ファイルに書き出し、CLI版assembleを呼び出す。
 *
 * デフォルト ("TEST") の場合は出力先も一時ディレクトリにリダイレクトする。
 */
export function assembleSource(source: string, pass: number, outfile: string = "TEST"): AsmContext {
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
  const ctx = assemble(tmpAsm, actualOutfile, pass, { verbose: true });

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

/**
 * 既存ファイルを直接アセンブル（テスト外用）
 */
export function assembleFile(src: string, outfile: string = "TEST"): AsmContext {
  // 一時ディレクトリを確保
  const tmpDir = path.join(process.cwd(), ".tmp_tests");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  // 出力ファイル名を決定
  // outfile が "TEST" の場合は一時RELを使用
  const actualOutfile =
    outfile === "TEST"
      ? path.join(tmpDir, `${outfile}.rel`)
      : outfile;

  const ctx = assemble(src, actualOutfile, 2);
  try {
    if (outfile === "TEST" && fs.existsSync(actualOutfile)) {
      fs.unlinkSync(actualOutfile);
    }
  } finally {
    /* ignore */
  }
  return ctx;
}
