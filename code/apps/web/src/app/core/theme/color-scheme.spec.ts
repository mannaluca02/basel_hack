import { computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ColorScheme } from './color-scheme';

/** Stands in for the OS: jsdom has no matchMedia. */
class FakeMediaQuery extends EventTarget {
  constructor(public matches: boolean) {
    super();
  }

  switchTo(dark: boolean): void {
    this.matches = dark;
    this.dispatchEvent(Object.assign(new Event('change'), { matches: dark }));
  }
}

describe('ColorScheme', () => {
  let query: FakeMediaQuery;
  const root = document.documentElement;

  function setup(dark: boolean): ColorScheme {
    query = new FakeMediaQuery(dark);
    vi.spyOn(window, 'matchMedia').mockImplementation((media) => {
      expect(media).toBe('(prefers-color-scheme: dark)');
      return query as unknown as MediaQueryList;
    });
    return TestBed.inject(ColorScheme);
  }

  beforeEach(() => {
    // jsdom lacks the property entirely, so spyOn needs something to wrap.
    window.matchMedia ??= () => {
      throw new Error('matchMedia not stubbed');
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    root.style.removeProperty('--chart-1');
  });

  it('starts with the current OS scheme', () => {
    expect(setup(true).scheme()).toBe('dark');
  });

  it('follows the OS when it switches, without reload', () => {
    const colorScheme = setup(false);
    expect(colorScheme.scheme()).toBe('light');

    query.switchTo(true);
    expect(colorScheme.scheme()).toBe('dark');

    query.switchTo(false);
    expect(colorScheme.scheme()).toBe('light');
  });

  it('re-resolves tokens read inside a computed when the scheme changes', () => {
    const colorScheme = setup(false);
    root.style.setProperty('--chart-1', ' light-chart-1 ');
    const chartColor = computed(() => colorScheme.token('--chart-1'));
    expect(chartColor()).toBe('light-chart-1');

    // Simulates the dark media block taking effect before the change event fires.
    root.style.setProperty('--chart-1', 'dark-chart-1');
    query.switchTo(true);
    expect(chartColor()).toBe('dark-chart-1');
  });

  it('stops listening when the injector is destroyed', () => {
    const colorScheme = setup(false);
    TestBed.resetTestingModule();

    query.switchTo(true);
    expect(colorScheme.scheme()).toBe('light');
  });
});
