import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { ECharts, EChartsInitOpts } from 'echarts/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { ChartOption } from './chart-options';

/**
 * The drawn chart of a card. Purely visual (`aria-hidden`): the card's legend and data table
 * carry the same content as text.
 *
 * ngx-echarts redraws from scratch whenever `options` changes. So the first option creates the
 * chart, and every later one is merged into it: series keep their ids, ECharts animates the new
 * values in place, and the card is never rebuilt (FE-11 real-time updates).
 */
@Component({
  selector: 'app-chart-canvas',
  imports: [NgxEchartsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `<div
    echarts
    class="canvas"
    [options]="initialOption()"
    [initOpts]="initOpts"
    (chartInit)="chart.set($event)"
  ></div>`,
  styles: `
    :host {
      display: block;
    }

    .canvas {
      width: 100%;
      height: 100%;
    }
  `,
})
export class ChartCanvas {
  readonly option = input.required<ChartOption>();

  protected readonly initOpts: EChartsInitOpts = { renderer: 'svg' };
  /** Read once: later values go through the merge below, not through a redraw. */
  protected readonly initialOption = computed(() => untracked(this.option));
  protected readonly chart = signal<ECharts | null>(null);

  constructor() {
    effect(() => {
      const chart = this.chart();
      const option = this.option();
      if (!chart || chart.isDisposed()) return;
      // ngx-echarts has just drawn this one; merging it again would only repeat the work.
      if (option === this.initialOption()) return;
      // `replaceMerge` drops series the new option no longer has; the others merge by id.
      chart.setOption(option, { replaceMerge: ['series'] });
    });
  }
}
