import { dbgBinary as runBinaryDebugger } from "../debugger/binaryDebugger";

export function dbgBinary(
  inputFile: string,
  opts: {
    sym?: string;
    base?: string;
    from?: string;
    bytes?: string;
    decode?: string;
    cpm?: boolean;
    steps?: string;
    entry?: string;
    trace?: boolean;
    cmd?: string;
  }
) {
  runBinaryDebugger(inputFile, opts);
}
