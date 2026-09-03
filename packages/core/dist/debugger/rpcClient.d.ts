type RpcResponse = {
    id?: number;
    result?: unknown;
    error?: {
        code: string;
        message: string;
    };
};
export declare class DebugRpcClient {
    private socket;
    private carry;
    private nextId;
    private readonly pending;
    connect(addr: string): Promise<void>;
    close(): void;
    request(method: string, params?: unknown): Promise<RpcResponse>;
    private onData;
}
export declare function runRemoteCommand(client: DebugRpcClient, raw: string): Promise<boolean>;
export declare function runRemoteScript(client: DebugRpcClient, script: string): Promise<void>;
export declare function runRemoteRepl(client: DebugRpcClient): Promise<void>;
export {};
