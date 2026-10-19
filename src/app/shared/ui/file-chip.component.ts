import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { AttachmentMeta } from '../../domain/models/request';

@Component({
  selector: 'app-file-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="d-inline-flex align-items-center gap-2 border rounded-pill ps-3 pe-2 py-1 bg-white small">
      <i class="bi" [class]="icon()" aria-hidden="true"></i>
      <span class="ltr-inline text-truncate" style="max-inline-size: 14rem">{{ file().name }}</span>
      <span class="text-muted-ar ltr-inline">{{ sizeLabel() }}</span>
      @if (removable()) {
        <button type="button" class="btn btn-sm btn-link text-danger p-0" (click)="remove.emit()" [attr.aria-label]="'إزالة الملف ' + file().name">
          <i class="bi bi-x-circle-fill" aria-hidden="true"></i>
        </button>
      }
    </span>
  `,
})
export class FileChipComponent {
  readonly file = input.required<AttachmentMeta>();
  readonly removable = input(false);
  readonly remove = output();

  protected readonly icon = computed(() => {
    const mime = this.file().mime;
    if (mime.startsWith('image/')) return 'bi-file-earmark-image text-info';
    if (mime.startsWith('video/')) return 'bi-file-earmark-play text-warning';
    return 'bi-file-earmark-pdf text-danger';
  });

  protected readonly sizeLabel = computed(() => {
    const bytes = this.file().sizeBytes;
    return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  });
}
