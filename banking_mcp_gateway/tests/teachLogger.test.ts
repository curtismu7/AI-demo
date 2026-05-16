import { Writable } from 'stream';
import { createTeachLogger } from '../src/teachLogger';

function capture(): { lines: any[]; stream: Writable } {
  const lines: any[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) { lines.push(JSON.parse(chunk.toString())); cb(); },
  });
  return { lines, stream };
}

describe('teachLogger (gateway)', () => {
  it('emits structured info and never redacts a token', () => {
    const { lines, stream } = capture();
    const log = createTeachLogger({ service: 'gateway', level: 'debug', stream });
    const fakeJwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyMSJ9.sig';
    log.info('token received', { access_token: fakeJwt });
    expect(lines[0].msg).toBe('token received');
    expect(lines[0].service).toBe('gateway');
    expect(lines[0].access_token).toBe(fakeJwt);
  });
  it('step() emits [TEACH] marker', () => {
    const { lines, stream } = capture();
    const log = createTeachLogger({ service: 'gateway', level: 'debug', stream });
    log.step(2, 6, 'credential disposition selected', { disposition: 'api_key' });
    expect(lines[0].msg).toBe('[TEACH] step 2/6: credential disposition selected');
    expect(lines[0].disposition).toBe('api_key');
    expect(lines[0].teach).toBe(true);
  });
  it('error() captures stack + operation', () => {
    const { lines, stream } = capture();
    const log = createTeachLogger({ service: 'gateway', level: 'debug', stream });
    log.error('token exchange failed', new Error('boom'), { operation: 'rfc8693' });
    expect(lines[0].err.message).toBe('boom');
    expect(lines[0].operation).toBe('rfc8693');
  });
  it('LOG_LEVEL filters debug at info', () => {
    const c = capture();
    const log = createTeachLogger({ service: 'gateway', level: 'info', stream: c.stream });
    log.debug('d');
    expect(c.lines).toHaveLength(0);
  });
  it('reserved keys from caller fields do not clobber pino keys', () => {
    const { lines, stream } = capture();
    const log = createTeachLogger({ service: 'gateway', level: 'debug', stream });
    log.info('m', { level: 'X', service: 'Y' });
    expect(lines[0].service).toBe('gateway');
    expect(typeof lines[0].level).toBe('number');
    expect(lines[0].field_level).toBe('X');
    expect(lines[0].field_service).toBe('Y');
  });
});
