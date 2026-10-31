import { Component, Directive, input, output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { ECharts } from 'echarts/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { ChartCanvas } from './chart-canvas';
import { ChartOption } from './chart-options';

/** Stands in for ngx-echarts: jsdom cannot draw, and the spec hands over the chart itself. */
@Directive({ selector: '[echarts]' })
class EchartsStub {
  readonly options = input<ChartOption>();
  readonly initOpts = input<unknown>();
  readonly chartInit = output<ECharts>();
}

@Component({
  imports: [ChartCanvas],
  template: `<app-chart-canvas [option]="option()" />`,
})
class Host {
  readonly option = signal<ChartOption>(revision(1));
}

function revision(value: number): ChartOption {
  return { series: [{ id: 'pillar1', type: 'bar', data: [value] }] };
}

describe('ChartCanvas', () => {
  let fixture: ComponentFixture<Host>;
  let echarts: EchartsStub;
  let chart: { setOption: ReturnType<typeof vi.fn>; isDisposed: () => boolean };

  beforeEach(async () => {
    TestBed.overrideComponent(ChartCanvas, {
      remove: { imports: [NgxEchartsDirective] },
      add: { imports: [EchartsStub] },
    });
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    echarts = fixture.debugElement.query(By.directive(EchartsStub)).injector.get(EchartsStub);
    chart = { setOption: vi.fn(), isDisposed: () => false };
  });

  async function init() {
    echarts.chartInit.emit(chart as unknown as ECharts);
    await fixture.whenStable();
  }

  async function update(option: ChartOption) {
    fixture.componentInstance.option.set(option);
    await fixture.whenStable();
  }

  it('lets ngx-echarts draw the first option, without merging it again', async () => {
    const first = fixture.componentInstance.option();
    await init();
    expect(echarts.options()).toBe(first);
    expect(chart.setOption).not.toHaveBeenCalled();
  });

  it('merges every update into the drawn chart instead of redrawing it', async () => {
    const first = fixture.componentInstance.option();
    await init();

    const second = revision(2);
    await update(second);
    expect(chart.setOption).toHaveBeenCalledExactlyOnceWith(second, { replaceMerge: ['series'] });

    const third = revision(3);
    await update(third);
    expect(chart.setOption).toHaveBeenLastCalledWith(third, { replaceMerge: ['series'] });
    expect(chart.setOption).toHaveBeenCalledTimes(2);
    // ngx-echarts would rebuild the chart on a new `options` input; it keeps the first.
    expect(echarts.options()).toBe(first);
  });

  it('leaves a disposed chart alone', async () => {
    chart.isDisposed = () => true;
    await init();
    await update(revision(2));
    expect(chart.setOption).not.toHaveBeenCalled();
  });
});
