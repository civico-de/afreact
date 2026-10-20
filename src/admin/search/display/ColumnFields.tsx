import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useId, useState, type ReactNode } from "react";
import { api4 } from "../../../api/civi";
import { itemText, searchPage, type AutocompleteItem } from "../../../afform/fields/autocomplete";
import { adminVars } from "../../vars";
import { IconPicker } from "../../widgets/IconPicker";
import { ModelNumber } from "../../widgets/ModelNumber";
import { ModelText } from "../../widgets/ModelText";
import { Picker, type PickerOption } from "../../widgets/Picker";
import { getAllFields, getEntity, getField, getSelectFields, type SearchInfo } from "../expr";
import { useFieldOptions } from "../meta";
import { SearchCondition } from "../SearchCondition";
import { SearchInput } from "../SearchInput";
import { CssRules, LinkGroup, LinkSelect, TokenText } from "./common";
import {
  keyField,
  keyOptionKey,
  canBeEditable,
  canBeImage,
  colLabel,
  colorFieldOf,
  dateFormatChoice,
  getDataType,
  getFieldLabel,
  isDate,
  linksFor,
  onChangeLink,
  setDateFormat,
  setIconClass,
  setIconField,
  setSuffix,
  suffixOf,
  suffixOptions,
  toggleColor,
  toggleEmptyVal,
  toggleHtml,
  toggleImage,
  toggleLink,
  toggleRewrite,
  withConditionField,
  type AdminColumn,
  type DisplayContext,
  type IconItem,
  type LinkItem,
} from "./model";

const Combobox = lazy(async () => ({
  default: (await import("../../../afform/fields/Combobox")).Combobox,
}));

export interface ColumnEditing {
  ctx: DisplayContext;
  col: AdminColumn;
  /** All row links of the search, tasks included. */
  links: LinkItem[];
  editCol: (change: (col: AdminColumn) => void) => void;
}

const Row = ({ children, title }: { children: ReactNode; title?: string }) => (
  <div className="form-inline crm-search-admin-flex-row" title={title}>
    {children}
  </div>
);

function Toggle({
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
    <label title={title} className={disabled ? "disabled" : undefined}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} /> {label}
    </label>
  );
}

/** The colType templates: what each column type configures beyond its header. */
export function ColumnTypeFields(props: ColumnEditing & { dateFormats: Record<string, string> }) {
  switch (props.col.type) {
    case "field":
      return <FieldColumn {...props} />;
    case "html":
      return <HtmlColumn {...props} />;
    case "image":
      return <ImageColumn {...props} />;
    case "include":
      return <IncludeColumn {...props} />;
    case "links":
    case "buttons":
    case "menu":
      return <LinksColumn {...props} />;
    case "subsearch":
      return <SubsearchColumn {...props} />;
    default:
      return (
        <p className="messages warning no-popup" role="status">
          {ts("Columns of type %1 cannot be configured here.", { 1: props.col.type })}
        </p>
      );
  }
}

function TooltipRow({ ctx, col, editCol }: ColumnEditing) {
  return (
    <Row>
      <Toggle
        label={ts("Tooltip")}
        checked={!!col.title}
        onChange={() => {
          editCol((c) => {
            c.title = c.title ? null : getFieldLabel(ctx, c.key ?? "");
          });
        }}
      />
      {!!col.title && (
        <TokenText
          ctx={ctx}
          label={ts("Tooltip")}
          value={col.title}
          onChange={(value) => {
            editCol((c) => {
              c.title = value;
            });
          }}
        />
      )}
    </Row>
  );
}

function EmptyRow({
  ctx,
  col,
  editCol,
  label,
  title,
}: ColumnEditing & { label: string; title: string }) {
  return (
    <Row>
      <Toggle
        label={label}
        title={title}
        checked={!!col.empty_value}
        onChange={() => {
          editCol(toggleEmptyVal);
        }}
      />
      {!!col.empty_value && (
        <TokenText
          ctx={ctx}
          label={label}
          multiline
          value={col.empty_value}
          onChange={(value) => {
            editCol((c) => {
              c.empty_value = value;
            });
          }}
        />
      )}
    </Row>
  );
}

function RewriteRow({
  ctx,
  col,
  editCol,
  label,
  title,
  trim = true,
}: ColumnEditing & { label: string; title: string; trim?: boolean }) {
  return (
    <Row>
      <Toggle
        label={label}
        title={title}
        checked={!!col.rewrite}
        onChange={() => {
          editCol(toggleRewrite);
        }}
      />
      {!!col.rewrite && (
        <TokenText
          ctx={ctx}
          label={label}
          multiline
          trim={trim}
          value={col.rewrite}
          onChange={(value) => {
            editCol((c) => {
              c.rewrite = value;
            });
          }}
        />
      )}
    </Row>
  );
}

