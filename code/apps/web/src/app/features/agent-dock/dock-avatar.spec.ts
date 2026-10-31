import { TestBed } from '@angular/core/testing';
import { DockAvatar } from './dock-avatar';

describe('DockAvatar', () => {
  it('keeps the placeholder figure while the renderer is not available, and stays decorative', async () => {
    const fixture = TestBed.createComponent(DockAvatar);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('.placeholder')).not.toBeNull();
  });
});
