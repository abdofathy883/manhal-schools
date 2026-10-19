import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { NgbActiveOffcanvas } from '@ng-bootstrap/ng-bootstrap/offcanvas';
import { User } from '../../domain/models/rbac';
import { ServiceRequest } from '../../domain/models/request';
import { PriorityBadgeComponent } from '../../shared/ui/status-badge.component';
import { SlaBadgeComponent } from '../../shared/ui/sla-badge.component';
import { ActionPayload } from '../../domain/workflows/engine';

export interface Candidate {
  user: User;
  /** Jobs currently in progress for this person. */
  active: number;
}

/** Assignment drawer: pick the executor (with their current workload) and add an optional note. */
@Component({
  selector: 'app-assign-drawer',
  imports: [ReactiveFormsModule, PriorityBadgeComponent, SlaBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (request(); as r) {
      <div class="offcanvas-header">
        <h2 class="offcanvas-title h5" id="assign-title">إسناد الطلب</h2>
        <button type="button" class="btn-close" aria-label="إغلاق" (click)="canvas.dismiss()"></button>
      </div>
      <form class="offcanvas-body d-flex flex-column" [formGroup]="form" (submit)="$event.preventDefault(); submit()" novalidate>
        <div class="card bg-body-tertiary border-0 mb-3">
          <div class="card-body py-2">
            <div class="small text-muted-ar ltr-inline">{{ r.refNo }}</div>
            <div class="fw-semibold">{{ r.titleAr }}</div>
            <div class="d-flex flex-wrap gap-2 mt-2"><app-priority-badge [priority]="r.priority" /><app-sla-badge [request]="r" /></div>
          </div>
        </div>

        <fieldset class="mb-3">
          <legend class="form-label">المنفّذ المسؤول <span class="text-danger" aria-hidden="true">*</span></legend>
          @for (c of candidates(); track c.user.id) {
            <div class="form-check border rounded-3 p-2 ps-5 mb-2" [class.border-info]="form.value.assigneeId === c.user.id">
              <input class="form-check-input" type="radio" [id]="'cand-' + c.user.id" [value]="c.user.id" formControlName="assigneeId" />
              <label class="form-check-label d-flex justify-content-between gap-2" [for]="'cand-' + c.user.id">
                <span>
                  <span class="fw-semibold d-block">{{ c.user.nameAr }}</span>
                  <span class="small text-muted-ar">{{ c.user.jobTitleAr }}</span>
                </span>
                <span class="badge align-self-center" [class]="c.active > 3 ? 'bg-warning-subtle text-warning-emphasis' : 'bg-success-subtle text-success-emphasis'">
                  {{ c.active }} قيد التنفيذ
                </span>
              </label>
            </div>
          } @empty {
            <p class="text-muted-ar">لا يوجد منفّذون متاحون لهذا الطلب.</p>
          }
          @if (submitted() && !form.value.assigneeId) {
            <div class="text-danger small" role="alert">اختر المنفّذ المسؤول.</div>
          }
        </fieldset>

        <div class="mb-3">
          <label class="form-label" for="assign-note">ملاحظة للمنفّذ (اختيارية)</label>
          <textarea id="assign-note" class="form-control" rows="3" formControlName="noteAr" placeholder="مثال: التنسيق مع مشرفة الدور قبل الدخول"></textarea>
        </div>

        <div class="mt-auto d-flex gap-2">
          <button type="submit" class="btn btn-primary flex-grow-1"><i class="bi bi-person-gear me-1" aria-hidden="true"></i>إسناد وإشعار مقدم الطلب</button>
          <button type="button" class="btn btn-outline-secondary" (click)="canvas.dismiss()">إلغاء</button>
        </div>
      </form>
    }
  `,
})
export class AssignDrawerComponent {
  protected readonly canvas = inject(NgbActiveOffcanvas);

  protected readonly request = signal<ServiceRequest | null>(null);
  protected readonly candidates = signal<Candidate[]>([]);
  protected readonly submitted = signal(false);

  protected readonly form = new FormGroup({
    assigneeId: new FormControl('', { nonNullable: true }),
    noteAr: new FormControl('', { nonNullable: true }),
  });

  init(request: ServiceRequest, candidates: Candidate[]): void {
    this.request.set(request);
    this.candidates.set(candidates);
    if (request.assigneeId) this.form.controls.assigneeId.setValue(request.assigneeId);
  }

  protected submit(): void {
    this.submitted.set(true);
    const v = this.form.getRawValue();
    const chosen = this.candidates().find((c) => c.user.id === v.assigneeId);
    if (!chosen) return;
    const payload: ActionPayload = { assigneeId: chosen.user.id, assigneeName: chosen.user.nameAr, noteAr: v.noteAr.trim() || undefined };
    this.canvas.close(payload);
  }
}
