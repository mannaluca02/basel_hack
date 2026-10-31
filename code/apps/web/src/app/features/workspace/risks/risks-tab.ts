import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-risks-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>Risks</h1>`,
})
export class RisksTab {}
