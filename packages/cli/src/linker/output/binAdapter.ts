// src/linker/output/binAdapter.ts
import * as fs from "fs";
import { OutputAdapter } from "./types";
import { LinkResult } from "../core/types";

export class BinOutputAdapter implements OutputAdapter {
  write(result: LinkResult): Uint8Array {
    if (result.segments.length === 0) throw new Error("No segments");

    const seg = result.segments[0];
    if (!seg.data) throw new Error("Segment has no data");

    return seg.data;
  }
}
