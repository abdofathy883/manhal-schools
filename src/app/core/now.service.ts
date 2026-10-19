import { Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';

/** A shared "now" that ticks every 15 seconds so SLA countdowns stay live without per-component timers. */
@Injectable({ providedIn: 'root' })
export class NowService {
  private readonly _now = signal(new Date());
  readonly now = this._now.asReadonly();

  constructor() {
    interval(15_000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this._now.set(new Date()));
  }
}
