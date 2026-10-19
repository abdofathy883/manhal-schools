import { Directive, OnDestroy, OnInit, input } from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';

export type DetailsGroup = FormGroup<Record<string, AbstractControl>>;

/**
 * Base for the service-specific parts of the request form. Each section adds its controls to the
 * parent's `details` group when it appears and removes them when it goes away, so the parent form
 * validates and submits whatever the current service needs.
 */
@Directive()
export abstract class ServiceSectionBase implements OnInit, OnDestroy {
  readonly group = input.required<DetailsGroup>();
  readonly submitted = input(false);

  private added: string[] = [];

  protected abstract build(): Record<string, AbstractControl>;

  ngOnInit(): void {
    for (const [name, control] of Object.entries(this.build())) {
      this.group().addControl(name, control);
      this.added.push(name);
    }
  }

  ngOnDestroy(): void {
    for (const name of this.added) this.group().removeControl(name);
  }

  /** Show a field's error after it was touched or after a submit attempt. */
  protected bad(path: string | Array<string | number>): boolean {
    const control = this.group().get(path);
    return !!control && control.invalid && (control.touched || this.submitted());
  }
}
