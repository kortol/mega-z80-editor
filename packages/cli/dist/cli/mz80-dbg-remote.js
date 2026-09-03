"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbgRemote = dbgRemote;
const core_1 = require("@mz80/core");
async function dbgRemote(opts) {
    const client = new core_1.DebugRpcClient();
    const connect = opts.connect ?? "127.0.0.1:4700";
    await client.connect(connect);
    try {
        if (opts.cmd && opts.cmd.trim().length > 0) {
            await (0, core_1.runRemoteScript)(client, opts.cmd);
            return;
        }
        await (0, core_1.runRemoteRepl)(client);
    }
    finally {
        client.close();
    }
}
