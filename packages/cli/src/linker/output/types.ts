// src/linker/output/types.ts
import { LinkResult } from "../core/types";

export interface OutputAdapter {
  write(result: LinkResult): Uint8Array;
}
