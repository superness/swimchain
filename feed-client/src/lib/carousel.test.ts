import { describe, it, expect } from 'vitest';
import { activeIndexFromScroll } from './carousel';

describe('activeIndexFromScroll', () => {
  it('returns 0 at scroll start', () => {
    expect(activeIndexFromScroll(0, 400, 4)).toBe(0);
  });

  it('rounds to the nearest slide', () => {
    expect(activeIndexFromScroll(390, 400, 4)).toBe(1);
    expect(activeIndexFromScroll(410, 400, 4)).toBe(1);
    expect(activeIndexFromScroll(199, 400, 4)).toBe(0);
    expect(activeIndexFromScroll(201, 400, 4)).toBe(1);
  });

  it('clamps to the last slide', () => {
    expect(activeIndexFromScroll(5000, 400, 4)).toBe(3);
  });

  it('clamps negative overscroll to 0', () => {
    expect(activeIndexFromScroll(-50, 400, 4)).toBe(0);
  });

  it('handles zero width and empty carousels', () => {
    expect(activeIndexFromScroll(100, 0, 4)).toBe(0);
    expect(activeIndexFromScroll(100, 400, 0)).toBe(0);
  });
});
