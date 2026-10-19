import { describe, expect, it } from 'vitest';
import { formatDuration } from './sla';

const m = (min: number) => min * 60_000;

describe('formatDuration', () => {
  it('uses correct Arabic number agreement', () => {
    expect(formatDuration(m(60))).toBe('ساعة');
    expect(formatDuration(m(120))).toBe('ساعتان');
    expect(formatDuration(m(5 * 60))).toBe('5 ساعات');
    expect(formatDuration(m(17 * 60))).toBe('17 ساعة');
    expect(formatDuration(m(24 * 60 + 17 * 60))).toBe('يوم و 17 ساعة');
    expect(formatDuration(m(2 * 1440 + 3 * 60))).toBe('يومان و 3 ساعات');
    expect(formatDuration(m(45))).toBe('45 دقيقة');
    expect(formatDuration(m(3))).toBe('3 دقائق');
    expect(formatDuration(m(65))).toBe('ساعة و 5 دقائق');
  });
});
