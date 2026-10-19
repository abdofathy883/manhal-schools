import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { SCOPE_LABELS, User } from '../../domain/models/rbac';
import { PERMISSION_MODULES } from '../../domain/permission-catalog';
import { SERVICE_BY_KEY } from '../../domain/reference-data';
import { ServiceKey } from '../../domain/models/request';
import { MockDb } from '../mock-db/mock-db.service';
import { placeOf } from '../demo-mode/demo-mode.service';
import { MENU } from '../layout/menu.config';
import { computeEffective } from './effective';
import { listEffective, visibleMenuFor } from './permission.service';

interface ModuleRow {
  module: string;
  items: Array<{ label: string; scope: string | null; services: string | null }>;
}

/** "What can this user do?" — roles, scopes, menus and permissions of any user. Used by the demo bar and RBAC admin. */
@Component({
  selector: 'app-effective-permissions-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="d-flex align-items-center gap-3 mb-3">
      <span
        class="rounded-circle d-inline-flex align-items-center justify-content-center text-white fw-bold fs-5 flex-shrink-0"
        style="inline-size: 3rem; block-size: 3rem"
        [style.background]="user().avatarColor"
        aria-hidden="true"
        >{{ user().nameAr.charAt(0) }}</span
      >
      <div>
        <div class="fw-bold">{{ user().nameAr }}</div>
        <div class="small text-muted-ar">{{ user().jobTitleAr }} · {{ place() }}</div>
      </div>
    </div>

    <h3 class="h6">الأدوار</h3>
    <div class="d-flex flex-wrap gap-2 mb-3">
      @for (r of roles(); track r.id) {
        <span class="badge bg-primary-subtle text-primary-emphasis">{{ r.nameAr }}</span>
      }
    </div>

    <h3 class="h6">القوائم المتاحة ({{ menu().length }})</h3>
    <div class="d-flex flex-wrap gap-2 mb-3">
      @for (m of menu(); track m.route) {
        <span class="badge bg-body-secondary text-body border"><i class="bi me-1" [class]="m.icon" aria-hidden="true"></i>{{ m.label }}</span>
      }
    </div>

    <h3 class="h6">الصلاحيات والنطاق</h3>
    @for (g of modules(); track g.module) {
      <div class="mb-3">
        <div class="small fw-bold text-info-emphasis mb-1">{{ g.module }}</div>
        <ul class="list-unstyled small m-0">
          @for (p of g.items; track $index) {
            <li class="d-flex justify-content-between gap-2 py-1 border-bottom">
              <span>{{ p.label }}@if (p.services) { <span class="text-muted-ar"> ({{ p.services }})</span> }</span>
              @if (p.scope) {
                <span class="badge bg-info-subtle text-info-emphasis flex-shrink-0">{{ p.scope }}</span>
              }
            </li>
          }
        </ul>
      </div>
    } @empty {
      <p class="text-muted-ar">لا توجد صلاحيات لهذا المستخدم.</p>
    }
  `,
})
export class EffectivePermissionsPanelComponent {
  private readonly db = inject(MockDb);

  readonly user = input.required<User>();

  protected readonly place = computed(() => placeOf(this.user()));
  protected readonly roles = computed(() => this.db.roles().filter((r) => this.user().roleIds.includes(r.id)));
  private readonly effective = computed(() => computeEffective(this.user().roleIds, this.db.roles()));
  protected readonly menu = computed(() => visibleMenuFor(this.effective(), MENU));

  protected readonly modules = computed<ModuleRow[]>(() => {
    const rows = listEffective(this.effective());
    return PERMISSION_MODULES.map((module) => ({
      module,
      items: rows
        .filter((r) => r.def.module === module)
        .map((r) => ({
          label: r.def.label,
          scope: r.scope ? SCOPE_LABELS[r.scope] : null,
          services: r.services ? r.services.map((s) => SERVICE_BY_KEY[s as ServiceKey]?.nameAr ?? s).join('، ') : null,
        })),
    })).filter((g) => g.items.length > 0);
  });
}
