/**
 * Logger — structured logging for the Freedcamp MCP server.
 *
 * Respects LOG_LEVEL env var: "debug" | "info" | "warn" | "error" (default "info").
 * All output goes to stderr so it doesn't interfere with stdio transport.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getCurrentLevel(): LogLevel {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env && env in LEVEL_PRIORITY) return env as LogLevel;
  return "info";
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[getCurrentLevel()];
}

function formatMessage(level: LogLevel, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  if (data !== undefined) {
    return `${prefix} ${message} ${JSON.stringify(data)}`;
  }
  return `${prefix} ${message}`;
}

export const logger = {
  debug(message: string, data?: unknown): void {
    if (shouldLog("debug")) {
      process.stderr.write(formatMessage("debug", message, data) + "\n");
    }
  },

  info(message: string, data?: unknown): void {
    if (shouldLog("info")) {
      process.stderr.write(formatMessage("info", message, data) + "\n");
    }
  },

  warn(message: string, data?: unknown): void {
    if (shouldLog("warn")) {
      process.stderr.write(formatMessage("warn", message, data) + "\n");
    }
  },

  error(message: string, data?: unknown): void {
    if (shouldLog("error")) {
      process.stderr.write(formatMessage("error", message, data) + "\n");
    }
  },
};