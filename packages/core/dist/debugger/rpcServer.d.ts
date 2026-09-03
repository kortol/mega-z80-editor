import * as net from "net";
import { Z80DebugSession } from "./debugSession";
export declare function startDebugRpcStdio(session: Z80DebugSession): void;
export declare function startDebugRpcTcp(session: Z80DebugSession, host: string, port: number): net.Server;
