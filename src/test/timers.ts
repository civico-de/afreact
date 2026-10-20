import { act } from "@testing-library/react";
import { vi } from "vitest";

/**
 * Fakes only the timeouts, so a test steps a debounce exactly. Testing Library's async helpers
 * and userEvent wait on a real timeout, so a test switches back before it awaits them.
 */
export const fakeTimeouts = () =>
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldClearNativeTimers: true });

/** Lets `ms` pass on the fake timers, then what that scheduled for the next tick. */
export function passTime(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
  act(() => {
    vi.advanceTimersByTime(0);
  });
}
