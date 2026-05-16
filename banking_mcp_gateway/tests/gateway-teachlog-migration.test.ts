import { readFileSync } from 'fs';
import { join } from 'path';

const files = [
  'src/middleware/authorizeMcpRequest.ts',
  'src/credentialSwap.ts',
  'src/tokenExchange.ts',
];

describe('gateway priority-1 console migration', () => {
  it.each(files)('%s has no raw console.* calls', (f) => {
    const src = readFileSync(join(__dirname, '..', f), 'utf8');
    // Broadened to catch info/trace and incidental whitespace, per review note.
    expect(src.match(/console\s*\.\s*(log|error|warn|debug|info|trace)\s*\(/g) || []).toEqual([]);
  });

  it('credentialSwap narrates the disposition with teachLog.info', () => {
    const src = readFileSync(join(__dirname, '../src/credentialSwap.ts'), 'utf8');
    expect(src).toMatch(/teachLog\.info\('gateway credential disposition selected'/);
  });

  it('tokenExchange narrates the RFC 8693 exchange', () => {
    const src = readFileSync(join(__dirname, '../src/tokenExchange.ts'), 'utf8');
    expect(src).toMatch(/teachLog\.step\(/);
    expect(src).toMatch(/RFC 8693/);
  });
});
