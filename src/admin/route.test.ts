import { act, renderHook } from "@testing-library/react";
import { firstMatch, matchRoute, navigate, useGuardedHashPath } from "./route";

describe("matchRoute", () => {
  it("reads named segments and refuses other lengths or literals", () => {
    expect(matchRoute("/edit/:id", "/edit/5")).toEqual({ id: "5" });
    expect(matchRoute("/edit/:id", "/edit")).toBeNull();
    expect(matchRoute("/edit/:id", "/clone/5")).toBeNull();
    expect(matchRoute("/edit/:id", "/edit/")).toBeNull();
    expect(matchRoute("/display/:search/:display", "/display/a%20b/c")).toEqual({
      search: "a b",
      display: "c",
    });
  });

  it("takes the first matching route", () => {
    const routes = { list: "/list", edit: "/edit/:id" } as const;
    expect(firstMatch(routes, "/edit/7")).toEqual({ name: "edit", params: { id: "7" } });
    expect(firstMatch(routes, "/nope")).toBeNull();
  });
});

const tick = () =>
  act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });

describe("useGuardedHashPath", () => {
  it("follows the hash without its parameters", async () => {
    window.location.hash = "#/list?tab=custom";
    const { result } = renderHook(() => useGuardedHashPath());
    expect(result.current.path).toBe("/list");
    navigate("/edit/3");
    await tick();
    expect(result.current.path).toBe("/edit/3");
  });

  it("keeps the screen and its address when the guard refuses", async () => {
    window.location.hash = "#/edit/3";
    const { result } = renderHook(() => useGuardedHashPath());
    act(() => {
      result.current.setGuard(() => false);
    });
    const entries = window.history.length;
    navigate("/list");
    await tick();
    await tick();
    expect(result.current.path).toBe("/edit/3");
    expect(window.location.hash).toBe("#/edit/3");
    // Stepping back keeps the earlier entries; the refused one stays only ahead.
    expect(window.history.length).toBe(entries + 1);
    act(() => {
      result.current.setGuard(() => true);
    });
    navigate("/list");
    await tick();
    expect(result.current.path).toBe("/list");
  });
});
