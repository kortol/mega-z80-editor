export type LogLevel = "quiet" | "normal" | "verbose";

export class Logger {
  private level: LogLevel;
  private debugMode: boolean;

  constructor(level: LogLevel = "normal", debug = false) {
    this.level = level;
    this.debugMode = debug;
  }

  setDebugMode(debug: boolean) {
    this.debugMode = debug;
  }

  debug(msg: string) {
    if (this.debugMode) {
      console.log("[DEBUG]", msg);
    }
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
