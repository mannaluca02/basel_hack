import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { InfoJump } from './info-jump';

describe('InfoJump', () => {
  it('stores the info card, opens the Info tab and hands the target over once', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', children: [] }])] });
    const jump = TestBed.inject(InfoJump);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    expect(jump.take()).toBeNull();

    jump.show('info_pillar_2');
    expect(navigate).toHaveBeenCalledWith('/info');
    expect(jump.pending()).toEqual({ infoId: 'info_pillar_2' });
    expect(jump.take()).toBe('info_pillar_2');
    expect(jump.pending()).toBeNull();
    expect(jump.take()).toBeNull();
  });

  it('notifies again for the same card twice in a row', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', children: [] }])] });
    const jump = TestBed.inject(InfoJump);
    jump.show('info_a');
    const first = jump.pending();
    jump.show('info_a');
    expect(jump.pending()).not.toBe(first);
  });
});
