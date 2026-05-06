import { DebugRpcClient, runRemoteRepl, runRemoteScript } from "../debugger/rpcClient";

export async function dbgRemote(opts: { connect?: string; cmd?: string }): Promise<void> {
  const client = new DebugRpcClient();
  const connect = opts.connect ?? "127.0.0.1:4700";
  await client.connect(connect);
  try {
    if (opts.cmd && opts.cmd.trim().length > 0) {
      await runRemoteScript(client, opts.cmd);
      return;
    }
    await runRemoteRepl(client);
  } finally {
    client.close();
  }
}

