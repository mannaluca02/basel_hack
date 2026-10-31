import { TestBed } from '@angular/core/testing';
import { ViewScroller } from './view-scroller';

/** jsdom has no layout; the view's scroll metrics are set by hand. */
function view(scrollHeight: number, clientHeight: number, scrollTop: number): HTMLElement {
  const element = document.createElement('main');
  Object.defineProperty(element, 'scrollHeight', { value: scrollHeight });
  Object.defineProperty(element, 'clientHeight', { value: clientHeight });
  element.scrollTop = scrollTop;
  return element;
}

describe('ViewScroller', () => {
  let scroller: ViewScroller;

  beforeEach(() => {
    scroller = TestBed.inject(ViewScroller);
  });

  afterEach(() => scroller.detach());

  it('counts the last 120px as at the bottom', () => {
    scroller.attach(view(1000, 400, 480));
    expect(scroller.atBottom()).toBe(true);

    scroller.attach(view(1000, 400, 479));
    expect(scroller.atBottom()).toBe(false);
  });

  it('follows the user while they scroll', () => {
    const element = view(1000, 400, 0);
    scroller.attach(element);
    expect(scroller.atBottom()).toBe(false);

    element.scrollTop = 600;
    element.dispatchEvent(new Event('scroll'));
    expect(scroller.atBottom()).toBe(true);
  });

  it('reveals a card by scrolling the view only, never its ancestors', () => {
    const element = view(2000, 400, 300);
    const scrollTo = vi.fn();
    element.scrollTo = scrollTo;
    element.getBoundingClientRect = () => ({ top: 40 }) as DOMRect;
    const card = document.createElement('div');
    card.getBoundingClientRect = () => ({ top: 640 }) as DOMRect;
    card.scrollIntoView = vi.fn();
    scroller.attach(element);

    scroller.reveal(card, true);

    expect(scrollTo).toHaveBeenCalledWith({ top: 900, behavior: 'smooth' });
    expect(card.scrollIntoView).not.toHaveBeenCalled();
  });

  it('is unsettled from the start of a tab switch until the shell restored the offset', () => {
    const element = view(1000, 400, 0);
    scroller.attach(element);
    scroller.unsettle();
    expect(scroller.settled()).toBe(false);

    element.scrollTop = 600;
    scroller.settle();
    expect(scroller.settled()).toBe(true);
    expect(scroller.atBottom()).toBe(true);
  });
});
