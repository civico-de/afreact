import { act, renderHook } from "@testing-library/react";
import { vi } from "vitest";
import { useDebounced } from "./common";

const setup = (value = "a") => {
  const commit = vi.fn<(value: string) => void>();
  const hook = renderHook((props: { value: string }) => useDebounced(props.value, commit), {
    initialProps: { value },
  });
  return { commit, ...hook };
};

describe("useDebounced", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the typing and commits it after two idle seconds", () => {
    const { commit, result, rerender } = setup();
    act(() => {
      result.current.onChange("ab");
    });
    expect(result.current.value).toBe("ab");
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(commit).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(commit).toHaveBeenCalledExactlyOnceWith("ab");
    expect(result.current.value).toBe("a");
    rerender({ value: "ab" });
    expect(result.current.value).toBe("ab");
  });

  it("starts the two seconds again on more typing", () => {
    const { commit, result } = setup();
    act(() => {
      result.current.onChange("x");
      vi.advanceTimersByTime(1500);
      result.current.onChange("xy");
      vi.advanceTimersByTime(1500);
    });
    expect(commit).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(commit).toHaveBeenCalledExactlyOnceWith("xy");
  });

  it("follows the value from outside unless typing is pending", () => {
    const { result, rerender } = setup();
    rerender({ value: "b" });
    expect(result.current.value).toBe("b");
    act(() => {
      result.current.onChange("typed");
    });
    rerender({ value: "c" });
    expect(result.current.value).toBe("typed");
  });

  it("commits on blur, the replacement in place of the typing", () => {
    const { commit, result } = setup();
    act(() => {
      result.current.onChange("q");
    });
    act(() => {
      result.current.onBlur();
    });
    expect(commit).toHaveBeenCalledExactlyOnceWith("q");
    act(() => {
      result.current.onChange("r");
    });
    act(() => {
      result.current.onBlur("R");
      vi.advanceTimersByTime(2000);
    });
    expect(commit.mock.calls).toEqual([["q"], ["R"]]);
  });

  it("shows text without committing it until blur shows the value again", () => {
    const { commit, result } = setup();
    act(() => {
      result.current.show("preview");
    });
    expect(result.current.value).toBe("preview");
    act(() => {
      result.current.onBlur();
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.value).toBe("a");
    expect(commit).not.toHaveBeenCalled();
  });

  it("commits through the latest callback", () => {
    const first = vi.fn<(value: string) => void>();
    const second = vi.fn<(value: string) => void>();
    const { result, rerender } = renderHook(
      (props: { commit: (value: string) => void }) => useDebounced("a", props.commit),
      { initialProps: { commit: first } },
    );
    act(() => {
      result.current.onChange("z");
    });
    rerender({ commit: second });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledExactlyOnceWith("z");
  });

  it("commits pending typing once on unmount", () => {
    const { commit, result, unmount } = setup();
    act(() => {
      result.current.onChange("kept");
    });
    unmount();
    vi.advanceTimersByTime(2000);
    expect(commit).toHaveBeenCalledExactlyOnceWith("kept");
  });

  it("commits nothing on unmount once the typing is committed", () => {
    const { commit, result, unmount } = setup();
    act(() => {
      result.current.onChange("done");
    });
    act(() => {
      result.current.onBlur();
    });
    unmount();
    expect(commit).toHaveBeenCalledExactlyOnceWith("done");
  });
});
