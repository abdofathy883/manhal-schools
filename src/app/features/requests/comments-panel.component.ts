import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgbNavModule } from '@ng-bootstrap/ng-bootstrap/nav';
import { PermissionService } from '../../core/rbac/permission.service';
import { RequestService } from '../../core/requests/request.service';
import { ToastService } from '../../core/notifications/toast.service';
import { ServiceRequest } from '../../domain/models/request';
import { isTerminal } from '../../domain/workflows/sla';
import { ArDateTimePipe } from '../../shared/pipes/format';

/** Two tabs: comments visible to the requester, and internal comments for executors (only for users who may see them). */
@Component({
  selector: 'app-comments-panel',
  imports: [ReactiveFormsModule, NgbNavModule, ArDateTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card">
      <div class="card-header">التعليقات</div>
      <div class="card-body">
        <ul ngbNav #nav="ngbNav" [activeId]="tab()" (activeIdChange)="tab.set($event)" class="nav-tabs mb-3">
          <li [ngbNavItem]="'public'">
            <button ngbNavLink type="button">ظاهر لمقدم الطلب ({{ publicComments().length }})</button>
          </li>
          @if (canInternal()) {
            <li [ngbNavItem]="'internal'">
              <button ngbNavLink type="button"><i class="bi bi-lock me-1" aria-hidden="true"></i>داخلي للمنفذين ({{ internalComments().length }})</button>
            </li>
          }
        </ul>

        @for (c of shown(); track c.id) {
          <div class="d-flex gap-3 mb-3">
            <span class="rounded-circle bg-primary-subtle text-primary-emphasis d-inline-flex align-items-center justify-content-center fw-bold flex-shrink-0" style="inline-size: 2.2rem; block-size: 2.2rem" aria-hidden="true">{{ c.authorName.charAt(0) }}</span>
            <div class="flex-grow-1">
              <div class="small"><strong>{{ c.authorName }}</strong> <span class="text-muted-ar">· {{ c.authorRoleAr }} · <span class="ltr-inline">{{ c.at | arDateTime }}</span></span></div>
              <div class="rounded-3 p-2 mt-1" [class]="c.internal ? 'bg-warning-subtle' : 'bg-body-tertiary'">{{ c.textAr }}</div>
            </div>
          </div>
        } @empty {
          <p class="text-muted-ar mb-3">لا توجد تعليقات بعد.</p>
        }

        @if (canWrite()) {
          <div class="mt-2">
            <label class="form-label small" for="cm-text">{{ tab() === 'internal' ? 'تعليق داخلي (لا يراه مقدم الطلب)' : 'تعليق ظاهر لمقدم الطلب' }}</label>
            <textarea id="cm-text" class="form-control" rows="2" [formControl]="text"></textarea>
            <button type="button" class="btn btn-primary btn-sm mt-2" [disabled]="sending() || !text.value.trim()" (click)="send()">
              <i class="bi bi-send me-1" aria-hidden="true"></i>إرسال التعليق
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class CommentsPanelComponent {
  private readonly permissions = inject(PermissionService);
  private readonly requests = inject(RequestService);
  private readonly toasts = inject(ToastService);

  readonly request = input.required<ServiceRequest>();
  readonly changed = output();

  protected readonly tab = signal<'public' | 'internal'>('public');
  protected readonly text = new FormControl('', { nonNullable: true });
  protected readonly sending = signal(false);

  protected readonly canInternal = computed(() => this.permissions.can('request.comment.internal'));
  protected readonly publicComments = computed(() => this.request().comments.filter((c) => !c.internal));
  protected readonly internalComments = computed(() => this.request().comments.filter((c) => c.internal));
  protected readonly shown = computed(() => (this.tab() === 'internal' && this.canInternal() ? this.internalComments() : this.publicComments()));
  protected readonly canWrite = computed(() => {
    if (isTerminal(this.request().status) && this.request().status !== 'closed') return false;
    return this.tab() === 'internal' ? this.canInternal() : this.permissions.can('request.comment.public');
  });

  protected send(): void {
    this.sending.set(true);
    this.requests.comment(this.request().id, this.text.value, this.tab() === 'internal' && this.canInternal()).subscribe({
      next: () => {
        this.sending.set(false);
        this.text.reset('');
        this.toasts.success('تمت إضافة التعليق');
        this.changed.emit();
      },
      error: (err) => {
        this.sending.set(false);
        this.requests.reportError(err, 'تعذر إضافة التعليق');
      },
    });
  }
}
