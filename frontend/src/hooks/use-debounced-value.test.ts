import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedValue } from './use-debounced-value';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useDebouncedValue', () => {
  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('a', 300));
    expect(result.current).toBe('a');
  });

  it('holds the previous value until the delay elapses, then updates', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: 'a' },
    });

    rerender({ v: 'ab' });
    expect(result.current).toBe('a'); // not yet

    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe('a');

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('ab');
  });

  it('only emits the last value when it changes several times within one window', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: 'a' },
    });

    rerender({ v: 'ab' });
    act(() => vi.advanceTimersByTime(150));
    rerender({ v: 'abc' });
    act(() => vi.advanceTimersByTime(150)); // 300ms since first change, but only 150 since last
    expect(result.current).toBe('a');

    act(() => vi.advanceTimersByTime(150)); // now 300ms since the 'abc' change
    expect(result.current).toBe('abc');
  });

  it('respects a custom delay', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 1000), {
      initialProps: { v: 'x' },
    });
    rerender({ v: 'y' });
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe('x');
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe('y');
  });
});
