import { useQuery } from "@tanstack/react-query";
import { parseAsString, useQueryStates } from "nuqs";
import {
  createContext,
  createElement,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { flushSync } from "react-dom";
import { api4 } from "../api/civi";
import { useFormSuccess } from "../search/links";
import type { ExpressionContext } from "./expressions";
import {
  initialTab,
  isTabOf,
  remembersSelection,
  tabForKey,
  tabsetProblems,
  tabsOf,
  type Tab,
} from "./tabsets";
import type { ElementNode, LayoutNode } from "./types";
import { Unsupported } from "./Unsupported";

/**
 * Tab sets in the markup of afTabset.html and of crmUi's tabset.html after jQuery UI's tabs(),
 * with the ARIA tabs pattern. Every panel renders; an af-tab runs its displays once shown.
 */

interface TabState {
  /** Selected once, or in a crm-ui-tab-set, so its search displays run. */
  shown: boolean;
  /** Shows a display's row count in the tab's badge (total-count="$parent.count"). */
  setCount: (count: number) => void;
  panel: HTMLElement | null;
}

const TabContext = createContext<TabState | null>(null);

/** The tab a layout part is in, null outside any. */
export function useTab(): TabState | null {
  return useContext(TabContext);
}

export interface TabsetProps {
  node: ElementNode;
  formName: string;
  expressions: ExpressionContext;
  nodes: (nodes: LayoutNode[]) => ReactNode;
  /** The tab set's own element with its attributes, around `children`. */
  element: (node: ElementNode, children: ReactNode) => ReactNode;
}

type Counts = Record<string, number>;

/** The classes jQuery UI's tabs() adds (1.13, as core bundles it). */
const UI_TABS = "ui-tabs ui-corner-all ui-widget ui-widget-content";
const UI_LIST = "ui-tabs-nav ui-corner-all ui-helper-reset ui-helper-clearfix ui-widget-header";
const UI_TAB = "ui-tabs-tab ui-corner-top ui-state-default ui-tab";
const UI_ACTIVE = " ui-tabs-active ui-state-active";
const UI_PANEL = "ui-tabs-panel ui-corner-bottom ui-widget-content";

interface Selection {
  selected: string | null;
  select: (name: string) => void;
  shown: string[];
}

/** The selected tab, kept under url-arg in the hash and in CRM.cache with remember-selection. */
function useSelection(names: string[], node: ElementNode, formName: string): Selection {
  const urlArg = typeof node["url-arg"] === "string" && node["url-arg"] ? node["url-arg"] : null;
  const keys = useMemo(
    (): Record<string, typeof parseAsString> => (urlArg ? { [urlArg]: parseAsString } : {}),
    [urlArg],
  );
  const [url, setUrl] = useQueryStates(keys);
  const fromUrl = urlArg ? url[urlArg] : null;
  const remember = remembersSelection(node) === true;
  const cacheKey = `${formName}SelectedTab`;
  const [chosen, setChosen] = useState(() => {
    const remembered = remember ? window.CRM.cache?.get(cacheKey) : null;
    // crmUiTabSet's jQuery UI tabs open the tab whose id is the URL fragment.
    const fragment = node["#tag"] === "af-tabset" ? null : window.location.hash.slice(1);
    const stored = typeof remembered === "string" ? remembered : null;
    return initialTab(names, [fromUrl, stored, fragment]);
  });
  const selected = fromUrl && names.includes(fromUrl) ? fromUrl : chosen;
  useEffect(() => {
    if (remember && selected) window.CRM.cache?.set(cacheKey, selected);
  }, [remember, cacheKey, selected]);
  const [shown, setShown] = useState<string[]>([]);
  if (selected !== null && !shown.includes(selected)) setShown([...shown, selected]);
  const select = (name: string) => {
    setChosen(name);
    if (urlArg) void setUrl({ [urlArg]: name });
  };
  return { selected, select, shown };
}

/** Arrow keys, Home and End move to a tab and select it; Enter and Space select the focused one. */
function onTabKey(
  event: KeyboardEvent<HTMLElement>,
  index: number,
  names: string[],
  select: (name: string) => void,
) {
  const activates = event.key === "Enter" || event.key === " ";
  const target = activates ? index : tabForKey(event.key, index, names.length);
  if (target === null) return;
  event.preventDefault();
  select(names[target] ?? "");
  const list = event.currentTarget.closest('[role="tablist"]');
  list?.querySelectorAll<HTMLElement>('[role="tab"]')[target]?.focus();
}

/** A control found invalid on submit selects its tab first, so that the form can focus it. */
function useShowInvalid(panelIds: string[], names: string[], select: (name: string) => void) {
  const root = useRef<HTMLDivElement>(null);
  const onInvalid = useEffectEvent((event: Event) => {
    const { target } = event;
    const index = panelIds.findIndex(
      (id) => target instanceof Node && !!document.getElementById(id)?.contains(target),
    );
    const name = names[index];
    if (name !== undefined)
      flushSync(() => {
        select(name);
      });
  });
  useEffect(() => {
    const element = root.current;
    const listener = (event: Event) => {
      onInvalid(event);
    };
    element?.addEventListener("invalid", listener, true);
    return () => {
      element?.removeEventListener("invalid", listener, true);
    };
  }, []);
  return root;
}

interface PanelProps {
  name: string;
  id: string;
  labelledBy: string;
  selected: boolean;
  shown: boolean;
  className: string | undefined;
  setCounts: Dispatch<SetStateAction<Counts>>;
  children: ReactNode;
}

function TabPanel(props: PanelProps) {
  const { name, id, labelledBy, selected, shown, className, setCounts, children } = props;
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const setCount = useCallback(
    (count: number) => {
      setCounts((counts) => (counts[name] === count ? counts : { ...counts, [name]: count }));
    },
    [name, setCounts],
  );
  const state = useMemo(() => ({ shown, setCount, panel }), [shown, setCount, panel]);
  return (
    <div
      ref={setPanel}
      role="tabpanel"
      id={id}
      aria-labelledby={labelledBy}
      className={className}
      hidden={!selected}
    >
      <TabContext.Provider value={state}>{children}</TabContext.Provider>
    </div>
  );
}

/** af-tabset or a crm-ui-tab-set element, by the tag of `node`. */
export function Tabset({ node, formName, expressions, nodes, element }: TabsetProps) {
  const ui = node["#tag"] !== "af-tabset";
  const tabs = tabsOf(node, expressions);
  const names = tabs.map((tab) => tab.name);
  const { selected, select, shown } = useSelection(names, node, formName);
  const [counts, setCounts] = useState<Counts>({});
  const base = useId();
  const tabIds = tabs.map((_, index) => `${base}tab${index}`);
  const panelIds = tabs.map((tab, index) => tab.panelId ?? `${base}panel${index}`);
  const root = useShowInvalid(panelIds, names, select);
  const notes = [...(ui ? [] : tabsetProblems(node)), ...tabs.flatMap((tab) => tab.problems)];
  const badge = (tab: Tab) => {
    const counted = counts[tab.name];
    return counted === undefined ? tab.count : String(counted);
  };

  const strip = tabs.map((tab, index) => {
    const active = tab.name === selected;
    const common = {
      id: tabIds[index],
      role: "tab",
      "aria-controls": panelIds[index],
      "aria-selected": active,
      tabIndex: active ? 0 : -1,
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        onTabKey(event, index, names, select);
      },
    };
    const click = (event: { preventDefault: () => void }) => {
      event.preventDefault();
      select(tab.name);
    };
    const icon = tab.icon && <i className={`crm-i ${tab.icon}`} role="img" aria-hidden="true" />;
    const count = badge(tab);
    // The link is the tab, as in afTabset.html (6.20); jQuery UI's role on the item would nest it.
    return ui ? (
      <li
        key={index}
        role="presentation"
        className={`ui-corner-all crm-tab-button crm-count-${count} ${UI_TAB}${
          active ? UI_ACTIVE : ""
        }`}
      >
        <a
          href={`#${panelIds[index] ?? ""}`}
          {...common}
          className="ui-tabs-anchor"
          onClick={click}
        >
          {icon} {tab.title} {count !== "" && <em>{count}</em>}
        </a>
      </li>
    ) : (
      <li
        key={index}
        role="presentation"
        className={`crm-tab-button${active ? " active" : ""}`}
        data-name={tab.name}
      >
        <a href="" {...common} onClick={click}>
          {icon} {tab.title} <span className="badge">{count}</span>
        </a>
      </li>
    );
  });

  let position = 0;
  const panels = (node["#children"] ?? []).map((child, key) => {
    if (!isTabOf(node, child)) return <Fragment key={key}>{nodes([child])}</Fragment>;
    const index = position++;
    const tab = tabs[index];
    if (!tab) return null;
    const panel = (
      <TabPanel
        key={key}
        name={tab.name}
        id={panelIds[index] ?? ""}
        labelledBy={tabIds[index] ?? ""}
        selected={tab.name === selected}
        // jQuery UI hides crm-ui-tab panels after their displays started (crmUi.js:914).
        shown={ui || shown.includes(tab.name)}
        className={ui ? UI_PANEL : undefined}
        setCounts={setCounts}
      >
        {nodes(tab.content)}
      </TabPanel>
    );
    return ui ? panel : createElement("af-tab", { key }, panel);
  });

  const body = (
    <>
      {notes.map((note) => (
        <Unsupported key={note} what={note} />
      ))}
      <ul role="tablist" className={ui ? `crm-tab-list ${UI_LIST}` : "nav nav-tabs crm-tab-list"}>
        {strip}
      </ul>
      <div className="crm-tab-panel" ref={root}>
        {panels}
      </div>
    </>
  );
  // afTabset adds crm-tabset to its element; crmUiTabSet's template wraps the tabs in one.
  if (ui) return element(node, <div className={`crm-tabset ${UI_TABS}`}>{body}</div>);
  const own = typeof node.class === "string" ? node.class : "";
  return element({ ...node, class: `crm-tabset ${own}`.trim() }, body);
}

interface TabCountProps {
  search: string;
  display: string;
  afform: string;
  /** The display's own filters: core counts without the form's filter values. */
  filters: Record<string, unknown> | unknown[];
}

/**
 * total-count="$parent.count": the badge shows the display's row count without the form's
 * filters, counted whether or not the tab is shown, and again after a popup form succeeds.
 */
export function TabCount({ search, display, afform, filters }: TabCountProps) {
  const tab = useTab();
  const counted = useQuery({
    queryKey: ["SearchDisplay", "tabCount", search, display, afform, filters],
    queryFn: async () =>
      (
        await api4<unknown>("SearchDisplay", "run", {
          savedSearch: search,
          display,
          afform,
          filters,
          return: "row_count",
        })
      ).count ?? null,
  });
  const setCount = tab?.setCount;
  useEffect(() => {
    if (typeof counted.data === "number") setCount?.(counted.data);
  }, [counted.data, setCount]);
  useFormSuccess(tab?.panel ?? null, () => void counted.refetch());
  return null;
}
