import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MotionPreference } from './motion-preference';

/** A media query list we can switch, like the OS setting. */
function fakeQuery(matches: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  return {
    matches,
    addEventListener: (_: string, listener: (event: { matches: boolean }) => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: (event: { matches: boolean }) => void) => listeners.delete(listener),
    change: (next: boolean) => listeners.forEach((listener) => listener({ matches: next })),
    listeners,
  };
}

describe('MotionPreference', () => {
  function create(view: unknown) {
    TestBed.configureTestingModule({ providers: [{ provide: DOCUMENT, useValue: { defaultView: view } }] });
    return TestBed.inject(MotionPreference);
  }

  it('follows the OS setting and stops listening when destroyed', () => {
    const query = fakeQuery(true);
    const motion = create({ matchMedia: () => query });
    expect(motion.reduced()).toBe(true);
    query.change(false);
    expect(motion.reduced()).toBe(false);
    TestBed.resetTestingModule();
    expect(query.listeners.size).toBe(0);
  });

  it('assumes full motion where the browser has no media queries', () => {
    expect(create({}).reduced()).toBe(false);
    TestBed.resetTestingModule();
    expect(create(null).reduced()).toBe(false);
  });
});
