const { Writable } = require('stream');
const { createTeachLogger } = require('../../../utils/teachLogger');

function capture() {
  const lines = [];
  const stream = new Writable({
    write(chunk, _e, cb) { lines.push(JSON.parse(chunk.toString())); cb(); },
  });
  return { lines, stream };
}

describe('teachLogger (api-server)', () => {
  it('keeps token visible (no redaction)', () => {
    const { lines, stream } = capture();
    const log = createTeachLogger({ service: 'api-server', level: 'debug', stream });
    log.info('exchange', { access_token: 'eyJ.h.s', act: { sub: 'agent1' } });
    expect(lines[0].service).toBe('api-server');
    expect(lines[0].access_token).toBe('eyJ.h.s');
    expect(lines[0].act.sub).toBe('agent1');
  });
  it('step() narrates RFC 8693', () => {
    const { lines, stream } = capture();
    const log = createTeachLogger({ service: 'api-server', level: 'debug', stream });
    log.step(4, 9, 'RFC 8693 subject+actor exchange', { resource: 'mcp' });
    expect(lines[0].msg).toBe('[TEACH] step 4/9: RFC 8693 subject+actor exchange');
    expect(lines[0].teach).toBe(true);
  });
  it('error() carries cause+stack+operation', () => {
    const { lines, stream } = capture();
    const log = createTeachLogger({ service: 'api-server', level: 'debug', stream });
    log.error('exchange failed', new Error('bad'), { operation: 'rfc8693' });
    expect(lines[0].err.message).toBe('bad');
    expect(typeof lines[0].err.stack).toBe('string');
    expect(lines[0].operation).toBe('rfc8693');
  });
  it('LOG_LEVEL filters debug at info', () => {
    const c = capture();
    const log = createTeachLogger({ service: 'api-server', level: 'info', stream: c.stream });
    log.debug('d');
    expect(c.lines).toHaveLength(0);
  });
  it('resolveLevel reads process.env.LOG_LEVEL when no level opt', () => {
    const saved = process.env.LOG_LEVEL;
    try {
      process.env.LOG_LEVEL = 'warn';
      const c = capture();
      const log = createTeachLogger({ service: 'api-server', stream: c.stream });
      log.info('i');
      log.warn('w');
      expect(c.lines).toHaveLength(1);
      expect(c.lines[0].msg).toBe('w');
    } finally {
      if (saved === undefined) delete process.env.LOG_LEVEL; else process.env.LOG_LEVEL = saved;
    }
  });
  it('reserved keys do not clobber pino keys', () => {
    const { lines, stream } = capture();
    const log = createTeachLogger({ service: 'api-server', level: 'debug', stream });
    log.info('m', { level: 'X', service: 'Y' });
    expect(lines[0].service).toBe('api-server');
    expect(typeof lines[0].level).toBe('number');
    expect(lines[0].field_level).toBe('X');
    expect(lines[0].field_service).toBe('Y');
  });
});
