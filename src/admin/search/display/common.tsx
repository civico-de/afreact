import { useQuery } from "@tanstack/react-query";
import { useId, type ReactNode } from "react";
import { api4 } from "../../../api/civi";
import { IconPicker } from "../../widgets/IconPicker";
import { ModelText } from "../../widgets/ModelText";
import { Picker, type PickerOption } from "../../widgets/Picker";
import type { ConditionField } from "../condition";
import { getAllFields, getSelectFields } from "../expr";
import { useFieldOptions } from "../meta";
import { SearchCondition } from "../SearchCondition";
import {
  keyField,
  keyOptionKey,
  addCssRule,
  changeLimit,
  changeLinkItem,
  chosenLink,
  cssStyles,
  newLinkItem,
  showMoreCssRules,
  taskEnabled,
  toggleActions,
  toggleLimit,
  togglePager,
  toggleTask,
  toggleToolbar,
  withConditionField,
  type DisplayContext,
  type Draft,
  type LinkItem,
  type TaskInfo,
} from "./model";

/** What every display settings block gets: the search, the display copy and how to change it. */
export interface Editing {
  ctx: DisplayContext;
  draft: Draft;
  edit: (change: (draft: Draft) => void) => void;
}

export function Check({
  label,
  checked,
  onChange,
  title,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <div className="checkbox-inline form-control" title={title}>
      <label>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />{" "}
        <span>{label}</span>
      </label>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="crm-accordion-bold">
      <summary>{title}</summary>
      <div className="crm-accordion-body">{children}</div>
    </details>
  );
}

/** Integer input that commits on blur, as core's `updateOn: 'blur'` number fields. */
export function NumberInput({
  label,
  value,
  min = 1,
  onCommit,
  hiddenLabel = false,
}: {
  label: string;
  value: number | undefined;
  min?: number;
  onCommit: (value: number) => void;
  hiddenLabel?: boolean;
}) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className={hiddenLabel ? "sr-only" : undefined}>
        {label}
      </label>{" "}
      <input
        id={id}
        type="number"
        min={min}
        step={1}
        className="form-control four"
        key={value}
        defaultValue={value}
        onBlur={(event) => {
          const input = event.target;
          const next = input.value === "" ? 0 : input.valueAsNumber;
          // deviation:number-input-rejects-invalid
          // An unfinished entry such as "1e" also reads as "", but marks the input as bad.
          const bad = input.validity.badInput || !Number.isInteger(next);
          if (bad || (next < min && input.value !== "")) {
            input.value = value === undefined ? "" : String(value);
            return;
          }
          if (next !== value) onCommit(next);
        }}
      />
    </>
  );
}

