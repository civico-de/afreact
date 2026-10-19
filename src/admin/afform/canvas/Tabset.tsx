import { useId, useState } from "react";
import { Dropdown } from "../../widgets/Dropdown";
import { InlineEdit } from "../../widgets/InlineEdit";
import { TabList, TabPanel } from "../../widgets/Tabs";
import { useEditor } from "../context";
import { displayKey } from "../meta";
import { findElements, textAttribute } from "../model";
import { layoutOf, withoutAttributes } from "../nodes";
import { isElement, updateNode, type ShallowElement } from "../tree";
import {
  DeleteAction,
  ElementBar,
  GearMenu,
  MenuAction,
  MenuControls,
  MenuDivider,
  useNodeOps,
  type ElementProps,
  type NodeOps,
} from "./common";
import { CanvasBody, pickIcon } from "./Container";
import { childScope } from "./scope";

const TOTAL_COUNT = "$parent.count";

/** The search displays in a tab, which may show their count on it; a chart reports none. */
function tabDisplays(tab: ShallowElement, searchDisplayTags: string[]) {
  return findElements(
    tab["#children"] ?? [],
    (node) =>
      searchDisplayTags.includes(node["#tag"]) &&
      // deviation:chart-tab-count-not-offered
      node["#tag"] !== "crm-search-display-chart-kit" &&
      !!textAttribute(node, "search-name"),
  );
}

function TabMenu({
  ops,
  tabIndex,
  onDeleted,
}: {
  ops: NodeOps;
  tabIndex: number;
  onDeleted: () => void;
}) {
  const editor = useEditor();
  const countId = useId();
  const tab = ops.node["#children"]?.[tabIndex];
  if (!isElement(tab)) return null;
  const displays = tabDisplays(tab, editor.meta.gui.searchDisplayTags);
  const counted = displays.findIndex(
    ({ node }) => textAttribute(node, "total-count") === TOTAL_COUNT,
  );
  const editTab = (update: (tab: ShallowElement) => ShallowElement) => {
    ops.edit((node) => ({
      ...node,
      "#children": (node["#children"] ?? []).map((child, index) =>
        index === tabIndex && isElement(child) ? update(child) : child,
      ),
    }));
  };
  const setCount = (chosen: number) => {
    editTab((current) => {
      let children = current["#children"] ?? [];
      displays.forEach(({ path }, index) => {
        children = updateNode(children, path, (child) => {
          if (!isElement(child)) return child;
          return index === chosen
            ? { ...child, "total-count": TOTAL_COUNT }
            : withoutAttributes(child, ["total-count"]);
        });
      });
      return { ...current, "#children": children };
    });
  };
  return (
    <>
      <MenuControls>
        <input
          className="form-control"
          required
          aria-label={ts("Tab title")}
          title={ts("Tab title")}
          placeholder={ts("Tab title")}
          value={textAttribute(tab, "title") ?? ""}
          onChange={(event) => {
            const title = event.target.value;
            editTab((current) => ({ ...current, title }));
          }}
        />
      </MenuControls>
      <MenuAction
        icon="fa-icons"
        onClick={() => {
          pickIcon(editor, ts("Choose icon"), (icon) => {
            editTab((current) => ({ ...current, icon }));
          });
        }}
      >
        {ts("Choose icon")}
      </MenuAction>
      {displays.length > 0 && (
        <MenuControls>
          <label htmlFor={countId}>{ts("Count:")}</label>{" "}
          <select
            id={countId}
            className="form-control"
            value={counted}
            onChange={(event) => {
              setCount(Number(event.target.value));
            }}
          >
            <option value={-1}>{ts("None")}</option>
            {displays.map(({ node }, index) => {
              const key = displayKey(
                textAttribute(node, "search-name") ?? "",
                textAttribute(node, "display-name"),
              );
              return (
                <option key={key} value={index}>
                  {editor.meta.searchDisplays[key]?.label ?? key}
                </option>
              );
            })}
          </select>
        </MenuControls>
      )}
      <MenuDivider />
      <MenuAction
        icon="fa-trash"
        danger
        onClick={() => {
          ops.edit((node) => ({
            ...node,
            "#children": (node["#children"] ?? []).filter((_, index) => index !== tabIndex),
          }));
          onDeleted();
        }}
      >
        {ts("Delete tab")}
      </MenuAction>
    </>
  );
}

