import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-brand-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="d-inline-flex align-items-center gap-2">
      <svg width="40" height="40" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="16" [attr.fill]="light() ? '#ffffff' : '#1B4F7B'" />
        <path d="M14 46V26l18-10 18 10v20" fill="none" [attr.stroke]="light() ? '#1B4F7B' : '#fff'" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" />
        <path d="M24 46V34h16v12" fill="none" stroke="#F5A623" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" />
        <circle cx="32" cy="26" r="3" fill="#2B93B0" />
      </svg>
      @if (!compact()) {
        <span class="lh-1">
          <span class="d-block font-display fw-bold fs-5" [class.text-white]="light()">مدارس المنهل</span>
          <span class="d-block small" [class]="light() ? 'text-white-50' : 'text-muted-ar'">الخدمات المساندة المتكاملة</span>
        </span>
      }
    </span>
  `,
})
export class BrandLogoComponent {
  readonly light = input(false);
  readonly compact = input(false);
}