/** crmSearchAdminDisplaySort: sort clauses over the columns, all fields and random order. */
export function SortConfig({ ctx, draft, edit }: Editing) {
  const id = useId();
  const sort = draft.settings.sort ?? [];
  const used = (key: string) => sort.some(([field]) => field === key);
  const options = (keep?: string): PickerOption[] => [
    ...(keep === "RAND()" || !used("RAND()")
      ? [{ id: "RAND()", label: ts("Random"), icon: "fa-random" }]
      : []),
    ...getSelectFields(ctx.meta, ctx.search)
      .filter((f) => f.id === keep || !used(String(f.id)))
      .map((f) => ({ ...f, group: ts("Columns") })),
    ...getAllFields(
      ctx.meta,
      ctx.search,
      "",
      ["Field", "Custom", "Extra"],
      (key) => key !== keep && used(key),
    ),
  ];
  return (
    <fieldset>
      <legend className="sr-only">{ts("Sorting")}</legend>
      {sort.map(([field, dir], index) => {
        // Each row's controls name its field, so a screen reader tells the rows apart.
        // deviation:sort-controls-named
        const name = options(field).find((option) => option.id === field)?.label ?? field;
        return (
          <div
            className="form-inline crm-search-admin-display-sorts"
            key={`${field}-${String(index)}`}
          >
            <Picker
              id={`${id}-${String(index)}`}
              label={index ? ts("Also by") : ts("Sort by")}
              placeholder={ts("Select field")}
              single
              options={options(field)}
              value={[field]}
              onChange={(picked) => {
                const next = picked[0];
                edit((d) => {
                  const list = d.settings.sort ?? [];
                  if (next === undefined) list.splice(index, 1);
                  else list[index] = [String(next), list[index]?.[1] ?? "ASC"];
                  d.settings.sort = list;
                });
              }}
            />
            {field !== "RAND()" && (
              <select
                className="form-control crm-auto-width"
                aria-label={ts("Direction of %1", { 1: name })}
                value={dir}
                onChange={(event) => {
                  const value = event.target.value;
                  edit((d) => {
                    const clause = d.settings.sort?.[index];
                    if (clause) clause[1] = value;
                  });
                }}
              >
                <option value="ASC">{ts("Ascending")}</option>
                <option value="DESC">{ts("Descending")}</option>
              </select>
            )}
            <button
              type="button"
              className="btn btn-xs crm-hover-button"
              aria-label={ts("Clear sorting by %1", { 1: name })}
              title={ts("Clear")}
              onClick={() => {
                edit((d) => {
                  d.settings.sort = (d.settings.sort ?? []).filter((_, i) => i !== index);
                });
              }}
            >
              <i className="crm-i fa-times" role="img" aria-hidden="true" />
            </button>
          </div>
        );
      })}
      <div className="form-inline crm-search-admin-display-sort-add">
        <Picker
          id={`${id}-add`}
          label={sort.length ? ts("Also by") : ts("Sort by")}
          placeholder={ts("Select field")}
          single
          options={options()}
          value={[]}
          onChange={(picked) => {
            const next = picked[0];
            if (next !== undefined)
              edit((d) => {
                d.settings.sort = [...(d.settings.sort ?? []), [String(next), "ASC"]];
              });
          }}
        />
      </div>
    </fieldset>
  );
}

/** searchAdminPagerConfig */
export function PagerConfig({
  ctx,
  draft,
  edit,
  noLimit = false,
  noPager = false,
}: Editing & { noLimit?: boolean; noPager?: boolean }) {
  const s = draft.settings;
  const pager = typeof s.pager === "object" ? s.pager : null;
  const setPager = (key: "expose_limit" | "show_count" | "hide_single") => {
    edit((d) => {
      if (typeof d.settings.pager === "object") d.settings.pager[key] = !d.settings.pager[key];
    });
  };
  return (
    <div className="form-inline">
      {!noPager && (
        <Check
          label={ts("Use Pager")}
          checked={!!s.pager}
          onChange={() => {
            edit((d) => {
              togglePager(ctx, d.settings, noLimit);
            });
          }}
        />
      )}
      {!s.pager && !noLimit && (
        <>
          <Check
            label={ts("Limit Results")}
            checked={!!s.limit}
            onChange={() => {
              edit((d) => {
                toggleLimit(ctx, d.settings);
              });
            }}
          />
          {!!s.limit && (
            <NumberInput
              label={ts("Limit Results")}
              hiddenLabel
              value={s.limit}
              onCommit={(value) => {
                edit((d) => {
                  changeLimit(d.settings, value);
                });
              }}
            />
          )}
        </>
      )}
      {pager && (
        <div className="form-group">
          <NumberInput
            label={ts("Page Size")}
            value={s.limit}
            onCommit={(value) => {
              edit((d) => {
                changeLimit(d.settings, value);
              });
            }}
          />
          <Check
            label={ts("Adjustable Page Size")}
            checked={!!pager.expose_limit}
            onChange={() => {
              setPager("expose_limit");
            }}
          />
          <Check
            label={ts("Show Count in Pager")}
            checked={!!pager.show_count}
            onChange={() => {
              setPager("show_count");
            }}
          />
          <Check
            label={ts("Hide Pager if One Page")}
            checked={!!pager.hide_single}
            onChange={() => {
              setPager("hide_single");
            }}
          />
        </div>
      )}
    </div>
  );
}

