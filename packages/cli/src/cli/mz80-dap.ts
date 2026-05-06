import { MinimalDapAdapter } from "../dap/minimalAdapter";

export function dap(): void {
  const adapter = new MinimalDapAdapter();
  adapter.start();
}
