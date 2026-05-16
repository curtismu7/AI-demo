import { Writable } from 'stream';
import { createTeachLogger } from '../src/teachLogger';

function capture() {
  const lines: any[] = [];
  const stream = new Writable({
    write(chunk, _e, cb) { lines.push(JSON.parse(chunk.toString())); cb(); },
  });
  return { lines, stream };
}

describe('teachLogger (agent-service)', () => {
  it('keeps token visible', () => {
    const { lines, stream } = capture();
    const log = createTeachLogger({ service: 'agent-service', level: 'debug', stream });
    log.info('actor token', { access_token: 'eyJ.a.b' });
    expect(lines[0].service).toBe('agent-service');
    expect(lines[0].access_token).toBe('eyJ.a.b');
  });
  it('step() narrates', () => {
    const { lines, stream } = capture();
    const log = createTeachLogger({ service: 'agent-service', level: 'debug', stream });
    log.step(1, 2, 'client_credentials actor token requested', { scope: 'ai_agent' });
    expect(lines[0].msg).toBe('[TEACH] step 1/2: client_credentials actor token requested');
    expect(lines[0].teach).toBe(true);
  });
  it('error() carries stack', () => {
    const { lines, stream } = capture();
    const log = createTeachLogger({ service: 'agent-service', level: 'debug', stream });
    log.error('reason failed', new Error('x'), { operation: 'reasonOnce' });
    expect(lines[0].err.message).toBe('x');
    expect(lines[0].operation).toBe('reasonOnce');
  });
  it('LOG_LEVEL filters', () => {
    const c = capture();
    const log = createTeachLogger({ service: 'agent-service', level: 'info', stream: c.stream });
    log.debug('d');
    expect(c.lines).toHaveLength(0);
  });
  it('reserved keys do not clobber', () => {
    const { lines, stream } = capture();
    const log = createTeachLogger({ service: 'agent-service', level: 'debug', stream });
    log.info('m', { level: 'X', service: 'Y' });
    expect(lines[0].service).toBe('agent-service');
    expect(typeof lines[0].level).toBe('number');
    expect(lines[0].field_level).toBe('X');
  });
});
