import { joinHash, memoryStore, pageStore, splitHash } from "./hash";

function setHash(hash: string) {
  window.history.replaceState(null, "", `/civicrm/group?reset=1${hash}`);
}

describe("splitHash", () => {
  it("reads the parameters after the ? as $location does", () => {
    expect(splitHash("#?a=1&b=x%20y").params.toString()).toBe("a=1&b=x+y");
    const { path, params } = splitHash("#/contact/5?_s=2");
    expect(path).toBe("/contact/5");
    expect(params.get("_s")).toBe("2");
  });

  it("treats a hash without ? as a path without parameters", () => {
    expect(splitHash("#/list")).toEqual({ path: "/list", params: new URLSearchParams() });
    expect(splitHash("")).toEqual({ path: "", params: new URLSearchParams() });
  });
});

describe("joinHash", () => {
  it("puts the path back in front of the parameters", () => {
    expect(joinHash("/contact/5", new URLSearchParams("a=1"))).toBe("#/contact/5?a=1");
    expect(joinHash("", new URLSearchParams("a=1"))).toBe("#?a=1");
    expect(joinHash("/list", new URLSearchParams())).toBe("#/list");
    expect(joinHash("", new URLSearchParams())).toBe("");
  });
});

describe("pageStore", () => {
  afterEach(() => {
    setHash("");
  });

  it("writes with replaceState and keeps the path, the query string and other keys", () => {
    setHash("#/tab?_s=2&Individual1=7");
    const length = window.history.length;
    const params = pageStore.params();
    params.set("_page", "3");
    pageStore.write(params);
    expect(window.location.pathname + window.location.search).toBe("/civicrm/group?reset=1");
    expect(window.location.hash).toBe("#/tab?_s=2&Individual1=7&_page=3");
    expect(window.history.length).toBe(length);
  });

  it("hands out copies, so a caller's change is not a write", () => {
    setHash("#?a=1");
    pageStore.params().set("a", "2");
    expect(pageStore.params().get("a")).toBe("1");
  });

  it("tells subscribers about its own writes but external listeners only about others'", () => {
    const own = vi.fn<() => void>();
    const external = vi.fn<() => void>();
    const unsubscribe = pageStore.subscribe(own);
    const unlisten = pageStore.external(external);
    pageStore.write(new URLSearchParams("a=1"));
    expect(own).toHaveBeenCalledTimes(1);
    expect(external).not.toHaveBeenCalled();

    setHash("#?a=2");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(own).toHaveBeenCalledTimes(2);
    expect(external).toHaveBeenCalledTimes(1);
    unsubscribe();
    unlisten();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(own).toHaveBeenCalledTimes(2);
    expect(external).toHaveBeenCalledTimes(1);
  });

  it("leaves the history alone when nothing changes", () => {
    setHash("#?a=1");
    const listener = vi.fn<() => void>();
    const unsubscribe = pageStore.subscribe(listener);
    pageStore.write(new URLSearchParams("a=1"));
    setHash("");
    pageStore.write(new URLSearchParams());
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe("memoryStore", () => {
  it("starts from a popup's hash and keeps writes to itself", () => {
    setHash("#?a=page");
    const store = memoryStore("#/?a=popup");
    const listener = vi.fn<() => void>();
    store.subscribe(listener);
    store.write(new URLSearchParams("a=next"));
    expect(store.params().get("a")).toBe("next");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe("#?a=page");
    setHash("");
  });

  it("has no outside changes", () => {
    const store = memoryStore("");
    const listener = vi.fn<() => void>();
    store.external(listener)();
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(listener).not.toHaveBeenCalled();
  });
});
