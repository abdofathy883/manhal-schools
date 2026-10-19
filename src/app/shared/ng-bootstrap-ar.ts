import { Injectable, Provider } from '@angular/core';
import {
  NgbDateParserFormatter,
  NgbDateStruct,
  NgbDatepickerI18n,
} from '@ng-bootstrap/ng-bootstrap/datepicker';

const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

/** ISO weekday 1 = Monday … 7 = Sunday (ng-bootstrap convention). */
const WEEKDAYS_SHORT = ['إث', 'ثل', 'أر', 'خم', 'جم', 'سب', 'أح'];

/** Arabic month/weekday names, Sunday-first week, Western digits. */
@Injectable()
export class ArabicDatepickerI18n extends NgbDatepickerI18n {
  override getWeekdayLabel(weekday: number): string {
    return WEEKDAYS_SHORT[weekday - 1];
  }

  override getWeekLabel(): string {
    return 'أسبوع';
  }

  override getMonthShortName(month: number): string {
    return MONTHS[month - 1];
  }

  override getMonthFullName(month: number): string {
    return MONTHS[month - 1];
  }

  override getDayAriaLabel(date: NgbDateStruct): string {
    return `${date.day} ${MONTHS[date.month - 1]} ${date.year}`;
  }
}

/** Parses and formats dd/MM/yyyy. */
@Injectable()
export class DmyDateParserFormatter extends NgbDateParserFormatter {
  parse(value: string): NgbDateStruct | null {
    const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(value ?? '');
    return m ? { day: +m[1], month: +m[2], year: +m[3] } : null;
  }

  format(date: NgbDateStruct | null): string {
    return date
      ? `${String(date.day).padStart(2, '0')}/${String(date.month).padStart(2, '0')}/${date.year}`
      : '';
  }
}

export function provideNgbArabic(): Provider[] {
  return [
    { provide: NgbDatepickerI18n, useClass: ArabicDatepickerI18n },
    { provide: NgbDateParserFormatter, useClass: DmyDateParserFormatter },
  ];
}
