import { Injectable, signal } from '@angular/core';

/** Bumped after every write so list/detail resources re-fetch (the mock has no push channel). */
@Injectable({ providedIn: 'root' })
export class DataVersion {
  private readonly _value = signal(0);
  readonly value = this._value.asReadonly();

  bump(): void {
    this._value.update((v) => v + 1);
  }
}
