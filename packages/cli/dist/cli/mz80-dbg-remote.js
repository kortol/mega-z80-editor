"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbgRemote = dbgRemote;
const rpcClient_1 = require("../debugger/rpcClient");
async function dbgRemote(opts) {
    const client = new rpcClient_1.DebugRpcClient();
    const connect = opts.connect ?? "127.0.0.1:4700";
    await client.connect(connect);
    try {
        if (opts.cmd && opts.cmd.trim().length > 0) {
            await (0, rpcClient_1.runRemoteScript)(client, opts.cmd);
            return;
        }
        await (0, rpcClient_1.runRemoteRepl)(client);
    }
    finally {
        client.close();
    }
}
