import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('quotes cells containing commas, quotes and line breaks', () => {
    const csv = toCsv(['الرقم', 'العنوان'], [['MNH-1', 'عطل, تكييف'], ['MNH-2', 'قال "عاجل"\nجدًا'], ['MNH-3', null]]);
    expect(csv).toBe('الرقم,العنوان\r\nMNH-1,"عطل, تكييف"\r\nMNH-2,"قال ""عاجل""\nجدًا"\r\nMNH-3,');
  });
});