/** searchAdminPlaceholderConfig */
export function PlaceholderConfig({ draft, edit }: Omit<Editing, "ctx">) {
  const value = draft.settings.placeholder;
  return (
    <div className="form-inline">
      <Check
        label={ts("Loading Placeholders")}
        title={ts("Show wireframe placeholder results while waiting for data")}
        checked={!!value}
        onChange={() => {
          edit((d) => {
            d.settings.placeholder = d.settings.placeholder ? 0 : 5;
          });
        }}
      />
      {!!value && (
        <NumberInput
          label={ts("Loading Placeholders")}
          hiddenLabel
          min={0}
          value={value}
          onCommit={(next) => {
            edit((d) => {
              d.settings.placeholder = next;
            });
          }}
        />
      )}
    </div>
  );
}

/** displays/common/noResultsText.html */
export function NoResultsConfig({ draft, edit }: Omit<Editing, "ctx">) {
  const text = draft.settings.noResultsText;
  return (
    <div
      className="form-inline crm-search-admin-flex-row"
      title={ts("Text to display if the table is empty.")}
    >
      <label>
        <input
          type="checkbox"
          checked={text !== false}
          onChange={() => {
            edit((d) => {
              d.settings.noResultsText = d.settings.noResultsText === false ? "" : false;
            });
          }}
        />{" "}
        {ts("No Results Text")}
      </label>
      {text !== false && (
        <ModelText
          className="form-control crm-flex-1"
          live
          aria-label={ts("No Results Text")}
          placeholder={ts("None found.")}
          value={text ?? ""}
          onChange={(value) => {
            edit((d) => {
              d.settings.noResultsText = value;
            });
          }}
        />
      )}
    </div>
  );
}

/** displays/common/searchButtonConfig.html */
export function SearchButtonConfig({ draft, edit }: Omit<Editing, "ctx">) {
  const button = draft.settings.button;
  return (
    <div className="form-group">
      <div
        className="input-group"
        title={ts("Should the search be run immediately, or wait for the user to click a button?")}
      >
        <div className="input-group-btn">
          <button
            type="button"
            className={`btn btn-secondary-outline btn-sm${button ? "" : " active"}`}
            aria-pressed={!button}
            onClick={() => {
              edit((d) => {
                d.settings.button = null;
              });
            }}
          >
            {ts("Auto-Run")}
          </button>
          <button
            type="button"
            className={`btn btn-secondary-outline btn-sm${button ? " active" : ""}`}
            aria-pressed={!!button}
            onClick={() => {
              edit((d) => {
                d.settings.button = ts("Search");
              });
            }}
          >
            {ts("Search Button")}
          </button>
        </div>
        {!!button && (
          <ModelText
            className="form-control"
            aria-label={ts("Search button text")}
            placeholder={ts("Search button text")}
            value={button}
            onChange={(value) => {
              edit((d) => {
                d.settings.button = value;
              });
            }}
          />
        )}
      </div>
      <Check
        label={ts("Show Count in Header")}
        checked={!!draft.settings.headerCount}
        onChange={() => {
          edit((d) => {
            d.settings.headerCount = !d.settings.headerCount;
          });
        }}
      />
    </div>
  );
}

export function useSearchTasks(entity: string) {
  return useQuery({
    queryKey: ["afreact-admin", "searchTasks", entity],
    queryFn: async () => [
      ...(await api4<TaskInfo>("SearchDisplay", "getSearchTasks", {
        savedSearch: { api_entity: entity },
      })),
    ],
    staleTime: Infinity,
  });
}

