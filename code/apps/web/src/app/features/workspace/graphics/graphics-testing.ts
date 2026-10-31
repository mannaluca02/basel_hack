import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChartCanvas } from './chart-canvas';
import { ChartCard } from './chart-card';
import { ChartOption } from './chart-options';
import { GraphicsTab } from './graphics-tab';

/** Stands in for the ECharts canvas: ECharts needs layout and ResizeObserver, jsdom has neither. */
@Component({ selector: 'app-chart-canvas', template: '' })
class ChartCanvasStub {
  readonly option = input<ChartOption>();
}

/**
 * For specs: renders chart cards without ECharts; the option itself is covered by the
 * `buildChartView` specs. Call before `TestBed.createComponent`. Only imported by specs, so not
 * in the app bundle.
 */
export function stubChartCanvas(): void {
  TestBed.overrideComponent(ChartCard, {
    remove: { imports: [ChartCanvas] },
    add: { imports: [ChartCanvasStub] },
  });
  // TestBed only rebuilds the components it overrides. A standalone parent keeps the template it
  // compiled in an earlier spec (app.spec renders the Graphics tab through the router), and that
  // template still points at the real card. An empty override recompiles it against the stub.
  TestBed.overrideComponent(GraphicsTab, {});
}