function LinebreaksRow({ col, editCol }: Pick<ColumnEditing, "col" | "editCol">) {
  return (
    <div className="form-inline">
      <Toggle
        label={ts("Show Linebreaks")}
        checked={!!col.show_linebreaks}
        onChange={() => {
          editCol((c) => {
            c.show_linebreaks = !c.show_linebreaks;
          });
        }}
      />
    </div>
  );
}

function LinkRow({ ctx, col, links, editCol }: ColumnEditing) {
  const own = linksFor(ctx, links, col.key);
  return (
    <Row>
      <Toggle
        label={ts("Link")}
        title={ts("Display as clickable link")}
        checked={!!col.link}
        onChange={() => {
          editCol((c) => {
            toggleLink(c, own);
          });
        }}
      />
      {col.link && (
        <>
          <select
            className="form-control"
            aria-label={ts("Open link in")}
            value={col.link.target ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              editCol((c) => {
                if (c.link) c.link.target = value;
              });
            }}
          >
            <option value="">{ts("Open normally")}</option>
            <option value="_blank">{ts("New tab")}</option>
            <option value="crm-popup">{ts("Popup dialog")}</option>
          </select>
          <LinkSelect
            ctx={ctx}
            link={col.link}
            links={own}
            label={ts("Link of %1", { 1: colLabel(ctx, col) })}
            onChange={(next) => {
              editCol((c) => {
                onChangeLink(c, own, next);
              });
            }}
          />
        </>
      )}
    </Row>
  );
}