/** searchAdminTasksConfig: the actions menu and which tasks it offers. */
export function TasksConfig({ ctx, draft, edit }: Editing) {
  const s = draft.settings;
  const tasks = useSearchTasks(ctx.search.api_entity);
  const all = (tasks.data ?? []).map((task) => task.name);
  return (
    <>
      <Check
        label={ts("Actions Menu")}
        checked={!!s.actions}
        onChange={() => {
          edit((d) => {
            toggleActions(d.settings);
          });
        }}
      />
      {!!s.actions && (
        <>
          <details className="afreact-task-picker">
            <summary className="btn btn-sm btn-default">
              {s.actions === true ? ts("All Enabled") : ts("%1 Enabled", { 1: s.actions.length })}
            </summary>
            {tasks.isPending && <p role="status">{ts("Loading…")}</p>}
            <fieldset>
              <legend className="sr-only">{ts("Actions Menu")}</legend>
              {(tasks.data ?? []).map((task) => (
                <div className="checkbox" key={task.name}>
                  <label>
                    <input
                      type="checkbox"
                      checked={taskEnabled(s, task.name)}
                      onChange={() => {
                        edit((d) => {
                          toggleTask(d.settings, task.name, all);
                        });
                      }}
                    />{" "}
                    {task.title}
                  </label>
                </div>
              ))}
            </fieldset>
          </details>
          <select
            className="form-control"
            aria-label={ts("Actions display")}
            value={s.actions_display_mode ?? "menu"}
            onChange={(event) => {
              const value = event.target.value;
              edit((d) => {
                d.settings.actions_display_mode = value;
              });
            }}
          >
            <option value="menu">{ts("Dropdown")}</option>
            <option value="buttons">{ts("Buttons")}</option>
          </select>
        </>
      )}
    </>
  );
}

/** searchAdminToolbarConfig */
export function ToolbarConfig({ ctx, draft, edit, links }: Editing & { links: LinkItem[] }) {
  const toolbar = draft.settings.toolbar;
  return (
    <fieldset>
      <div className="form-inline">
        <Check
          label={ts("Toolbar")}
          checked={!!toolbar}
          onChange={() => {
            edit((d) => {
              toggleToolbar(d.settings, links);
            });
          }}
        />
      </div>
      {toolbar && (
        <LinkGroup
          ctx={ctx}
          label={ts("Toolbar")}
          links={links}
          group={toolbar}
          isToolbar
          onChange={(group) => {
            edit((d) => {
              d.settings.toolbar = group;
            });
          }}
        />
      )}
    </fieldset>
  );
}

/** crmSearchAdminTokenSelect: appends a `[token]` of a column or field to a text. */
export function TokenSelect({
  ctx,
  suffix = "",
  onlySelect = false,
  onToken,
}: {
  ctx: DisplayContext;
  suffix?: string;
  onlySelect?: boolean;
  onToken: (token: string) => void;
}) {
  const id = useId();
  const options = [
    ...getSelectFields(ctx.meta, ctx.search),
    ...(onlySelect
      ? []
      : getAllFields(ctx.meta, ctx.search, suffix, ["Field", "Custom", "Extra", "Pseudo"])),
  ];
  return (
    <span title={ts("Insert Token")}>
      <Picker
        id={id}
        label={ts("Insert Token")}
        hiddenLabel
        placeholder={ts("Insert Token")}
        className="crm-auto-width"
        single
        options={options}
        value={[]}
        onChange={(picked) => {
          const key = picked[0];
          if (key !== undefined) onToken(`[${String(key)}]`);
        }}
      />
    </span>
  );
}

/** A text input with crmSearchAdminTokenSelect beside it, taking the text once it is left. */
export function TokenText({
  ctx,
  label,
  value,
  onChange,
  suffix = ":label",
  multiline = false,
  hiddenLabel = true,
  live = false,
  trim = true,
}: {
  ctx: DisplayContext;
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
  multiline?: boolean;
  hiddenLabel?: boolean;
  /** Takes every keystroke, where core's input has no `updateOn: 'blur'`. */
  live?: boolean;
  trim?: boolean;
}) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className={hiddenLabel ? "sr-only" : undefined}>
        {label}
      </label>
      <ModelText
        id={id}
        className="form-control crm-flex-1"
        multiline={multiline}
        live={live}
        trim={trim}
        value={value}
        onChange={onChange}
      />
      <TokenSelect
        ctx={ctx}
        suffix={suffix}
        onToken={(token) => {
          onChange(value + token);
        }}
      />
    </>
  );
}

