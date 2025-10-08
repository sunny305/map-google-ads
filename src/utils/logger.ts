/**
 * Logging utility for Google Ads MCP Server
 * Provides structured JSON logging with request ID correlation and token redaction
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

interface LogContext {
  request_id?: string;
  tool_name?: string;
  account_id?: string;
  duration_ms?: number;
  [key: string]: any;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  request_id?: string;
  tool_name?: string;
  context?: LogContext;
  error?: {
    message: string;
    type?: string;
    code?: string;
    stack?: string;
  };
}

/**
 * Patterns for detecting sensitive tokens and secrets
 */
const REDACTION_PATTERNS = [
  // OAuth tokens
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  // Access tokens
  /(access[_-]?token["\s:=]+)([A-Za-z0-9\-._~+/]+)/gi,
  /(refresh[_-]?token["\s:=]+)([A-Za-z0-9\-._~+/]+)/gi,
  // API keys
  /(api[_-]?key["\s:=]+)([A-Za-z0-9\-._~+/]+)/gi,
  // Client secrets
  /(client[_-]?secret["\s:=]+)([A-Za-z0-9\-._~+/]+)/gi,
  // Developer tokens
  /(developer[_-]?token["\s:=]+)([A-Za-z0-9\-._~+/]+)/gi,
];

/**
 * Redact sensitive information from strings
 */
export function redactSecrets(text: string): string {
  let redacted = text;

  for (const pattern of REDACTION_PATTERNS) {
    redacted = redacted.replace(pattern, (_match, ...args) => {
      if (args.length >= 2 && typeof args[0] === 'string') {
        return `${args[0]}[REDACTED]`;
      }
      return '[REDACTED]';
    });
  }

  return redacted;
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Logger class with structured logging and request correlation
 */
export class Logger {
  private defaultContext: LogContext;
  private minLevel: LogLevel;

  constructor(context: LogContext = {}, minLevel: LogLevel = LogLevel.INFO) {
    this.defaultContext = context;
    this.minLevel = minLevel;
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): Logger {
    return new Logger({ ...this.defaultContext, ...context }, this.minLevel);
  }

  /**
   * Set request ID for this logger instance
   */
  withRequestId(requestId: string): Logger {
    return this.child({ request_id: requestId });
  }

  /**
   * Set tool name for this logger instance
   */
  withTool(toolName: string): Logger {
    return this.child({ tool_name: toolName });
  }

  /**
   * Check if level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  /**
   * Write log entry to stderr
   */
  private write(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) {
      return;
    }

    const serialized = JSON.stringify(entry);
    const redacted = redactSecrets(serialized);
    process.stderr.write(redacted + '\n');
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: LogContext): void {
    this.write({
      timestamp: new Date().toISOString(),
      level: LogLevel.DEBUG,
      message,
      ...this.defaultContext,
      ...(context && { context }),
    });
  }

  /**
   * Log info message
   */
  info(message: string, context?: LogContext): void {
    this.write({
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      message,
      ...this.defaultContext,
      ...(context && { context }),
    });
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext): void {
    this.write({
      timestamp: new Date().toISOString(),
      level: LogLevel.WARN,
      message,
      ...this.defaultContext,
      ...(context && { context }),
    });
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | any, context?: LogContext): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.ERROR,
      message,
      ...this.defaultContext,
      ...(context && { context }),
    };

    if (error) {
      entry.error = {
        message: error.message || String(error),
        type: error.type || error.name,
        code: error.code,
        stack: error.stack,
      };
    }

    this.write(entry);
  }

  /**
   * Log with custom level
   */
  log(level: LogLevel, message: string, context?: LogContext): void {
    this.write({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.defaultContext,
      ...(context && { context }),
    });
  }
}

/**
 * Create a new logger instance
 */
export function createLogger(context: LogContext = {}): Logger {
  const minLevel =
    process.env.LOG_LEVEL?.toUpperCase() === 'DEBUG' ? LogLevel.DEBUG : LogLevel.INFO;
  return new Logger(context, minLevel);
}

/**
 * Default logger instance
 */
export const logger = createLogger();