function FieldColumn(props: ColumnEditing & { dateFormats: Record<string, string> }) {
  const { ctx, col, editCol, dateFormats } = props;
  const id = useId();
  const suffixes = col.rewrite ? null : suffixOptions(ctx, col);
  const dataType = getDataType(ctx, col.key);
  const dateChoice = dateFormatChoice(col, dateFormats);
  const editable = canBeEditable(ctx, col);
  const numberAttributes = ctx.meta.numberAttributes;
  const format = typeof col.format === "object" && col.format !== null ? col.format : {};
  return (
    <>
      <div className="form-inline">
        {canBeImage(ctx, col) ? (
          <Toggle
            label={ts("Image")}
            checked={false}
            onChange={() => {
              editCol((c) => {
                toggleImage(ctx, c);
              });
            }}
          />
        ) : (
          <Toggle
            label={ts("Allow HTML")}
            checked={false}
            onChange={() => {
              editCol(toggleHtml);
            }}
          />
        )}
      </div>
      {suffixes && (
        <div className="form-inline">
          <label htmlFor={`${id}-suffix`}>{ts("Format")}</label>{" "}
          <select
            id={`${id}-suffix`}
            className="form-control"
            title={ts("Option Format")}
            value={suffixOf(col)}
            onChange={(event) => {
              const value = event.target.value;
              editCol((c) => {
                setSuffix(c, value);
              });
            }}
          >
            <option value="">{ts("Raw Value")}</option>
            {Object.entries(suffixes).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}
      {isDate(ctx, col.key) && (
        <div className="form-inline">
          <label htmlFor={`${id}-date`}>{ts("Format")}</label>{" "}
          <select
            id={`${id}-date`}
            className="form-control"
            title={ts("Date Format")}
            value={dateChoice}
            onChange={(event) => {
              const value = event.target.value;
              editCol((c) => {
                setDateFormat(c, value, dateFormats);
              });
            }}
          >
            <option value="">{ts("Date Format: Default")}</option>
            {Object.entries(dateFormats).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
            {/* A stored custom format stays visible on a core that ignores it. */}
            {(ctx.customDateFormat || dateChoice === "other") && (
              <option value="other">{ts("Other...")}</option>
            )}
          </select>
          {dateChoice === "other" && (
            <>
              {" "}
              <label htmlFor={`${id}-date-custom`} className="sr-only">
                {ts("Custom date format")}
              </label>
              {/* An emptied format reads as the default, so it is taken once left. */}
              {/* deviation:date-format-custom-on-blur */}
              <ModelText
                id={`${id}-date-custom`}
                className="form-control"
                placeholder={ts("Date Format")}
                value={typeof col.format === "string" ? col.format : ""}
                onChange={(value) => {
                  editCol((c) => {
                    c.format = value;
                  });
                }}
              />
            </>
          )}
        </div>
      )}
      {dataType === "Money" && (
        <div className="form-inline">
          <label htmlFor={`${id}-money`}>{ts("Format")}</label>{" "}
          <select
            id={`${id}-money`}
            className="form-control"
            title={ts("Money Format")}
            value={typeof col.format === "string" ? col.format : ""}
            onChange={(event) => {
              const value = event.target.value;
              editCol((c) => {
                c.format = value;
              });
            }}
          >
            <option value="">{ts("Currency")}</option>
            <option value="number">{ts("Number")}</option>
          </select>
        </div>
      )}
      {dataType === "Float" && (
        <div className="form-inline">
          {Object.entries(numberAttributes).map(([key, label]) => (
            <label key={key}>
              {label}{" "}
              <input
                type="number"
                className="form-control four"
                value={(() => {
                  const value: unknown = Reflect.get(format, key);
                  return typeof value === "number" ? value : "";
                })()}
                onChange={(event) => {
                  const value = event.target.valueAsNumber;
                  editCol((c) => {
                    const next =
                      typeof c.format === "object" && c.format !== null ? { ...c.format } : {};
                    Reflect.set(next, key, Number.isNaN(value) ? null : value);
                    c.format = next;
                  });
                }}
              />
            </label>
          ))}
        </div>
      )}
      <LinkRow {...props} />
      <TooltipRow {...props} />
      <EmptyRow
        {...props}
        label={ts("Empty placeholder")}
        title={ts("Text to display if the field contents are empty.")}
      />
      <RewriteRow
        {...props}
        label={ts("Rewrite Text")}
        title={ts("Change the contents of this field, or combine multiple field values.")}
        trim={false}
      />
      {!col.link && <LinebreaksRow col={col} editCol={editCol} />}
      <div className="form-inline">
        <Toggle
          label={ts("In-Place Edit")}
          title={
            editable
              ? ts("Users will be able to click to edit this field.")
              : ts("Read-only or rewritten fields cannot be editable.")
          }
          disabled={!editable}
          checked={editable && !!col.editable}
          onChange={() => {
            editCol((c) => {
              if (c.editable) delete c.editable;
              else c.editable = true;
            });
          }}
        />
      </div>
      <IconsConfig
        ctx={ctx}
        icons={col.icons}
        onChange={(icons) => {
          editCol((c) => {
            c.icons = icons;
          });
        }}
      />
      <ColorsConfig {...props} />
      <CssRules
        ctx={ctx}
        label={ts("Style")}
        rules={col.cssRules}
        defaultField={col.key}
        onChange={(rules) => {
          editCol((c) => {
            c.cssRules = rules;
          });
        }}
      />
    </>
  );
}

function HtmlColumn(props: ColumnEditing) {
  const { ctx, col, editCol } = props;
  return (
    <>
      <div className="form-inline">
        <Toggle
          label={ts("Allow HTML")}
          checked
          onChange={() => {
            editCol(toggleHtml);
          }}
        />
      </div>
      <TooltipRow {...props} />
      <EmptyRow
        {...props}
        label={ts("Empty placeholder")}
        title={ts("HTML to display if the field contents are empty.")}
      />
      <RewriteRow
        {...props}
        label={ts("Rewrite HTML")}
        title={ts("Change the contents of this field, or combine multiple field values.")}
      />
      <LinebreaksRow col={col} editCol={editCol} />
      <CssRules
        ctx={ctx}
        label={ts("Style")}
        rules={col.cssRules}
        defaultField={col.key}
        onChange={(rules) => {
          editCol((c) => {
            c.cssRules = rules;
          });
        }}
      />
    </>
  );
}

function ImageColumn(props: ColumnEditing) {
  const { ctx, col, editCol } = props;
  const id = useId();
  const image = col.image ?? {};
  const setSize = (key: "width" | "height", value: number | null | undefined) => {
    editCol((c) => {
      c.image = { ...c.image };
      if (value === undefined) delete c.image[key];
      else c.image[key] = value;
    });
  };
  return (
    <>
      <div className="form-inline">
        <Toggle
          label={ts("Image")}
          checked
          onChange={() => {
            editCol((c) => {
              toggleImage(ctx, c);
            });
          }}
        />
        <div className="crm-search-admin-flex-row">
          <label htmlFor={`${id}-w`}>{ts("Width")}</label>
          <ModelNumber
            id={`${id}-w`}
            min={1}
            className="form-control crm-flex-1"
            placeholder="Auto"
            value={image.width}
            onChange={(value) => {
              setSize("width", value);
            }}
          />
          <label htmlFor={`${id}-h`}>{ts("Height")}</label>
          <ModelNumber
            id={`${id}-h`}
            min={1}
            className="form-control crm-flex-1"
            placeholder="Auto"
            value={image.height}
            onChange={(value) => {
              setSize("height", value);
            }}
          />
          <TokenText
            ctx={ctx}
            label={ts("Alt Text")}
            hiddenLabel={false}
            suffix=""
            live
            value={image.alt ?? ""}
            onChange={(alt) => {
              editCol((c) => {
                c.image = { ...c.image, alt };
              });
            }}
          />
        </div>
      </div>
      <LinkRow {...props} />
      <TooltipRow {...props} />
      <EmptyRow
        {...props}
        label={ts("Alternate image")}
        title={ts("Image to display if the field contents are empty.")}
      />
      <RewriteRow
        {...props}
        label={ts("Custom image url")}
        title={ts("Specify url path to this image.")}
      />
      <CssRules
        ctx={ctx}
        label={ts("Style")}
        rules={col.cssRules}
        defaultField={col.key}
        onChange={(rules) => {
          editCol((c) => {
            c.cssRules = rules;
          });
        }}
      />
    </>
  );
}

function IncludeColumn({ col, editCol }: ColumnEditing) {
  const id = useId();
  return (
    <>
      <Row>
        <label htmlFor={id}>
          {ts("Template File")} <span className="crm-marker">*</span>
        </label>
        {/* deviation:include-path-kept */}
        <ModelText
          id={id}
          className="form-control crm-flex-1"
          required
          pattern="^~/.+/.+"
          placeholder="~/myModule/myTemplate.html"
          aria-describedby={`${id}-help`}
          live
          value={col.path ?? ""}
          onChange={(value) => {
            editCol((c) => {
              c.path = value;
            });
          }}
        />
      </Row>
      <p className="help-block" id={`${id}-help`}>
        {ts('Relative path to the custom template, e.g. "~/myModule/myTemplate.html"')}
      </p>
    </>
  );
}

const sizes = () => [
  { key: "btn-lg", label: ts("Large") },
  { key: "", label: ts("Regular") },
  { key: "btn-sm", label: ts("Small") },
  { key: "btn-xs", label: ts("Tiny") },
];

function LinksColumn({ ctx, col, links, editCol }: ColumnEditing) {
  const id = useId();
  const styleKeys = ctx.meta.styles.flatMap((opt) => [opt.key, `${opt.key}-outline`]);
  const sizeSelect = (label: string) => (
    <>
      <label htmlFor={`${id}-size`}>{label}</label>{" "}
      <select
        id={`${id}-size`}
        className="form-control crm-auto-width"
        value={col.size ?? ""}
        onChange={(event) => {
          const value = event.target.value;
          editCol((c) => {
            c.size = value;
          });
        }}
      >
        {/* Angular's unknown option, so a size it does not offer shows blank and can be changed. */}
        {!sizes().some((size) => size.key === (col.size ?? "")) && <option value={col.size} />}
        {sizes().map((size) => (
          <option key={size.key} value={size.key}>
            {size.label}
          </option>
        ))}
      </select>
    </>
  );
  return (
    <>
      {col.type === "buttons" && <div className="form-inline">{sizeSelect(ts("Button Size"))}</div>}
      {col.type === "menu" && (
        <>
          <div className="form-inline">
            {sizeSelect(ts("Menu Button Size"))}{" "}
            <label htmlFor={`${id}-style`}>{ts("Style")}</label>{" "}
            <select
              id={`${id}-style`}
              className="form-control"
              value={col.style ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                editCol((c) => {
                  c.style = value;
                });
              }}
            >
              {!styleKeys.includes(col.style ?? "") && <option value={col.style ?? ""} />}
              {ctx.meta.styles.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.value}
                </option>
              ))}
              {ctx.meta.styles.map((opt) => (
                <option key={`${opt.key}-outline`} value={`${opt.key}-outline`}>
                  {`${opt.value} ${ts("Outline")}`}
                </option>
              ))}
            </select>
          </div>
          <div className="form-inline">
            <span>{ts("Menu Icon/Text")}</span>{" "}
            <IconPicker
              label={ts("Menu Icon")}
              value={col.icon ?? ""}
              onChange={(icon) => {
                editCol((c) => {
                  c.icon = icon;
                });
              }}
            />{" "}
            <TokenText
              ctx={ctx}
              label={ts("Menu Text")}
              trim={false}
              value={col.text ?? ""}
              onChange={(text) => {
                editCol((c) => {
                  c.text = text;
                });
              }}
            />
          </div>
        </>
      )}
      <hr />
      <LinkGroup
        ctx={ctx}
        label={colLabel(ctx, col)}
        links={links}
        group={col.links ?? []}
        onChange={(group) => {
          editCol((c) => {
            c.links = group;
          });
        }}
      />
    </>
  );
}

