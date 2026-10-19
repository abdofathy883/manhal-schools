import { Injectable } from '@angular/core';

/** Single source of "now" so seeds, SLA timers and booking rules can be tested deterministically. */
@Injectable({ providedIn: 'root' })
export class Clock {
  now(): Date {
    return new Date();
  }

  nowIso(): string {
    return this.now().toISOString();
  }
}
