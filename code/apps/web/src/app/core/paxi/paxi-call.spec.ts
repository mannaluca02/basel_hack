import { Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { LiveVoice } from '../voice/live-voice';
import { startPaxiWhenReady } from './paxi-call';

describe('startPaxiWhenReady', () => {
  function fakeLive() {
    return {
      active: signal(false),
      handoverActive: signal(false),
      available: signal(false),
      validPerson: signal(false),
      busy: signal(false),
      consent: signal(false),
      extractionConsent: signal(false),
      start: vi.fn(() => Promise.resolve()),
    };
  }

  function watch(live: ReturnType<typeof fakeLive>) {
    const done = vi.fn();
    startPaxiWhenReady(live as unknown as LiveVoice, TestBed.inject(Injector), done);
    TestBed.tick();
    return done;
  }

  const ready = (live: ReturnType<typeof fakeLive>) => {
    live.available.set(true);
    live.validPerson.set(true);
    TestBed.tick();
  };

  afterEach(() => vi.useRealTimers());

  it('waits for the case, then gives both voice consents and starts the call once', async () => {
    const live = fakeLive();
    const done = watch(live);
    expect(live.start).not.toHaveBeenCalled();

    ready(live);
    live.available.set(false);
    TestBed.tick();
    live.available.set(true);
    TestBed.tick();

    expect(live.consent()).toBe(true);
    expect(live.extractionConsent()).toBe(true);
    expect(live.start).toHaveBeenCalledOnce();
    // Done only once the start is over, so the shell shows no hint in between.
    await vi.waitFor(() => expect(done).toHaveBeenCalledOnce());
  });

  it('is done also when the start fails, without an unhandled rejection', async () => {
    const live = fakeLive();
    live.start.mockReturnValue(Promise.reject(new Error('NotAllowedError')));
    const done = watch(live);

    ready(live);
    await vi.waitFor(() => expect(done).toHaveBeenCalledOnce());
  });

  it('waits while the case is busy', () => {
    const live = fakeLive();
    live.busy.set(true);
    watch(live);

    ready(live);
    expect(live.start).not.toHaveBeenCalled();

    live.busy.set(false);
    TestBed.tick();
    expect(live.start).toHaveBeenCalledOnce();
  });

  it.each([
    ['a call already runs', 'active'],
    ['a human advisor took over', 'handoverActive'],
  ] as const)('leaves the start to the microphone button when %s', (_, blocker) => {
    const live = fakeLive();
    const done = watch(live);
    live[blocker].set(true);
    TestBed.tick();

    live[blocker].set(false);
    ready(live);

    expect(live.start).not.toHaveBeenCalled();
    expect(live.consent()).toBe(false);
    expect(done).toHaveBeenCalledOnce();
  });

  it('stops waiting after a minute', () => {
    vi.useFakeTimers();
    const live = fakeLive();
    const done = watch(live);

    vi.advanceTimersByTime(60_000);
    ready(live);

    expect(live.start).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledOnce();
  });
});