/** searchAdminIcons: icons from a field or a chosen class, each always or on a condition. */
export function IconsConfig({
  ctx,
  icons,
  onChange,
}: {
  ctx: DisplayContext;
  icons: IconItem[] | undefined;
  onChange: (icons: IconItem[]) => void;
}) {
  const id = useId();
  const list = icons ?? [];
  const iconFields = iconFieldOptions(ctx);
  // pickIcon(): a field icon turns into a chosen one only once an icon is picked.
  const [picking, setPicking] = useState<number | null>(null);
  const ruleFields: PickerOption[] = [
    ...getSelectFields(ctx.meta, ctx.search).map((f) => ({
      ...f,
      id: String(f.id).replace(":label", ":name"),
    })),
    ...getAllFields(ctx.meta, ctx.search, ":name", ["Field", "Custom", "Extra", "Pseudo"]),
  ];
  const set = (index: number, change: (icon: IconItem) => void) => {
    onChange(
      list.map((icon, i) => {
        if (i !== index) return icon;
        const next = structuredClone(icon);
        change(next);
        return next;
      }),
    );
  };
  return (
    <>
      {list.map((icon, index) => {
        const name = ts("Icon %1", { 1: index + 1 });
        return (
          <div className="form-inline" key={index}>
            <span>{ts("Icon")}</span>{" "}
            <select
              className="form-control crm-auto-width"
              aria-label={ts("Source of %1", { 1: name })}
              value={picking === index ? "" : (icon.field ?? "")}
              onChange={(event) => {
                const value = event.target.value;
                if (!value) {
                  setPicking(index);
                  return;
                }
                setPicking(null);
                set(index, (target) => {
                  setIconField(target, value);
                });
              }}
            >
              {iconFields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.label}
                </option>
              ))}
              <option value="">{ts("Choose Icon...")}</option>
            </select>
            {(icon.icon !== undefined || picking === index) && (
              <IconPicker
                label={name}
                required
                value={icon.icon ?? ""}
                onChange={(value) => {
                  setPicking(null);
                  if (value)
                    set(index, (target) => {
                      setIconClass(target, value);
                    });
                }}
              />
            )}{" "}
            <select
              className="form-control crm-auto-width"
              aria-label={ts("Side of %1", { 1: name })}
              title={ts("Show icon on left or right side of the field")}
              value={icon.side}
              onChange={(event) => {
                const value = event.target.value;
                set(index, (target) => {
                  target.side = value;
                });
              }}
            >
              <option value="left">{ts("Align left")}</option>
              <option value="right">{ts("Align right")}</option>
            </select>
            {icon.if && (
              <span className="form-group">
                {" "}
                <span>{ts("If")}</span>{" "}
                <IconCondition
                  ctx={ctx}
                  clause={icon.if}
                  label={ts("Condition of %1", { 1: name })}
                  fields={ruleFields}
                  onChange={(clause) => {
                    set(index, (target) => {
                      target.if = clause;
                    });
                  }}
                />
              </span>
            )}
            <button
              type="button"
              className="btn btn-xs btn-danger-outline"
              aria-label={ts("Remove icon")}
              title={ts("Remove icon")}
              onClick={() => {
                onChange(list.filter((_, i) => i !== index));
              }}
            >
              <i className="crm-i fa-times" role="img" aria-hidden="true" />
            </button>
          </div>
        );
      })}
      <AddIcon
        id={id}
        fields={iconFields}
        hasIcons={list.length > 0}
        onAdd={(icon) => {
          onChange([...list, icon]);
        }}
      />
    </>
  );
}

