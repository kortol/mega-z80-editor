"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const debugadapter_1 = require("@vscode/debugadapter");
// 最小限のデバッグセッション
class MZ80DebugSession extends debugadapter_1.LoggingDebugSession {
    constructor() {
        super("mz80-dap.log");
        this.setDebuggerLinesStartAt1(true);
        this.setDebuggerColumnsStartAt1(true);
    }
    initializeRequest(response, _args) {
        response.body = response.body || {};
        response.body.supportsConfigurationDoneRequest = true;
        this.sendResponse(response);
        this.sendEvent(new debugadapter_1.InitializedEvent());
    }
    launchRequest(response, _args) {
        this.sendResponse(response);
    }
    disconnectRequest(response, _args) {
        this.sendResponse(response);
        this.sendEvent(new debugadapter_1.TerminatedEvent());
    }
}
// 実行開始
debugadapter_1.LoggingDebugSession.run(MZ80DebugSession);
