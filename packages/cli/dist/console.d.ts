export type OutputLevel = "info" | "success" | "warn" | "error" | "debug";
export declare class Console {
    private verbose;
    constructor(verbose?: boolean);
    info(msg: string): void;
    success(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
    debug(msg: string): void;
    /** 区切り線（セクション境界） */
    section(title: string): void;
    /** 複数行の強調メッセージ */
    box(message: string): void;
}