function AddIcon({
  id,
  fields,
  hasIcons,
  onAdd,
}: {
  id: string;
  fields: { id: string; label: string }[];
  hasIcons: boolean;
  onAdd: (icon: IconItem) => void;
}) {
  const [picking, setPicking] = useState(false);
  return (
    <div className="form-inline" title={ts("Add icon(s) to this column")}>
      <label htmlFor={`${id}-add`}>{ts("Icon")}</label>{" "}
      <select
        id={`${id}-add`}
        className="form-control crm-auto-width"
        value="-"
        onChange={(event) => {
          const value = event.target.value;
          if (value === "") setPicking(true);
          else onAdd({ field: value, side: "left" });
        }}
      >
        <option value="-">{hasIcons ? ts("Add") : ts("None")}</option>
        {fields.map((field) => (
          <option key={field.id} value={field.id}>
            {field.label}
          </option>
        ))}
        <option value="">{ts("Choose Icon...")}</option>
      </select>
      {picking && (
        <IconPicker
          label={ts("New icon")}
          required
          value=""
          onChange={(icon) => {
            setPicking(false);
            if (icon) onAdd({ icon, side: "left", if: [] });
          }}
        />
      )}
    </div>
  );
}

/** The fields whose values are icons, named after their entity as searchAdminIcons does. */
function iconFieldOptions(ctx: DisplayContext): { id: string; label: string }[] {
  const mainTitle = getEntity(ctx.meta, ctx.search.api_entity)?.title ?? ctx.search.api_entity;
  const all = getAllFields(ctx.meta, ctx.search, ":icon");
  const firstGroup = all[0]?.group;
  return all.flatMap((option) =>
    String(option.id).endsWith("icon")
      ? [
          {
            id: String(option.id),
            label: `${option.group === firstGroup ? mainTitle : (option.group ?? "")} - ${option.label}`,
          },
        ]
      : [],
  );
}

