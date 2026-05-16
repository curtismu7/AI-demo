import { Writable } from 'stream';
import pino from 'pino';

import { createTeachLogger } from '../../src/utils/teachLogger';

function capture(): { lines: any[]; stream: Writable } {
  const lines: any[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(JSON.parse(chunk.toString()));
      cb();
    },
  });
  return { lines, stream };
}

describe('teachLogger', () => {
  it('emits a structured info line with fields and never redacts a token', () => {
    const { lines, stream } = capture();
    const log = createTeachLogger({ service: 'mcp-server', level: 'debug', stream });
    const fakeJwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyMSJ9.sig';
    log.info('token received', { access_token: fakeJwt, sub: 'user1' });
    expect(lines).toHaveLength(1);
    expect(lines[0].msg).toBe('token received');
    expect(lines[0].service).toBe('mcp-server');
    expect(lines[0].access_token).toBe(fakeJwt);
  });

  it('step() emits a [TEACH] narration marker with n/total', () => {
    const { lines, stream } = capture();
    const log = createTeachLogger({ service: 'mcp-server', level: 'debug', stream });
    log.step(3, 9, 'RFC 8693 exchange', { resource: 'mcp' });
    expect(lines[0].msg).toBe('[TEACH] step 3/9: RFC 8693 exchange');
    expect(lines[0].resource).toBe('mcp');
    expect(lines[0].teach).toBe(true);
  });

  it('error() captures message, stack and operation', () => {
    const { lines, stream } = capture();
    const log = createTeachLogger({ service: 'mcp-server', level: 'debug', stream });
    log.error('exchange failed', new Error('boom'), { operation: 'rfc8693' });
    expect(lines[0].level).toBe(50);
    expect(lines[0].err.message).toBe('boom');
    expect(typeof lines[0].err.stack).toBe('string');
    expect(lines[0].operation).toBe('rfc8693');
  });

  it('respects LOG_LEVEL via level option (debug shown, then info filters debug)', () => {
    const c1 = capture();
    const debugLog = createTeachLogger({ service: 's', level: 'debug', stream: c1.stream });
    debugLog.debug('d');
    expect(c1.lines).toHaveLength(1);

    const c2 = capture();
    const infoLog = createTeachLogger({ service: 's', level: 'info', stream: c2.stream });
    infoLog.debug('d');
    expect(c2.lines).toHaveLength(0);
  });
});
