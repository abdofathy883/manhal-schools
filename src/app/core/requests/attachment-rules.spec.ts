import { describe, expect, it } from 'vitest';
import { checkFiles } from './attachment-rules';

const f = (name: string, size: number, type: string) => ({ name, size, type });
const MB = 1024 * 1024;

describe('checkFiles', () => {
  it('accepts images and PDF up to 10 MB and video up to 50 MB', () => {
    const r = checkFiles([f('a.jpg', 9 * MB, 'image/jpeg'), f('b.pdf', 10 * MB, 'application/pdf'), f('c.mp4', 49 * MB, 'video/mp4')]);
    expect(r.accepted).toHaveLength(3);
    expect(r.errors).toHaveLength(0);
  });

  it('rejects oversized files, other types, and anything beyond five files', () => {
    const r = checkFiles([f('big.jpg', 11 * MB, 'image/jpeg'), f('big.mp4', 51 * MB, 'video/mp4'), f('a.exe', 1, 'application/x-msdownload')]);
    expect(r.accepted).toHaveLength(0);
    expect(r.errors).toHaveLength(3);

    const many = Array.from({ length: 4 }, (_, i) => f(`${i}.png`, 1000, 'image/png'));
    const withExisting = checkFiles(many, 3);
    expect(withExisting.accepted).toHaveLength(2);
    expect(withExisting.errors).toHaveLength(2);
  });
});
