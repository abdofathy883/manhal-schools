import { Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap, timer } from 'rxjs';
import { ServiceRequest } from '../../domain/models/request';
import { AuditRepository, Directory, NotificationRepository, RequestRepository } from '../../domain/repositories';
import { EngineContext, EngineResult, sweepSla } from '../../domain/workflows/engine';
import { Clock } from '../clock.service';
import { DataVersion } from '../data-version';
import { SettingsStore } from '../settings-store';

const SYSTEM = { id: 'system', nameAr: 'النظام' } as const;

/**
 * Background job (the "server"): every 30 seconds it flags open requests whose SLA ran out,
 * escalates them, and stores the resulting notifications and audit entries.
 */
@Injectable({ providedIn: 'root' })
export class SlaMonitor {
  private readonly requests = inject(RequestRepository);
  private readonly notifications = inject(NotificationRepository);
  private readonly audit = inject(AuditRepository);
  private readonly directory = inject(Directory);
  private readonly settings = inject(SettingsStore);
  private readonly clock = inject(Clock);
  private readonly version = inject(DataVersion);

  constructor() {
    timer(3000, 30_000)
      .pipe(
        switchMap(() => this.sweepOnce()),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  /** Runs one sweep; exposed for tests and for the guided scenario. */
  sweepOnce() {
    const results: EngineResult[] = [];
    const { approvalLimits, slaHours } = this.settings.settings();
    const ctx: EngineContext = {
      actor: SYSTEM,
      actorRoleAr: 'النظام',
      can: () => false,
      now: this.clock.now(),
      limits: approvalLimits,
      slaHours,
      usersWith: (key, resource) => this.directory.usersWith(key, resource),
      roleUsers: (roleId) => this.directory.roleUsers(roleId),
    };
    return this.requests
      .sweep((r: ServiceRequest) => {
        const res = sweepSla(r, ctx);
        if (res) results.push(res);
        return res?.request ?? null;
      })
      .pipe(
        switchMap((changed) => {
          if (!changed.length) return [undefined];
          const at = this.clock.nowIso();
          this.version.bump();
          return this.notifications
            .add(
              results.flatMap((res) =>
                res.notifications.map((n) => ({
                  userId: n.userId,
                  kind: n.kind,
                  titleAr: n.titleAr,
                  bodyAr: n.bodyAr,
                  at,
                  read: false,
                  requestId: res.request.id,
                  channels: n.channels,
                })),
              ),
            )
            .pipe(
              switchMap(() =>
                this.audit.add(
                  results.flatMap((res) =>
                    res.audit.map((a) => ({
                      at,
                      actorId: null,
                      actorName: 'النظام',
                      actionAr: a.actionAr,
                      entityType: a.entityType,
                      entityId: res.request.id,
                      summaryAr: a.summaryAr,
                    })),
                  ),
                ),
              ),
            );
        }),
      );
  }
}
