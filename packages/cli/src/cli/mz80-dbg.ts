import { dbgBinary as runBinaryDebugger } from "@mz80/core";

export function dbgBinary(
  inputFile: string,
  opts: {
    sym?: string;
    smap?: string;
    base?: string;
    from?: string;
    bytes?: string;
    decode?: string;
    cpm?: boolean;
    cpmInteractive?: boolean;
    steps?: string;
    entry?: string;
    trace?: boolean;
    bdosTrace?: boolean;
    cmd?: string;
    cpmRoot?: string;
    tail?: string;
    rpcStdio?: boolean;
    rpcListen?: string;
  }
) {
  runBinaryDebugger(inputFile, opts);
}