/** The fields a style, icon or link condition can test, by machine name. */
function conditionFields(ctx: DisplayContext, all: boolean): PickerOption[] {
  const select = getSelectFields(ctx.meta, ctx.search).map((field) => ({
    ...field,
    id: String(field.id).replace(":label", ":name"),
    group: ts("Columns"),
  }));
  return all
    ? [
        ...select,
        ...getAllFields(ctx.meta, ctx.search, ":name", ["Field", "Custom", "Extra", "Pseudo"]),
      ]
    : select;
}

/** A field picker and crmSearchCondition on `clause[at]` and the operator and value after it. */
function RuleCondition({
  ctx,
  clause,
  at,
  label,
  fields,
  placeholder,
  onChange,
}: {
  ctx: DisplayContext;
  clause: unknown[];
  at: number;
  label: string;
  fields: PickerOption[];
  placeholder: string;
  onChange: (clause: unknown[]) => void;
}) {
  const id = useId();
  const name = typeof clause[at] === "string" ? clause[at] : "";
  const field = name ? keyField(ctx, name) : undefined;
  const options = useFieldOptions(field?.entity ?? ctx.search.api_entity);
  const conditionField: ConditionField | undefined = field && {
    ...field,
    entity: field.entity ?? ctx.search.api_entity,
  };
  return (
    <>
      <Picker
        id={id}
        label={label}
        hiddenLabel
        placeholder={placeholder}
        className="crm-auto-width"
        single
        options={fields}
        value={name ? [name] : []}
        onChange={(picked) => {
          onChange(
            withConditionField(clause, at, picked[0] === undefined ? "" : String(picked[0])),
          );
        }}
      />
      {name && (
        <SearchCondition
          label={field?.label ?? name}
          field={conditionField}
          clause={clause}
          offset={at + 1}
          operators={ctx.meta.operators}
          optionKey={keyOptionKey(ctx, name)}
          options={field ? options.data?.[field.name] : undefined}
          onChange={onChange}
        />
      )}
    </>
  );
}

/** searchAdminCssRules: styles of a row or column, each always or when a field matches. */
export function CssRules({
  ctx,
  label,
  rules,
  defaultField,
  onChange,
}: {
  ctx: DisplayContext;
  label: string;
  rules: unknown[][] | undefined;
  defaultField?: string;
  onChange: (rules: unknown[][]) => void;
}) {
  const id = useId();
  const styles = cssStyles(ctx.meta);
  const fields = conditionFields(ctx, true);
  const list = rules ?? [];
  const set = (index: number, clause: unknown[]) => {
    onChange(list.map((c, i) => (i === index ? clause : c)));
  };
  const styleSelect = (value: string, onPick: (style: string) => void, name: string) => (
    <select
      className="form-control crm-auto-width"
      aria-label={name}
      value={value in styles ? value : ""}
      onChange={(event) => {
        onPick(event.target.value);
      }}
    >
      {Object.entries(styles).map(([key, text]) => (
        <option key={key} value={key}>
          {text}
        </option>
      ))}
      <option value="">{ts("Other")}</option>
    </select>
  );
  return (
    <>
      {list.map((clause, index) => {
        const style = typeof clause[0] === "string" ? clause[0] : "";
        const ruleLabel = `${label} ${String(index + 1)}`;
        return (
          <div className="form-inline" key={index}>
            <span>{label}</span>{" "}
            {styleSelect(
              style,
              (next) => {
                set(index, [next, ...clause.slice(1)]);
              },
              ruleLabel,
            )}
            {!(style in styles) && (
              <ModelText
                className="form-control"
                aria-label={ts("CSS class of %1", { 1: ruleLabel })}
                placeholder={ts("CSS class")}
                value={style}
                onChange={(value) => {
                  set(index, [value, ...clause.slice(1)]);
                }}
              />
            )}{" "}
            <span>{ts("If")}</span>{" "}
            <RuleCondition
              ctx={ctx}
              clause={clause}
              at={1}
              label={ts("Condition of %1", { 1: ruleLabel })}
              placeholder={ts("Always")}
              fields={fields}
              onChange={(next) => {
                set(index, next);
              }}
            />
            <button
              type="button"
              className="btn btn-xs btn-danger-outline"
              aria-label={ts("Remove style")}
              title={ts("Remove style")}
              onClick={() => {
                onChange(list.filter((_, i) => i !== index));
              }}
            >
              <i className="crm-i fa-times" role="img" aria-hidden="true" />
            </button>
          </div>
        );
      })}
      {showMoreCssRules({ cssRules: list }) && (
        <div
          className="form-inline"
          title={ts("Set background color or text style based on a field value")}
        >
          <label htmlFor={`${id}-add`}>{label}</label>{" "}
          <select
            id={`${id}-add`}
            className="form-control crm-auto-width"
            value="-"
            onChange={(event) => {
              const item = { cssRules: list };
              addCssRule(ctx, item, event.target.value, defaultField);
              onChange(item.cssRules);
            }}
          >
            <option value="-">{list.length ? ts("Add") : ts("None")}</option>
            {Object.entries(styles).map(([key, text]) => (
              <option key={key} value={key}>
                {text}
              </option>
            ))}
            <option value="">{ts("Other")}</option>
          </select>
        </div>
      )}
    </>
  );
}