function IconCondition({
  ctx,
  clause,
  label,
  fields,
  onChange,
}: {
  ctx: DisplayContext;
  clause: unknown[];
  label: string;
  fields: PickerOption[];
  onChange: (clause: unknown[]) => void;
}) {
  const id = useId();
  const name = typeof clause[0] === "string" ? clause[0] : "";
  const field = name ? keyField(ctx, name) : undefined;
  const options = useFieldOptions(field?.entity ?? ctx.search.api_entity);
  return (
    <>
      <Picker
        id={id}
        label={label}
        hiddenLabel
        placeholder={ts("Always")}
        className="crm-auto-width"
        single
        options={fields}
        value={name ? [name] : []}
        onChange={(picked) => {
          onChange(withConditionField(clause, 0, picked[0] === undefined ? "" : String(picked[0])));
        }}
      />
      {name && (
        <SearchCondition
          label={field?.label ?? name}
          field={field && { ...field, entity: field.entity ?? ctx.search.api_entity }}
          clause={clause}
          offset={1}
          operators={ctx.meta.operators}
          optionKey={keyOptionKey(ctx, name)}
          options={field ? options.data?.[field.name] : undefined}
          onChange={onChange}
        />
      )}
    </>
  );
}

/** searchAdminColors */
function ColorsConfig({ ctx, col, editCol }: ColumnEditing) {
  const colorField = colorFieldOf(ctx, col);
  const field = col.key ? keyField(ctx, col.key) : undefined;
  if (!colorField || !field) return null;
  return (
    <div className="form-inline">
      <Toggle
        label={ts("Use %1 color", { 1: field.label })}
        title={ts("Display this field as a colored badge, using its associated color.")}
        checked={!!col.colors?.length}
        onChange={() => {
          editCol((c) => {
            toggleColor(c, colorField);
          });
        }}
      />
    </div>
  );
}

export interface SubsearchFilter {
  subsearch_field?: string;
  parent_field?: string | null;
  value?: unknown;
}

/** A subsearch filter's new field, or without one the filter removed. */
/** $onInit: a filter holding both keeps its value, unless it is null or a parent field is set. */
export const filterMode = (filter: SubsearchFilter): "value" | "field" =>
  "value" in filter &&
  (!("parent_field" in filter) || (filter.value !== null && filter.parent_field === null))
    ? "value"
    : "field";

export const changeFilterField = (
  filters: SubsearchFilter[],
  index: number,
  field: string | null,
): SubsearchFilter[] =>
  // deviation:subsearch-filter-change
  field === null
    ? filters.filter((_, i) => i !== index)
    : filters.map((f, i) => (i === index ? { ...f, subsearch_field: field } : f));

const isFilter = (value: unknown): value is SubsearchFilter =>
  typeof value === "object" && value !== null && !Array.isArray(value);

interface SubsearchInfo {
  savedSearch: SearchInfo & { label: string };
  displays: { name: string; label: string }[];
}

function useSubsearchInfo(name: string | undefined) {
  return useQuery({
    queryKey: ["afreact-admin", "subsearch", name],
    queryFn: async (): Promise<SubsearchInfo | null> => {
      const [searches, displays] = await Promise.all([
        api4<SearchInfo & { label: string }>("SavedSearch", "get", {
          select: ["label", "api_entity", "api_params"],
          where: [["name", "=", name]],
        }),
        api4<{ name: string; label: string }>("SearchDisplay", "get", {
          select: ["name", "label"],
          where: [
            ["saved_search_id.name", "=", name],
            ["type", "IN", Object.keys(viewableDisplayTypes())],
          ],
        }),
      ]);
      const savedSearch = searches[0];
      return savedSearch ? { savedSearch, displays: [...displays] } : null;
    },
    enabled: !!name,
  });
}

/** CRM.crmSearchDisplay.viewableDisplayTypes, which core's page settings carry. */
function viewableDisplayTypes(): Record<string, string> {
  const types = adminVars().searchDisplay?.viewableDisplayTypes;
  if (!types) throw new Error("The SearchKit builder page carries no viewable display types.");
  return types;
}

/** The subsearch's columns as filter fields; a column with a suffix filters by `:name`. */
function subsearchFields(ctx: DisplayContext, search: SearchInfo): PickerOption[] {
  return search.api_params.select.flatMap((fieldName) => {
    const field = getField(ctx.meta, fieldName, search);
    if (!field) return [];
    const [name = "", suffix] = fieldName.split(":");
    return [{ id: name + (suffix ? ":name" : ""), label: field.label }];
  });
}

