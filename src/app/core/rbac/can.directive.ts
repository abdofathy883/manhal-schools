import { Directive, EmbeddedViewRef, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import { ScopedResource } from '../../domain/models/rbac';
import { PermissionService } from './permission.service';

/**
 * Structural directive that renders its template only when the user holds the permission.
 *
 *   <button *can="'request.reject'; resource: request">…</button>
 *   <section *can="['reports.executive', 'reports.fleet']">…</section>   (any of)
 */
@Directive({ selector: '[can]' })
export class CanDirective {
  private readonly permissions = inject(PermissionService);
  private readonly template = inject(TemplateRef<unknown>);
  private readonly container = inject(ViewContainerRef);
  private view: EmbeddedViewRef<unknown> | null = null;

  readonly can = input.required<string | readonly string[]>();
  readonly canResource = input<ScopedResource | undefined>(undefined);

  constructor() {
    effect(() => {
      const keys = this.can();
      const resource = this.canResource();
      const allowed = this.permissions.canAny(typeof keys === 'string' ? [keys] : keys, resource);
      if (allowed && !this.view) {
        this.view = this.container.createEmbeddedView(this.template);
      } else if (!allowed && this.view) {
        this.container.clear();
        this.view = null;
      }
    });
  }
}
