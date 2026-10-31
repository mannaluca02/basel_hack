import { TestBed } from '@angular/core/testing';
import { PAX_LOGO_LETTERS } from '../../core/brand/pax-logo';
import { LogoIntro } from './logo-intro';

describe('LogoIntro', () => {
  async function render() {
    const fixture = TestBed.createComponent(LogoIntro);
    await fixture.whenStable();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('shows the official logo with the "." asleep, hidden from screen readers', async () => {
    const { root } = await render();

    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('.letters')?.getAttribute('d')).toBe(PAX_LOGO_LETTERS);
    expect(root.querySelectorAll('.sleeper .dot')).toHaveLength(1);
    expect(root.querySelectorAll('.sleeper .eye')).toHaveLength(2);
  });

  // jsdom has no Web Animations API: the same path as without motion, minus the fade.
  it('without animations reveals Paxi at once and is done', async () => {
    const { fixture } = await render();
    const reveal = vi.fn();

    await fixture.componentInstance.wake(new DOMRect(100, 100, 60, 60), reveal);

    expect(reveal).toHaveBeenCalledOnce();
  });
});
