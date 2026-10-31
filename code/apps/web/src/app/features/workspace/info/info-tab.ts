import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-info-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>Info</h1>`,
})
export class InfoTab {}
