import { setPhase, validTransitions } from "../../assembler/phaseManager";
import { createContext } from "../context";

test("valid phase transition", () => {
  const ctx = createContext({});
  ctx.phase = "tokenize";
  setPhase(ctx, "parse");
  expect(ctx.phase).toBe("parse");
});

test("invalid phase transition throws", () => {
  const ctx = createContext({});
  ctx.phase = "parse";
  expect(() => setPhase(ctx, "link")).toThrow(/Invalid phase/);
});
