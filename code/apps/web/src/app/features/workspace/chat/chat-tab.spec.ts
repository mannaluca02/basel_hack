import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AdvisorDataSource } from '../../../core/advisor/advisor-data-source';
import { CaseStore } from '../../../core/advisor/store/case-store';
import { FakeDataSource, event, line, snapshot } from '../../../core/advisor/store/case-testing';
import { TranscriptEntry } from '../../../core/advisor/ui-models';
import { Consent } from '../../../core/consent/consent';
import { provideI18nTesting } from '../../../core/i18n/i18n-testing';
import { ViewScroller } from '../../../core/layout/view-scroller';
import { ChatTab } from './chat-tab';

/** The Dynamic View, driven by hand: where the user is reading, and whether a tab switch runs. */
class FakeScroller {
  readonly atBottom = signal(true);
  readonly settled = signal(true);
  /** What `measure()` reports for the position before a new line renders. */
  nearBottom = true;
  readonly measure = vi.fn(() => this.nearBottom);
  readonly scrollToEnd = vi.fn();
  readonly reveal = vi.fn();
}

/** Nests the tab below an OnPush parent like the shell does. */
@Component({
  imports: [ChatTab],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-chat-tab />`,
})
class Shell {}

const customer = (n: number, overrides: Partial<TranscriptEntry> = {}) =>
  line({ entryId: `entry_customer_${n}`, turnId: `turn_${n}`, speaker: 'customer', ...overrides });
const agent = (n: number, overrides: Partial<TranscriptEntry> = {}) =>
  line({ entryId: `entry_agent_${n}`, turnId: `turn_${n}`, speaker: 'agent', ...overrides });

describe('ChatTab', () => {
  let source: FakeDataSource;
  let scroller: FakeScroller;
  let fixture: ComponentFixture<Shell>;
  let root: HTMLElement;

  async function start(initial: readonly TranscriptEntry[] = [], { settled = true } = {}) {
    source = new FakeDataSource();
    source.nextSnapshot = of(snapshot({ transcript: initial }));
    scroller = new FakeScroller();
    scroller.settled.set(settled);
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        { provide: AdvisorDataSource, useValue: source },
        { provide: ViewScroller, useValue: scroller },
      ],
    });
    sessionStorage.clear();
    TestBed.inject(Consent).grant();
    TestBed.inject(CaseStore).connect();
    fixture = TestBed.createComponent(Shell);
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  }

  async function emit(...lines: TranscriptEntry[]) {
    source.emit(...lines.map((l) => event('transcript', l)));
    await fixture.whenStable();
  }

  /** The user has scrolled up to read. */
  function scrollUp() {
    scroller.nearBottom = false;
    scroller.atBottom.set(false);
  }

  const squash = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim();
  const lines = () => [...root.querySelectorAll<HTMLElement>('.line')];
  const ids = () => lines().map((el) => el.dataset['entryId']);
  const lineOf = (entryId: string) =>
    root.querySelector<HTMLElement>(`.line[data-entry-id="${entryId}"]`);
  const pill = () => root.querySelector<HTMLButtonElement>('.pill');
  const liveText = () => root.querySelector('[aria-live]')?.textContent;
  const live = () => squash(liveText());

  it('shows an empty state until the call has lines', async () => {
    await start();
    expect(root.querySelector('.empty')?.textContent).toContain('sobald der Anruf beginnt');

    await emit(agent(1, { text: 'Grüezi' }));

    expect(root.querySelector('.empty')).toBeNull();
  });

  it('renders customer and agent bubbles in call order with speaker and time', async () => {
    await start([agent(1, { text: 'Wie viel verdienen Sie?' }), customer(1, { text: '100k' })]);

    expect(ids()).toEqual(['entry_agent_1', 'entry_customer_1']);
    const [first, second] = lines();
    expect(first.classList).not.toContain('line--customer');
    expect(second.classList).toContain('line--customer');
    expect(squash(first.querySelector('.speaker')?.textContent)).toBe('Assistent');
    expect(squash(second.querySelector('.speaker')?.textContent)).toBe('Sie');
    expect(squash(second.querySelector('.bubble')?.textContent)).toBe('100k');
    const time = first.querySelector('time');
    expect(time?.getAttribute('datetime')).toBe('2026-10-31T10:00:00.000Z');
    expect(time?.textContent).toMatch(/\d{1,2}:\d{2}/);
  });

  it('draws an interim line as a draft and turns it final in place', async () => {
    await start();
    await emit(customer(1, { status: 'interim', text: 'Wir sind' }));

    const draft = lineOf('entry_customer_1');
    expect(draft?.classList).toContain('line--interim');
    expect(squash(draft?.querySelector('.visually-hidden')?.textContent)).toBe(
      '(wird noch transkribiert)',
    );

    await emit(customer(1, { status: 'final', text: 'Wir sind verheiratet.' }));

    expect(lineOf('entry_customer_1')).toBe(draft);
    expect(draft?.classList).not.toContain('line--interim');
    expect(squash(draft?.querySelector('.bubble')?.textContent)).toBe('Wir sind verheiratet.');
    expect(lines()).toHaveLength(1);
  });

  it('announces final lines only, not drafts or the starting snapshot', async () => {
    await start([agent(1, { text: 'Grüezi' })]);
    expect(live()).toBe('');

    await emit(customer(1, { status: 'interim', text: 'Wir' }));
    expect(live()).toBe('');

    await emit(customer(1, { status: 'final', text: 'Wir sind verheiratet.' }));
    expect(live()).toBe('Sie: Wir sind verheiratet.');

    await emit(agent(2, { text: 'Danke.' }));
    expect(live()).toBe('Assistent: Danke.');
  });

  it('reads the same final line again when it arrives twice in a row', async () => {
    await start();
    await emit(customer(1, { text: 'Ja.' }));
    const first = liveText();

    await emit(customer(2, { text: 'Ja.' }));

    expect(live()).toBe('Sie: Ja.');
    expect(liveText()).not.toBe(first);
  });

  it('opens at the latest line', async () => {
    await start([agent(1), customer(1)]);

    expect(scroller.scrollToEnd).toHaveBeenCalledWith(false);
  });

  it('waits until the shell has restored the scroll offset before opening at the latest line', async () => {
    await start([agent(1), customer(1)], { settled: false });
    expect(scroller.scrollToEnd).not.toHaveBeenCalled();

    scroller.settled.set(true);
    await fixture.whenStable();

    expect(scroller.scrollToEnd).toHaveBeenCalledWith(false);
  });

  it('follows new lines while the user is at the bottom, without smooth scrolling', async () => {
    await start();
    scroller.scrollToEnd.mockClear();

    await emit(agent(1));

    expect(scroller.measure).toHaveBeenCalled();
    // A smooth scroll still running when the next line arrives would read as "scrolled up".
    expect(scroller.scrollToEnd).toHaveBeenCalledExactlyOnceWith(false);
    expect(pill()).toBeNull();
  });

  it('keeps following a draft as it grows', async () => {
    await start([customer(1, { status: 'interim', text: 'Wir' })]);
    scroller.scrollToEnd.mockClear();

    await emit(customer(1, { status: 'interim', text: 'Wir sind verheiratet und' }));

    expect(scroller.scrollToEnd).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('offers "jump to latest" instead of scrolling when the user has scrolled up', async () => {
    await start([agent(1)]);
    scroller.scrollToEnd.mockClear();
    scrollUp();

    await emit(customer(1));

    expect(scroller.scrollToEnd).not.toHaveBeenCalled();
    expect(squash(pill()?.textContent)).toBe('Zum Neuesten');
  });

  it('does not offer the pill for a draft that only grows', async () => {
    await start([customer(1, { status: 'interim', text: 'Wir' })]);
    scrollUp();

    await emit(customer(1, { status: 'interim', text: 'Wir sind' }));

    expect(pill()).toBeNull();
  });

  it('jumps to the latest line and focuses it', async () => {
    await start([agent(1)]);
    scrollUp();
    await emit(customer(1), agent(2));
    scroller.scrollToEnd.mockClear();

    pill()?.click();
    await fixture.whenStable();

    // Instant: a line arriving during a smooth scroll would read as "scrolled up" again.
    expect(scroller.scrollToEnd).toHaveBeenCalledExactlyOnceWith(false);
    expect(document.activeElement).toBe(lineOf('entry_agent_2'));
    expect(pill()).toBeNull();
  });

  it('keeps the pill while another tab, shown at its bottom, holds the view', async () => {
    await start([agent(1)]);
    scrollUp();
    await emit(customer(1));
    expect(pill()).not.toBeNull();

    // Keep-alive: the tab is detached, and the shared view now shows another tab's bottom.
    const parent = root.parentElement!;
    root.remove();
    scroller.atBottom.set(true);
    await fixture.whenStable();
    parent.append(root);
    await fixture.whenStable();

    expect(pill()).not.toBeNull();
  });

  it('hides the pill once the user scrolls to the bottom', async () => {
    await start([agent(1)]);
    scrollUp();
    await emit(customer(1));
    expect(pill()).not.toBeNull();

    scroller.atBottom.set(true);
    await fixture.whenStable();

    expect(pill()).toBeNull();
  });

  it('does not scroll while the shell switches tabs', async () => {
    await start([agent(1)]);
    scroller.scrollToEnd.mockClear();
    scroller.settled.set(false);

    await emit(customer(1));

    expect(scroller.scrollToEnd).not.toHaveBeenCalled();
    expect(pill()).not.toBeNull();
  });

  it('renders a 50-line call', async () => {
    const call = Array.from({ length: 25 }, (_, i) => [
      agent(i, { text: `Frage ${i}` }),
      customer(i, { text: `Antwort ${i}` }),
    ]).flat();
    await start(call.slice(0, 40));
    await emit(...call.slice(40));

    expect(lines()).toHaveLength(50);
    expect(ids().at(-1)).toBe('entry_customer_24');
  });
});