/** afGuiTabset: tabs or pages, each a container, the selected one shown. */
export function TabsetElement({ path, node, scope, handle, label }: ElementProps) {
  const editor = useEditor();
  const ops = useNodeOps(path, node);
  const base = useId();
  // The selected tab's place among the tabs; text between them takes no place.
  const [selected, setSelected] = useState(0);
  const isPages = !!textAttribute(node, "page-nav-buttons");
  const tabs = (node["#children"] ?? []).flatMap((child, index) =>
    isElement(child) ? [{ tab: child, index }] : [],
  );
  const position = Math.min(selected, Math.max(tabs.length - 1, 0));
  const activeTab = tabs.at(position);
  const active = activeTab?.index ?? -1;
  const addTab = () => {
    ops.edit((current) => ({
      ...current,
      "#children": [
        ...(current["#children"] ?? []),
        { "#tag": "af-tab", title: isPages ? ts("New Page") : ts("New Tab"), "#children": [] },
      ],
    }));
    setSelected(tabs.length);
  };
  return (
    <div className="af-gui-container af-gui-tabset">
      <ElementBar handle={handle} label={label}>
        <div className="form-inline">
          <span>{isPages ? ts("Pages") : ts("Tab Set")}</span>
          <GearMenu>
            {() => (
              <>
                <MenuAction icon="fa-plus-square" onClick={addTab}>
                  {isPages ? ts("Add Page") : ts("Add Tab")}
                </MenuAction>
                <MenuDivider />
                <DeleteAction
                  ops={ops}
                  label={isPages ? ts("Delete Pages") : ts("Delete Tabset")}
                />
              </>
            )}
          </GearMenu>
        </div>
      </ElementBar>
      <div className="afreact-tabset-tabs">
        <TabList
          base={base}
          label={isPages ? ts("Pages") : ts("Tab Set")}
          active={String(active)}
          onSelect={(key) => {
            setSelected(tabs.findIndex(({ index }) => String(index) === key));
          }}
          items={tabs.map(({ tab, index }) => {
            const icon = textAttribute(tab, "icon");
            return {
              key: String(index),
              label: (
                <>
                  {icon && <i className={`crm-i ${icon}`} role="img" aria-hidden="true" />}{" "}
                  {textAttribute(tab, "title") ?? ""}
                </>
              ),
            };
          })}
        />
        {/* deviation:editor-tab-controls-outside */}
        {activeTab && (
          <Dropdown
            groupClass="btn-group afreact-tab-menu"
            buttonClass="btn btn-default btn-xs af-gui-add-element-button"
            title={ts("Configure %1", { 1: textAttribute(activeTab.tab, "title") ?? "" })}
            label={
              <span>
                <i className="crm-i fa-gear" role="img" aria-hidden="true" />
              </span>
            }
          >
            {(close) => (
              <TabMenu
                ops={ops}
                tabIndex={activeTab.index}
                onDeleted={() => {
                  close();
                  setSelected(0);
                }}
              />
            )}
          </Dropdown>
        )}
      </div>
      {tabs.map(({ tab, index }) =>
        index === active ? (
          <TabPanel key={index} base={base} tab={String(index)} active={String(active)}>
            <div data-entity={scope.dataEntity}>
              <CanvasBody
                scope={childScope(
                  editor,
                  scope,
                  [...path, index],
                  tab,
                  textAttribute(tab, "title") ?? "",
                )}
                nodes={tab["#children"] ?? []}
                layout={layoutOf(tab)}
              />
            </div>
          </TabPanel>
        ) : null,
      )}
      {isPages && (
        <div className="crm-buttons">
          {position > 0 && (
            <button
              type="button"
              className="crm-button crm-button-back"
              onClick={() => {
                setSelected(position - 1);
              }}
            >
              <i className="crm-i fa-angle-left" role="img" aria-hidden="true" /> {ts("Back")}
            </button>
          )}
          {position + 1 < tabs.length && (
            <button
              type="button"
              className="crm-button crm-button-next"
              onClick={() => {
                setSelected(position + 1);
              }}
            >
              <i className="crm-i fa-angle-right" role="img" aria-hidden="true" /> {ts("Next")}
            </button>
          )}
          {position + 1 === tabs.length && (
            <span className="crm-button crm-button-submit">
              <InlineEdit
                label={ts("Submit button text")}
                defaultValue={ts("Submit")}
                value={textAttribute(node, "page-nav-submit-text") ?? ""}
                onChange={(text) => {
                  ops.edit((current) => ({ ...current, "page-nav-submit-text": text }));
                }}
              />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
