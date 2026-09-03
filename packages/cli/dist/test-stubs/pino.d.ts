type PinoLogger = {
    child: (bindings?: any) => PinoLogger;
    info: (...args: any[]) => void;
    debug: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
};
export default function pino(_options?: any): PinoLogger;
export {};
