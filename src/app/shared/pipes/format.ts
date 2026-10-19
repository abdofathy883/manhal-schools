import { Pipe, PipeTransform, inject } from '@angular/core';
import { SettingsService } from '../../core/settings.service';

const GREGORIAN = 'ar-SA-u-ca-gregory-nu-latn';
const HIJRI = 'ar-SA-u-ca-islamic-umalqura-nu-latn';

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ddMMyyyy(d: Date, hijri: boolean): string {
  const parts = new Intl.DateTimeFormat(hijri ? HIJRI : GREGORIAN, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(d);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${pick('day')}/${pick('month')}/${pick('year')}`;
}

export function formatDate(value: string | number | Date | null | undefined, hijri = false): string {
  const d = toDate(value);
  return d ? ddMMyyyy(d, hijri) : '—';
}

export function formatTime(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  const parts = new Intl.DateTimeFormat(GREGORIAN, { hour: '2-digit', minute: '2-digit', hour12: true }).formatToParts(d);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${pick('hour')}:${pick('minute')} ${pick('dayPeriod')}`;
}

export function formatDateTime(value: string | number | Date | null | undefined, hijri = false): string {
  const d = toDate(value);
  return d ? `${ddMMyyyy(d, hijri)} ${formatTime(d)}` : '—';
}

export function formatLongDate(value: string | number | Date | null | undefined, hijri = false): string {
  const d = toDate(value);
  return d
    ? new Intl.DateTimeFormat(hijri ? HIJRI : GREGORIAN, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(d)
    : '—';
}

export function formatNumber(value: number | null | undefined, fractionDigits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('ar-SA-u-nu-latn', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${formatNumber(value, Number.isInteger(value) ? 0 : 2)} ر.س`;
}

/** Impure on purpose: the Hijri preference is a signal that changes at runtime. */
@Pipe({ name: 'arDate', pure: false })
export class ArDatePipe implements PipeTransform {
  private readonly settings = inject(SettingsService);

  transform(value: string | number | Date | null | undefined): string {
    return formatDate(value, this.settings.hijri());
  }
}

@Pipe({ name: 'arDateTime', pure: false })
export class ArDateTimePipe implements PipeTransform {
  private readonly settings = inject(SettingsService);

  transform(value: string | number | Date | null | undefined): string {
    return formatDateTime(value, this.settings.hijri());
  }
}

@Pipe({ name: 'arLongDate', pure: false })
export class ArLongDatePipe implements PipeTransform {
  private readonly settings = inject(SettingsService);

  transform(value: string | number | Date | null | undefined): string {
    return formatLongDate(value, this.settings.hijri());
  }
}

@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return formatMoney(value);
  }
}

@Pipe({ name: 'num' })
export class NumPipe implements PipeTransform {
  transform(value: number | null | undefined, fractionDigits = 0): string {
    return formatNumber(value, fractionDigits);
  }
}
