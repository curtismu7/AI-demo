import pino, { Logger } from 'pino';
import { Writable } from 'stream';

export interface TeachLoggerOptions {
  service: string;
  level?: string;
  stream?: Writable;
  pretty?: boolean;
}

export interface TeachLogger {
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, err?: unknown, fields?: Record<string, unknown>): void;
  debug(msg: string, fields?: Record<string, unknown>): void;
  step(n: number, total: number, msg: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): TeachLogger;
}

function resolveLevel(opt?: string): string {
  return opt || process.env.LOG_LEVEL || 'debug';
}

function wrap(p: Logger): TeachLogger {
  return {
    info: (msg, fields) => p.info(fields || {}, msg),
    warn: (msg, fields) => p.warn(fields || {}, msg),
    debug: (msg, fields) => p.debug(fields || {}, msg),
    error: (msg, err, fields) => {
      const base: Record<string, unknown> = { ...(fields || {}) };
      if (err instanceof Error) {
        base.err = { message: err.message, stack: err.stack, cause: (err as any).cause };
      } else if (err !== undefined) {
        base.err = err;
      }
      p.error(base, msg);
    },
    step: (n, total, msg, fields) =>
      p.info({ ...(fields || {}), teach: true }, `[TEACH] step ${n}/${total}: ${msg}`),
    child: (bindings) => wrap(p.child(bindings)),
  };
}

export function createTeachLogger(opts: TeachLoggerOptions): TeachLogger {
  const level = resolveLevel(opts.level);
  const base = { level, base: { service: opts.service } };
  let p: Logger;
  if (opts.stream) {
    p = pino(base, opts.stream);
  } else if (opts.pretty ?? process.env.NODE_ENV !== 'production') {
    p = pino({ ...base, transport: { target: 'pino-pretty', options: { colorize: true } } });
  } else {
    p = pino(base);
  }
  return wrap(p);
}

export const teachLog = createTeachLogger({ service: 'mcp-server' });
