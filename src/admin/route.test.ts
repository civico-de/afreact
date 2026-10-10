import { act, renderHook } from "@testing-library/react";
import { firstMatch, matchRoute, navigate, useHashPath } from "./route";

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

describe("useHashPath", () => {
  it("follows the hash without its parameters", async () => {
    window.location.hash = "#/list?tab=custom";
    const { result } = renderHook(() => useHashPath());
    expect(result.current).toBe("/list");
    await act(async () => {
      navigate("/edit/3");
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect(result.current).toBe("/edit/3");
  });
});