/** crmSearchConditions: when a link shows, by the user's permissions and row values. */
export function LinkConditions({
  ctx,
  conditions,
  isToolbar,
  label,
  onChange,
}: {
  ctx: DisplayContext;
  conditions: unknown[];
  isToolbar: boolean;
  label: string;
  onChange: (conditions: unknown[]) => void;
}) {
  const id = useId();
  const fields: PickerOption[] = [
    {
      id: "check user permission",
      label: ts("Current User Permission"),
      description: ts("Check permission of logged-in user"),
    },
    ...(isToolbar
      ? [
          {
            id: "no results",
            label: ts("No Results"),
            description: ts("Only show this button when the search has no results"),
          },
        ]
      : []),
    ...conditionFields(ctx, false),
  ];
  const permissions = permissionOptions(ctx.meta.permissions);
  const clauses = conditions.filter((c): c is unknown[] => Array.isArray(c));
  const set = (index: number, clause: unknown[] | null) => {
    onChange(
      clause
        ? clauses.map((c, i) => (i === index ? clause : c))
        : clauses.filter((_, i) => i !== index),
    );
  };
  return (
    <>
      {clauses.map((clause, index) => {
        const head = typeof clause[0] === "string" ? clause[0] : "";
        const name = ts("Condition %1 of %2", { 1: index + 1, 2: label });
        return (
          <div className="form-inline" key={index}>
            {head === "check user permission" ? (
              <>
                <Picker
                  id={`${id}-${String(index)}`}
                  label={name}
                  hiddenLabel
                  placeholder=" "
                  single
                  options={fields}
                  value={[head]}
                  onChange={(picked) => {
                    set(index, picked[0] === undefined ? null : [String(picked[0]), "="]);
                  }}
                />
                <select
                  className="form-control crm-auto-width"
                  aria-label={ts("Operator for %1", { 1: name })}
                  value={typeof clause[1] === "string" ? clause[1] : "="}
                  onChange={(event) => {
                    set(index, [head, event.target.value, clause[2]]);
                  }}
                >
                  <option value="CONTAINS">{ts("Includes")}</option>
                  <option value="=">{ts("Has All")}</option>
                  <option value="!=">{ts("Lacks All")}</option>
                </select>
                <Picker
                  id={`${id}-${String(index)}-perm`}
                  label={ts("Permissions of %1", { 1: name })}
                  hiddenLabel
                  placeholder={ts("Permission")}
                  options={permissions}
                  value={Array.isArray(clause[2]) ? clause[2].map(String) : []}
                  onChange={(pick) => {
                    const current = Array.isArray(clause[2]) ? clause[2].map(String) : [];
                    set(index, [head, clause[1], pick(current).map(String)]);
                  }}
                />
              </>
            ) : (
              <RuleCondition
                ctx={ctx}
                clause={clause}
                at={0}
                label={name}
                placeholder=" "
                fields={fields}
                onChange={(next) => {
                  set(index, next.length ? next : null);
                }}
              />
            )}
          </div>
        );
      })}
      <Picker
        id={`${id}-add`}
        label={ts("Add condition to %1", { 1: label })}
        hiddenLabel
        placeholder={clauses.length ? ts("And...") : ts("Add Condition...")}
        className="crm-auto-width"
        single
        options={fields}
        value={[]}
        onChange={(picked) => {
          if (picked[0] !== undefined) onChange([...clauses, [String(picked[0]), "="]]);
        }}
      />
    </>
  );
}

