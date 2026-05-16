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

const RESERVED = new Set(['level', 'time', 'msg', 'service', 'pid', 'hostname']);
function safeFields(fields?: Record<string, unknown>): Record<string, unknown> {
  if (!fields) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[RESERVED.has(k) ? `field_${k}` : k] = v;
  }
  return out;
}

function resolveLevel(opt?: string): string {
  return opt || process.env.LOG_LEVEL || 'debug';
}

function wrap(p: Logger): TeachLogger {
  return {
    info: (msg, fields) => p.info(safeFields(fields), msg),
    warn: (msg, fields) => p.warn(safeFields(fields), msg),
    debug: (msg, fields) => p.debug(safeFields(fields), msg),
    error: (msg, err, fields) => {
      const base: Record<string, unknown> = { ...safeFields(fields) };
      if (err instanceof Error) {
        base.err = err;
      } else if (err !== undefined) {
        base.err = err;
      }
      p.error(base, msg);
    },
    step: (n, total, msg, fields) =>
      p.info({ ...safeFields(fields), teach: true }, `[TEACH] step ${n}/${total}: ${msg}`),
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

export const teachLog = createTeachLogger({ service: 'agent-service' });