/** crmSearchAdminSubsearch: the saved search and display to embed, and how rows filter it. */
function SubsearchColumn(props: ColumnEditing) {
  const { ctx, col, editCol } = props;
  const id = useId();
  const sub = col.subsearch ?? { filters: [], subsearch_mode: "dropdown" };
  const searchName = typeof sub.search === "string" ? sub.search : undefined;
  const info = useSubsearchInfo(searchName);
  const filters = sub.filters.filter(isFilter);
  const subsearch = info.data?.savedSearch;
  const fields = subsearch ? subsearchFields(ctx, subsearch) : [];
  const [noIdFilter, setNoIdFilter] = useState(false);
  const setFilters = (next: SubsearchFilter[]) => {
    editCol((c) => {
      if (c.subsearch) c.subsearch.filters = next;
    });
  };
  const chooseSearch = async (name: string | null) => {
    // deviation:subsearch-cleared-drops-filters
    editCol((c) => {
      c.subsearch = { ...sub, search: name ?? undefined, display: null, filters: [] };
      if (!name) delete c.subsearch.search;
    });
    if (!name) return;
    const [found] = await api4<SearchInfo & { label: string }>("SavedSearch", "get", {
      select: ["label", "api_entity", "api_params"],
      where: [["name", "=", name]],
    });
    const displays = await api4<{ name: string }>("SearchDisplay", "get", {
      select: ["name"],
      where: [
        ["saved_search_id.name", "=", name],
        ["type", "IN", Object.keys(viewableDisplayTypes())],
      ],
    });
    if (!found) return;
    const base = getEntity(ctx.meta, ctx.search.api_entity);
    const baseKey = base?.primary_key[0] ?? "id";
    const defaults = found.api_params.select.flatMap((fieldName) => {
      const field = getField(ctx.meta, fieldName, found);
      return field?.fk_entity === base?.name ||
        (field?.name === baseKey && field.entity === base?.name)
        ? [{ subsearch_field: fieldName.split(":")[0], parent_field: baseKey }]
        : [];
    });
    setNoIdFilter(!defaults.length);
    editCol((c) => {
      if (c.subsearch?.search !== name) return;
      if ((c.label ?? "") === "") c.label = found.label;
      if ((c.rewrite ?? "") === "") c.rewrite = found.label;
      c.subsearch.display = displays[0]?.name ?? null;
      c.subsearch.filters = defaults;
    });
  };
  return (
    <>
      <Row>
        <span>{ts("Text")}</span>
        <TokenText
          ctx={ctx}
          label={ts("Text")}
          value={col.rewrite ?? ""}
          onChange={(value) => {
            editCol((c) => {
              c.rewrite = value;
            });
          }}
        />
      </Row>
      <IconsConfig
        ctx={ctx}
        icons={col.icons}
        onChange={(icons) => {
          editCol((c) => {
            c.icons = icons;
          });
        }}
      />
      <CssRules
        ctx={ctx}
        label={ts("Style")}
        rules={col.cssRules}
        defaultField={col.key}
        onChange={(rules) => {
          editCol((c) => {
            c.cssRules = rules;
          });
        }}
      />
      <div className="form-inline">
        <label htmlFor={`${id}-mode`}>{ts("Subsearch Display Mode")}</label>{" "}
        <select
          id={`${id}-mode`}
          className="form-control"
          value={sub.subsearch_mode}
          onChange={(event) => {
            const value = event.target.value;
            editCol((c) => {
              if (c.subsearch) c.subsearch.subsearch_mode = value;
            });
          }}
        >
          <option value="dropdown">{ts("Dropdown (Full-Width)")}</option>
          <option value="collapsed">{ts("Inline (Collapsed)")}</option>
          <option value="inline">{ts("Inline (Open)")}</option>
        </select>
      </div>
      {sub.subsearch_mode === "inline" && (
        <p className="status status-notice">
          {ts(
            "Note: Inline (Open) Subsearches could cause high server load, as they all run simultaneously. You will probably want to limit the number of results in both the parent and child searches, or switch to Inline (Collapsed) mode.",
          )}
        </p>
      )}
      <div className="help-block">{ts("Choose a Saved Search + Display to embed.")}</div>
      <div className="form-inline">
        <SavedSearchPicker
          id={`${id}-search`}
          value={searchName}
          label={info.data?.savedSearch.label}
          onChange={(name) => {
            void chooseSearch(name);
          }}
        />
        {searchName && (
          <>
            {" "}
            <label htmlFor={`${id}-display`} className="sr-only">
              {ts("Display")}
            </label>
            <select
              id={`${id}-display`}
              className="form-control"
              disabled={!info.data}
              value={typeof sub.display === "string" ? sub.display : ""}
              onChange={(event) => {
                const value = event.target.value;
                editCol((c) => {
                  if (c.subsearch) c.subsearch.display = value || null;
                });
              }}
            >
              <option value="">{ts("Search results table")}</option>
              {(info.data?.displays ?? []).map((display) => (
                <option key={display.name} value={display.name}>
                  {display.label}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
      {/* deviation:subsearch-missing-search-kept */}
      {searchName && info.data === null && (
        <p className="crm-error" role="alert">
          {ts("The saved search %1 no longer exists; choose another one.", { 1: searchName })}
        </p>
      )}
      {searchName && subsearch && (
        <table className="table table-condensed">
          <thead>
            <tr>
              <th>{ts("Filter Subsearch Display")}</th>
              <th>{ts("With Value")}</th>
            </tr>
          </thead>
          <tbody>
            {filters.map((filter, index) => (
              <tr key={index}>
                <td>
                  <Picker
                    id={`${id}-filter-${String(index)}`}
                    label={ts("Filter %1", { 1: index + 1 })}
                    hiddenLabel
                    placeholder=" "
                    single
                    options={fields}
                    value={filter.subsearch_field ? [filter.subsearch_field] : []}
                    onChange={(picked) => {
                      const next = picked[0];
                      setFilters(
                        changeFilterField(filters, index, next === undefined ? null : String(next)),
                      );
                    }}
                  />
                </td>
                <td>
                  <SubsearchCondition
                    ctx={ctx}
                    filter={filter}
                    search={subsearch}
                    label={ts("Value of filter %1", { 1: index + 1 })}
                    onChange={(next) => {
                      setFilters(filters.map((f, i) => (i === index ? next : f)));
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>
                <Picker
                  id={`${id}-add-filter`}
                  label={ts("Add Filter")}
                  hiddenLabel
                  placeholder={ts("Add Filter")}
                  single
                  options={fields}
                  value={[]}
                  onChange={(picked) => {
                    const next = picked[0];
                    if (next !== undefined)
                      setFilters([
                        ...filters,
                        { subsearch_field: String(next), parent_field: null },
                      ]);
                  }}
                />
              </td>
            </tr>
          </tfoot>
        </table>
      )}
      {noIdFilter && !filters.length && (
        <div className="help-block bg-warning">
          <i className="crm-i fa-info-circle" aria-hidden="true" role="img" />{" "}
          {ts("No join field found. You may need to add a field to the subsearch display first.")}
        </div>
      )}
    </>
  );
}

/** crmSearchAdminSubsearchCondition: a fixed value, or a field of the parent row. */
function SubsearchCondition({
  ctx,
  filter,
  search,
  label,
  onChange,
}: {
  ctx: DisplayContext;
  filter: SubsearchFilter;
  search: SearchInfo;
  label: string;
  onChange: (filter: SubsearchFilter) => void;
}) {
  const id = useId();
  const mode = filterMode(filter);
  const field = filter.subsearch_field
    ? getField(ctx.meta, filter.subsearch_field, search)
    : undefined;
  const options = useFieldOptions(field?.entity ?? search.api_entity);
  const { value: _value, parent_field: _parent, ...rest } = filter;
  return (
    <span className="form-inline">
      <select
        className="form-control crm-search-input-mode crm-auto-width"
        aria-label={ts("Kind of %1", { 1: label })}
        value={mode}
        onChange={(event) => {
          onChange(
            event.target.value === "value"
              ? { ...rest, value: null }
              : { ...rest, parent_field: null },
          );
        }}
      >
        <option value="value">{ts("Value")}</option>
        <option value="field">{ts("Field")}</option>
      </select>{" "}
      {mode === "value" && field && (
        <>
          <label htmlFor={id} className="sr-only">
            {label}
          </label>
          <SearchInput
            id={id}
            field={{ ...field, entity: field.entity ?? search.api_entity }}
            optionKey="name"
            options={options.data?.[field.name]}
            value={filter.value}
            onChange={(value) => {
              onChange({ ...rest, value });
            }}
          />
        </>
      )}
      {mode === "field" && (
        <Picker
          id={id}
          label={label}
          hiddenLabel
          placeholder={ts("Choose field")}
          single
          options={getAllFields(ctx.meta, ctx.search, "", ["Field", "Custom", "Extra"])}
          value={filter.parent_field ? [filter.parent_field] : []}
          onChange={(picked) => {
            onChange({ ...rest, parent_field: picked[0] === undefined ? null : String(picked[0]) });
          }}
        />
      )}
    </span>
  );
}

const SEARCH_PARAMS = { key: "name", formName: "searchAdmin", fieldName: "subsearchSearch" };

function SavedSearchPicker({
  id,
  value,
  label,
  onChange,
}: {
  id: string;
  value: string | undefined;
  label: string | undefined;
  onChange: (name: string | null) => void;
}) {
  const selected: AutocompleteItem[] = value ? [{ id: value, label: label ?? value }] : [];
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {ts("Saved Search")}
      </label>
      <Suspense fallback={<input id={id} className="form-control loading" disabled />}>
        <Combobox
          id={id}
          label={ts("Saved Search")}
          placeholder={ts("Saved Search")}
          describedBy={undefined}
          className={undefined}
          disabled={false}
          required={false}
          multiple={false}
          minLength={0}
          selected={selected}
          resolving={false}
          itemText={itemText}
          load={(input, context) => searchPage("SavedSearch", SEARCH_PARAMS, input, context)}
          onSelect={(item) => {
            onChange(String(item.id));
          }}
          onRemove={() => {
            onChange(null);
          }}
        />
      </Suspense>
      {/* select2's allowClear: core's input is not required, so its choice can be cleared. */}
      {value && (
        <button
          type="button"
          className="btn btn-xs crm-hover-button"
          aria-label={ts("Clear")}
          title={ts("Clear")}
          onClick={() => {
            onChange(null);
          }}
        >
          <i className="crm-i fa-times" role="img" aria-hidden="true" />
        </button>
      )}
    </>
  );
}
