import { useEditor } from "../context";
import { elementEditable, elementTag, PARAM_SETS_TEMPLATE, RECAPTCHA_TEMPLATE } from "../editable";
import { PartNotice, PluginElement } from "./plugins";
import { displayKey, type GuiElement, type SearchDisplayMeta } from "../meta";
import { textAttribute } from "../model";
import {
  DeleteAction,
  ElementBar,
  GearMenu,
  MenuDivider,
  useNodeOps,
  type ElementProps,
  type NodeOps,
} from "./common";
import { MenuLink } from "../../widgets/MenuLink";

/** checkEditAccess(): who may open the display's search in the search builder. */
export function canEditDisplay(display: SearchDisplayMeta): boolean {
  const { CRM } = window;
  if (CRM.checkPerm("all CiviCRM permissions and ACLs")) return true;
  if (display.acl_bypass) return false;
  if (CRM.checkPerm("administer search_kit")) return true;
  return (
    CRM.checkPerm("manage own search_kit") &&
    display["saved_search_id.created_id"] === CRM.config?.cid
  );
}

/** afGuiSearchDisplay: the display's name and icon, with a link to its search. */
export function SearchDisplayElement({ node, handle, label }: ElementProps) {
  const editor = useEditor();
  const key = displayKey(
    textAttribute(node, "search-name") ?? "",
    textAttribute(node, "display-name"),
  );
  const display = editor.meta.searchDisplays[key];
  const searchId = display?.saved_search_id;
  const editUrl =
    display &&
    canEditDisplay(display) &&
    (typeof searchId === "number" || typeof searchId === "string")
      ? window.CRM.url(`civicrm/admin/search#/edit/${String(searchId)}`)
      : null;
  const searchLabel = display?.["saved_search_id.label"];
  return (
    <div className="af-gui-element">
      <ElementBar handle={handle} label={label}>
        <div className="form-inline">
          <span>
            {display
              ? `${typeof searchLabel === "string" ? searchLabel : ""}: ${display.label}`
              : ts("Search display %1 not found", { 1: key })}
          </span>
          {editUrl && (
            <GearMenu>
              {() => (
                <li>
                  <a target="_blank" rel="noreferrer" href={editUrl}>
                    <i className="crm-i fa-external-link" role="img" aria-hidden="true" />{" "}
                    {ts("Edit Saved Search")}
                  </a>
                </li>
              )}
            </GearMenu>
          )}
        </div>
      </ElementBar>
      <p className="text-center af-gui-search-display">
        <i
          className={`crm-i fa-3x ${display?.["type:icon"] ?? ""}`}
          role="img"
          aria-hidden="true"
        />
      </p>
    </div>
  );
}

function GenericBar({
  ops,
  title,
  handle,
  label,
}: Pick<ElementProps, "handle" | "label"> & { ops: NodeOps; title: string }) {
  return (
    <ElementBar handle={handle} label={label}>
      <div className="form-inline">
        <span>{title}</span>
        <GearMenu>
          {() => <DeleteAction ops={ops} label={ts("Remove %1", { 1: title })} />}
        </GearMenu>
      </div>
    </ElementBar>
  );
}

/** recaptcha's afGuiRecaptcha2: a picture of the widget in its light or dark theme. */
function Recaptcha({
  ops,
  handle,
  label,
}: Pick<ElementProps, "handle" | "label"> & { ops: NodeOps }) {
  const dark = textAttribute(ops.node, "recaptchatheme") === "dark";
  return (
    <div className="af-gui-element">
      <ElementBar handle={handle} label={label}>
        <div className="form-inline pull-right">
          <GearMenu>
            {() => (
              <>
                <li>
                  <MenuLink
                    checked={dark}
                    onClick={() => {
                      ops.edit((node) => ({ ...node, recaptchatheme: dark ? "light" : "dark" }));
                    }}
                  >
                    {ts("Light")}{" "}
                    <i
                      className={`crm-i fa-toggle-${dark ? "on" : "off"}`}
                      role="img"
                      aria-hidden="true"
                    />{" "}
                    {ts("Dark")}
                  </MenuLink>
                </li>
                <MenuDivider />
                <DeleteAction ops={ops} label={ts("Remove ReCaptcha")} />
              </>
            )}
          </GearMenu>
        </div>
      </ElementBar>
      <div
        className={dark ? "af-gui-recaptcha2-placeholder rc2dark" : "af-gui-recaptcha2-placeholder"}
        role="img"
        aria-label={dark ? ts("ReCaptcha, dark") : ts("ReCaptcha, light")}
      />
    </div>
  );
}

const elementOf = (elements: Record<string, GuiElement>, tag: string) =>
  Object.values(elements).find((element) => element.directive === tag);

/**
 * afGuiGenericElement: another extension's element, as a titled bar; its own admin template
 * becomes its plugin element, or a notice where it defines none.
 */
export function GenericElement({ path, node, handle, label }: ElementProps) {
  const editor = useEditor();
  const ops = useNodeOps(path, node);
  const element = elementOf(editor.meta.gui.elements, node["#tag"]);
  const title = element?.title ?? node["#tag"];
  const template = element?.admin_tpl;
  if (template === RECAPTCHA_TEMPLATE) return <Recaptcha ops={ops} handle={handle} label={label} />;
  const own = !!template && template !== PARAM_SETS_TEMPLATE;
  return (
    <div className="af-gui-element">
      <GenericBar ops={ops} title={title} handle={handle} label={label} />
      {template === PARAM_SETS_TEMPLATE &&
        ts("User will be able to save and use sets of filters for this form here.")}
      {own &&
        (elementEditable(node["#tag"], template) ? (
          <PluginElement
            tag={elementTag(node["#tag"])}
            props={{ node }}
            onChange={(next) => {
              ops.edit(() => next);
            }}
          />
        ) : (
          <PartNotice part={ts("The settings of %1", { 1: title })} />
        ))}
    </div>
  );
}
