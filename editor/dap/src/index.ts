import {
  LoggingDebugSession,
  InitializedEvent,
  TerminatedEvent
} from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";

// 最小限のデバッグセッション
class MZ80DebugSession extends LoggingDebugSession {
  public constructor() {
    super("mz80-dap.log");
    this.setDebuggerLinesStartAt1(true);
    this.setDebuggerColumnsStartAt1(true);
  }

  protected initializeRequest(
    response: DebugProtocol.InitializeResponse,
    _args: DebugProtocol.InitializeRequestArguments
  ): void {
    response.body = response.body || {};
    response.body.supportsConfigurationDoneRequest = true;
    this.sendResponse(response);
    this.sendEvent(new InitializedEvent());
  }

  protected launchRequest(
    response: DebugProtocol.LaunchResponse,
    _args: DebugProtocol.LaunchRequestArguments
  ): void {
    this.sendResponse(response);
  }

  protected disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    _args: DebugProtocol.DisconnectArguments
  ): void {
    this.sendResponse(response);
    this.sendEvent(new TerminatedEvent());
  }
}

// 実行開始
LoggingDebugSession.run(MZ80DebugSession);
