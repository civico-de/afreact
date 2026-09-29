import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { parseAsString, useQueryStates } from "nuqs";
import { events } from "../test/jquery";
import { memoryStore, pageStore } from "./hash";
import { DisplayCountContext, isOnlyElement, storeFor, UrlState, useUrlPrefix } from "./UrlState";

function Sort({ label }: { label: string }) {
  const [{ sort }, setUrl] = useQueryStates(
    { sort: parseAsString },
    { urlKeys: { sort: "_sort" } },
  );
  return (
    <button
      type="button"
      onClick={() => {
        void setUrl({ sort: `${label}-sort` });
      }}
    >
      {label}: {sort ?? "none"}
    </button>
  );
}

function Prefix({ name }: { name: string }) {
  return <span>prefix[{useUrlPrefix(name)}]</span>;
}

function byId(id: string): Element {
  const element = document.getElementById(id);
  if (!element) throw new Error(`No element #${id}`);
  return element;
}

function setHash(hash: string) {
  window.history.replaceState(null, "", `/civicrm/group${hash}`);
}

afterEach(() => {
  setHash("");
  document.body.innerHTML = "";
});

describe("UrlState", () => {
  it("lets separate React roots on the page see each other's writes", async () => {
    setHash("#/tab?_s=2&Individual1=7");
    render(
      <UrlState store={pageStore} onlyElement={false}>
        <Sort label="a" />
      </UrlState>,
    );
    render(
      <UrlState store={pageStore} onlyElement={false}>
        <Sort label="b" />
      </UrlState>,
    );
    await userEvent.click(screen.getByRole("button", { name: "a: none" }));
    expect(await screen.findByRole("button", { name: "b: a-sort" })).toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.hash).toBe("#/tab?_s=2&Individual1=7&_sort=a-sort");
    });
  });

  it("follows a hash changed by a link or another script", async () => {
    setHash("#?_sort=x");
    render(
      <UrlState store={pageStore} onlyElement>
        <Sort label="a" />
      </UrlState>,
    );
    expect(screen.getByRole("button", { name: "a: x" })).toBeInTheDocument();
    act(() => {
      setHash("#?_sort=y&other=1");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(await screen.findByRole("button", { name: "a: y" })).toBeInTheDocument();
  });

  it("keeps a popup's writes out of the page hash", async () => {
    setHash("#?_sort=page");
    const popup = memoryStore("#?_sort=popup");
    render(
      <UrlState store={popup} onlyElement={false}>
        <Sort label="p" />
      </UrlState>,
    );
    await userEvent.click(screen.getByRole("button", { name: "p: popup" }));
    await waitFor(() => {
      expect(popup.params().get("_sort")).toBe("p-sort");
    });
    expect(window.location.hash).toBe("#?_sort=page");
  });
});

describe("storeFor", () => {
  it("reads a dialog's urlHash and uses the page's hash elsewhere", () => {
    document.body.innerHTML =
      '<div class="ui-dialog-content"><afreact-form id="in"></afreact-form></div><afreact-search id="out"></afreact-search>';
    const data = vi.fn(() => "#?title=News");
    vi.mocked(window.CRM.$).mockImplementation((target) => ({ ...events(target), data }));
    const inPopup = storeFor(byId("in"));
    expect(inPopup.params().get("title")).toBe("News");
    expect(data).toHaveBeenCalledWith("urlHash");
    expect(storeFor(byId("out"))).toBe(pageStore);
  });
});

describe("isOnlyElement", () => {
  it("is true only while no other afreact element shares the page", () => {
    document.body.innerHTML = '<afreact-form id="a"></afreact-form><p></p>';
    const first = byId("a");
    expect(isOnlyElement(first)).toBe(true);
    document.body.insertAdjacentHTML("beforeend", "<afreact-search></afreact-search>");
    expect(isOnlyElement(first)).toBe(false);
  });
});

describe("useUrlPrefix", () => {
  it("adds the name only when the page or the form shows more than one display", () => {
    const { rerender } = render(
      <UrlState store={memoryStore("")} onlyElement>
        <Prefix name="D" />
      </UrlState>,
    );
    expect(screen.getByText("prefix[]")).toBeInTheDocument();
    rerender(
      <UrlState store={memoryStore("")} onlyElement>
        <DisplayCountContext.Provider value={2}>
          <Prefix name="D" />
        </DisplayCountContext.Provider>
      </UrlState>,
    );
    expect(screen.getByText("prefix[D.]")).toBeInTheDocument();
    rerender(
      <UrlState store={memoryStore("")} onlyElement={false}>
        <Prefix name="D" />
      </UrlState>,
    );
    expect(screen.getByText("prefix[D.]")).toBeInTheDocument();
  });
});
