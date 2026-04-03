type PinoLogger = {
  child: (bindings?: any) => PinoLogger;
  info: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
};

function createLogger(): PinoLogger {
  const logger: PinoLogger = {
    child: () => logger,
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  };
  return logger;
}

export default function pino(_options?: any): PinoLogger {
  return createLogger();
}
