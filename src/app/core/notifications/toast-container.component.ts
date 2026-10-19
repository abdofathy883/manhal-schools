import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgbToastModule } from '@ng-bootstrap/ng-bootstrap/toast';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-container',
  imports: [NgbToastModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'toast-container position-fixed bottom-0 start-0 p-3',
    style: 'z-index: 2000',
    'aria-live': 'polite',
    'aria-atomic': 'false',
  },
  template: `
    @for (t of toasts.toasts(); track t.id) {
      <ngb-toast
        [autohide]="true"
        [delay]="t.delay"
        (hidden)="toasts.dismiss(t.id)"
        class="border-0 shadow-lg mb-2"
        [class]="'text-bg-' + t.tone"
        role="status"
      >
        <div class="d-flex align-items-start gap-2">
          <i class="bi mt-1" [class]="t.icon" aria-hidden="true"></i>
          <div class="flex-grow-1">
            <div class="fw-bold">{{ t.title }}</div>
            @if (t.message) {
              <div class="small">{{ t.message }}</div>
            }
          </div>
          <button type="button" class="btn-close btn-close-white" aria-label="إغلاق" (click)="toasts.dismiss(t.id)"></button>
        </div>
      </ngb-toast>
    }
  `,
})
export class ToastContainerComponent {
  protected readonly toasts = inject(ToastService);
}