/** CRM_Core_Permission::getPermissionList's select2 groups as picker options. */
export function permissionOptions(groups: unknown[]): PickerOption[] {
  const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null;
  return groups.filter(isRecord).flatMap((group) =>
    (Array.isArray(group.children) ? group.children : []).filter(isRecord).flatMap((perm) =>
      typeof perm.id === "string" && typeof perm.text === "string"
        ? [
            {
              id: perm.id,
              label: perm.text,
              description: typeof perm.description === "string" ? perm.description : null,
              group: typeof group.text === "string" ? group.text : undefined,
            },
          ]
        : [],
    ),
  );
}

/** crmSearchAdminLinkSelect: one of the offered links, or a path of one's own. */
export function LinkSelect({
  ctx,
  link,
  links,
  label,
  onChange,
}: {
  ctx: DisplayContext;
  link: LinkItem;
  links: LinkItem[];
  label: string;
  onChange: (link: LinkItem) => void;
}) {
  const id = useId();
  const chosen = chosenLink(links, link);
  const custom = !link.action && !link.task;
  return (
    <span className="crm-flex-1 input-group">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        className="form-control crm-auto-width"
        value={chosen ? String(links.indexOf(chosen)) : "other"}
        onChange={(event) => {
          const value = event.target.value;
          onChange(value === "other" ? { path: "civicrm/" } : (links[Number(value)] ?? {}));
        }}
      >
        {links.map((item, index) => (
          <option key={index} value={index}>
            {item.text}
          </option>
        ))}
        <option value="other">{ts("Other...")}</option>
      </select>
      {custom && (
        <TokenText
          ctx={ctx}
          label={ts("Path of %1", { 1: label })}
          suffix=""
          value={link.path ?? ""}
          onChange={(path) => {
            onChange({ ...link, path });
          }}
        />
      )}
    </span>
  );
}

