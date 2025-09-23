export type LogLevel = "quiet" | "normal" | "verbose";

export class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = "normal") {
    this.level = level;
  }

  info(msg: string) {
    if (this.level !== "quiet") {
      console.log(msg);
    }
  }

  verbose(msg: string) {
    if (this.level === "verbose") {
      console.log("[VERBOSE]", msg);
    }
  }

  error(msg: string) {
    if (this.level !== "quiet") {
      console.error("❌ " + msg);
    }
  }
}
