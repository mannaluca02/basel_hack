import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-graphics-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>Graphics</h1>`,
})
export class GraphicsTab {}