/** crmSearchAdminLinkGroup: links with icon, target, text, conditions and style, in order. */
export function LinkGroup({
  ctx,
  label,
  links,
  group,
  isToolbar = false,
  onChange,
}: {
  ctx: DisplayContext;
  label: string;
  links: LinkItem[];
  group: LinkItem[];
  isToolbar?: boolean;
  onChange: (group: LinkItem[]) => void;
}) {
  const id = useId();
  const styles = ctx.meta.styles;
  const set = (index: number, change: (item: LinkItem) => void) => {
    onChange(
      group.map((item, i) => {
        if (i !== index) return item;
        const next = structuredClone(item);
        change(next);
        return next;
      }),
    );
  };
  const move = (from: number, to: number) => {
    const next = [...group];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    onChange(next);
  };
  return (
    <table className="afreact-link-group">
      <caption className="sr-only">{label}</caption>
      <thead>
        <tr>
          <th className="crm-search-admin-icon-col">
            <span className="sr-only">{ts("Order")}</span>
          </th>
          <th>{ts("Link")}</th>
          <th className="crm-search-admin-icon-col">{ts("Icon")}</th>
          <th>{ts("Open")}</th>
          <th>{ts("Text")}</th>
          <th>{ts("Show if")}</th>
          <th>{ts("Style")}</th>
          <th className="crm-search-admin-icon-col">
            <span className="sr-only">{ts("Remove")}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {group.map((item, index) => {
          const itemText = item.text ?? "";
          const name = itemText === "" ? ts("Link %1", { 1: index + 1 }) : itemText;
          return (
            <tr key={index}>
              <td className="crm-search-admin-icon-col">
                <button
                  type="button"
                  className="btn btn-xs"
                  disabled={index === 0}
                  aria-label={ts("Move %1 up", { 1: name })}
                  onClick={() => {
                    move(index, index - 1);
                  }}
                >
                  <i className="crm-i fa-arrow-up" role="img" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="btn btn-xs"
                  disabled={index === group.length - 1}
                  aria-label={ts("Move %1 down", { 1: name })}
                  onClick={() => {
                    move(index, index + 1);
                  }}
                >
                  <i className="crm-i fa-arrow-down" role="img" aria-hidden="true" />
                </button>
              </td>
              <td className="form-inline">
                <LinkSelect
                  ctx={ctx}
                  link={item}
                  links={links}
                  label={ts("Link of %1", { 1: name })}
                  onChange={(next) => {
                    set(index, (target) => {
                      changeLinkItem(target, next);
                    });
                  }}
                />
              </td>
              <td className="crm-search-admin-icon-col">
                <IconPicker
                  label={ts("Icon of %1", { 1: name })}
                  value={item.icon ?? ""}
                  onChange={(icon) => {
                    set(index, (target) => {
                      target.icon = icon;
                    });
                  }}
                />
              </td>
              <td>
                <select
                  className="form-control crm-auto-width"
                  aria-label={ts("Open %1 in", { 1: name })}
                  value={item.target ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    set(index, (target) => {
                      target.target = value;
                    });
                  }}
                >
                  <option value="">{ts("Normal")}</option>
                  <option value="_blank">{ts("New tab")}</option>
                  <option value="crm-popup">{ts("Popup dialog")}</option>
                </select>
              </td>
              <td className="form-inline">
                <TokenText
                  ctx={ctx}
                  label={ts("Text of link %1", { 1: index + 1 })}
                  live
                  value={item.text ?? ""}
                  onChange={(text) => {
                    set(index, (target) => {
                      target.text = text;
                    });
                  }}
                />
              </td>
              <td>
                <LinkConditions
                  ctx={ctx}
                  label={name}
                  isToolbar={isToolbar}
                  conditions={item.conditions ?? []}
                  onChange={(conditions) => {
                    set(index, (target) => {
                      target.conditions = conditions;
                    });
                  }}
                />
              </td>
              <td>
                <select
                  className={`form-control crm-auto-width btn-${item.style ?? "default"}`}
                  aria-label={ts("Style of %1", { 1: name })}
                  value={item.style ?? "default"}
                  onChange={(event) => {
                    const value = event.target.value;
                    set(index, (target) => {
                      target.style = value;
                    });
                  }}
                >
                  {styles.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.value}
                    </option>
                  ))}
                </select>
              </td>
              <td className="crm-search-admin-icon-col">
                {group.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-xs btn-danger-outline"
                    aria-label={ts("Remove %1", { 1: name })}
                    onClick={() => {
                      onChange(group.filter((_, i) => i !== index));
                    }}
                  >
                    <i className="crm-i fa-times" role="img" aria-hidden="true" />
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={8} className="form-inline">
            <label htmlFor={`${id}-add`} className="sr-only">
              {ts("Add link to %1", { 1: label })}
            </label>
            <select
              id={`${id}-add`}
              className="form-control"
              value=""
              onChange={(event) => {
                const value = event.target.value;
                const picked = value === "other" ? { path: "civicrm/" } : links[Number(value)];
                if (!picked) return;
                const item = newLinkItem(picked);
                if (value === "other") changeLinkItem(item, picked);
                onChange([...group, item]);
              }}
            >
              <option value="">+ {ts("Add...")}</option>
              {links.map((link, index) => (
                <option key={index} value={index}>
                  {link.text}
                </option>
              ))}
              <option value="other">{ts("Other...")}</option>
            </select>
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
