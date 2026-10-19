import { ChangeDetectionStrategy, Component, inject, model, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { Clock } from '../../core/clock.service';
import { MAX_FILES, checkFiles, toMeta } from '../../core/requests/attachment-rules';
import { AttachmentMeta } from '../../domain/models/request';
import { FileChipComponent } from './file-chip.component';

/**
 * Fake uploader: drag & drop or browse; validates type/size/count and keeps metadata only.
 * Images and PDF up to 10 MB, video up to 50 MB, at most 5 files.
 */
@Component({
  selector: 'app-attachment-uploader',
  imports: [FileChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="border border-2 rounded-3 p-4 text-center"
      [class]="dragging() ? 'border-info bg-info-subtle' : 'border-dashed bg-body-tertiary'"
      style="border-style: dashed !important"
      (dragover)="onDragOver($event)"
      (dragleave)="dragging.set(false)"
      (drop)="onDrop($event)"
    >
      <i class="bi bi-cloud-arrow-up fs-2 text-info" aria-hidden="true"></i>
      <div class="fw-semibold">اسحب الملفات وأفلتها هنا</div>
      <div class="small text-muted-ar mb-2">صور وPDF حتى 10 ميجابايت، وفيديو حتى 50 ميجابايت، بحد أقصى {{ max }} ملفات</div>
      <label class="btn btn-outline-primary btn-sm mb-0">
        <i class="bi bi-paperclip me-1" aria-hidden="true"></i>اختيار ملفات
        <input type="file" class="visually-hidden" multiple accept="image/*,application/pdf,video/*" (change)="onPick($event)" />
      </label>
    </div>

    @if (errors().length) {
      <ul class="text-danger small mt-2 mb-0 ps-3" role="alert">
        @for (e of errors(); track e) {
          <li>{{ e }}</li>
        }
      </ul>
    }

    @if (files().length) {
      <div class="d-flex flex-wrap gap-2 mt-3">
        @for (f of files(); track f.id) {
          <app-file-chip [file]="f" [removable]="true" (remove)="removeFile(f.id)" />
        }
      </div>
    }
  `,
})
export class AttachmentUploaderComponent {
  private readonly auth = inject(AuthService);
  private readonly clock = inject(Clock);

  protected readonly max = MAX_FILES;
  readonly files = model<AttachmentMeta[]>([]);
  protected readonly errors = signal<string[]>([]);
  protected readonly dragging = signal(false);

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.add(Array.from(event.dataTransfer?.files ?? []));
  }

  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.add(Array.from(input.files ?? []));
    input.value = '';
  }

  protected removeFile(id: string): void {
    this.files.update((list) => list.filter((f) => f.id !== id));
    this.errors.set([]);
  }

  private add(picked: File[]): void {
    const { accepted, errors } = checkFiles(picked, this.files().length);
    this.errors.set(errors);
    if (!accepted.length) return;
    const at = this.clock.now();
    const user = this.auth.currentUser()?.id ?? 'unknown';
    this.files.update((list) => [...list, ...accepted.map((f, i) => toMeta(f, user, at, list.length + i))]);
  }
}
