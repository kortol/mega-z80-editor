import { ldInstr } from "./ld";
import { InstrDef } from "./types";

export const instrTable: Record<string, InstrDef[]> = {
  LD: ldInstr,
};
