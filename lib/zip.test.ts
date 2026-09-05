import { describe, it, expect } from 'vitest';
import { buildZip, crc32 } from './zip';

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789')).toString(16)).toBe('cbf43926');
  });
  it('writes a valid stored archive with local + central headers', () => {
    const zip = buildZip([{ name: 'a.csv', data: 'x,y\r\n1,2\r\n' }, { name: 'dir/b.txt', data: 'hello' }]);
    const dv = new DataView(zip.buffer);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);           // local header
    expect(dv.getUint32(zip.length - 22, true)).toBe(0x06054b50); // end record
    expect(dv.getUint16(zip.length - 22 + 10, true)).toBe(2);     // entry count
    const text = new TextDecoder().decode(zip);
    expect(text).toContain('a.csv');
    expect(text).toContain('dir/b.txt');
    expect(text).toContain('hello');
  });
});
