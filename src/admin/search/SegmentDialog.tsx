import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { api4, errorMessage } from "../../api/civi";
import { ModelText } from "../widgets/ModelText";
import { Picker } from "../widgets/Picker";
import { entityOf, entitySelect, useFieldOptions, useSearchMetadata } from "./meta";
import { SearchCondition } from "./SearchCondition";
import {
  addItem,
  conditionFields,
  defaultField,
  hasDefault,
  isDefaultItem,
  moveItem,
  splitExpr,
  withCondition,
  type Segment,
  type SegmentItem,
} from "./segment";
import { useReturnFocus } from "../widgets/Dialog";

interface SegmentDialogProps {
  /** An existing segment; without it a new one, for `entity` when given. */
  id?: number;
  entity?: string;
  onClose: (saved: boolean) => void;
}

/** crmSearchAdminSegment: a computed field's items, each with the conditions that pick it. */
export function SegmentDialog({ id, entity, onClose }: SegmentDialogProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const meta = useSearchMetadata();
  const loaded = useQuery({
    queryKey: ["SearchSegment", "edit", id],
    queryFn: async () => {
      const [found] = await api4<Segment>("SearchSegment", "get", { where: [["id", "=", id]] });
      if (!found) throw new Error(ts("Search segment %1 not found.", { 1: String(id) }));
      return found;
    },
    enabled: id !== undefined,
    gcTime: 0,
  });
  const [draft, setDraft] = useState<Segment | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const schemaEntity = (name: string) => (meta.data ? entityOf(meta.data, name) : undefined);
  const fresh = (name: string): Segment => ({
    label: "",
    description: null,
    entity_name: name,
    items: name ? addItem([], schemaEntity(name), true) : [],
  });
  const segment =
    draft ?? loaded.data ?? (id === undefined && meta.data ? fresh(entity ?? "") : null);
  const options = useFieldOptions(segment?.entity_name);

  // deviation:dialog-return-focus
  useReturnFocus();
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  });

  const update = (change: Partial<Segment>) => {
    if (segment) setDraft({ ...segment, ...change });
  };
  const setItem = (index: number, item: SegmentItem) => {
    if (segment) update({ items: segment.items.map((old, i) => (i === index ? item : old)) });
  };

  async function save() {
    if (!segment) return;
    setSaving(true);
    setError(null);
    const status = window.CRM.status({});
    try {
      await api4("SearchSegment", "save", { records: [segment] });
      status.resolve();
      onClose(true);
    } catch (failure) {
      status.reject();
      setError(errorMessage(failure));
      setSaving(false);
    }
  }

  const current = segment ? schemaEntity(segment.entity_name) : undefined;
  const fields = conditionFields(current);
  const valid =
    !!segment &&
    !!segment.label.trim() &&
    !!segment.entity_name &&
    segment.items.length > 0 &&
    segment.items.every((item) => item.label.trim());
  return (
    <dialog
      ref={dialog}
      className="afreact-dialog afreact-dialog-wide"
      aria-labelledby={titleId}
      aria-busy={!segment}
      onClose={() => {
        onClose(false);
      }}
    >
      <h2 id={titleId} className="afreact-dialog-title">
        {id === undefined ? ts("New Search Segment") : ts("Edit Search Segment")}
      </h2>
      <form
        id={`${titleId}-form`}
        className="afreact-dialog-body"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid && !saving) void save();
        }}
      >
        {loaded.error || meta.error ? (
          <p className="crm-error" role="alert">
            {errorMessage(loaded.error ?? meta.error)}
          </p>
        ) : !segment ? (
          <p role="status">{ts("Loading...")}</p>
        ) : (
          <>
            <div className="form-group">
              <label htmlFor={`${titleId}-label`}>
                {ts("Name")} <span className="crm-marker">*</span>
              </label>
              <ModelText
                id={`${titleId}-label`}
                className="form-control"
                live
                required
                aria-describedby={`${titleId}-label-help`}
                value={segment.label}
                onChange={(label) => {
                  update({ label });
                }}
              />
              <div className="help-block" id={`${titleId}-label-help`}>
                {ts("Name of the new computed search field.")}
              </div>
            </div>
            <div className="form-group">
              <label htmlFor={`${titleId}-description`}>{ts("Description")}</label>
              <ModelText
                id={`${titleId}-description`}
                className="form-control"
                multiline
                live
                value={segment.description ?? ""}
                onChange={(description) => {
                  update({ description });
                }}
              />
            </div>
            <div className="form-group">
              <label htmlFor={`${titleId}-entity`}>
                {ts("For")} <span className="crm-marker">*</span>
              </label>
              <Picker
                id={`${titleId}-entity`}
                externalLabel
                label={ts("For")}
                placeholder={ts("Entity")}
                single
                options={meta.data ? entitySelect(meta.data) : []}
                value={segment.entity_name ? [segment.entity_name] : []}
                onChange={(picked) => {
                  const name = String(picked[0] ?? "");
                  update({
                    entity_name: name,
                    items: name ? addItem([], schemaEntity(name), true) : [],
                  });
                }}
              />
            </div>
            <fieldset>
              <legend>{ts("Items")}</legend>
              {segment.entity_name && (
                <table className="table">
                  <thead>
                    <tr>
                      <td />
                      <th scope="col">{ts("Label")}</th>
                      <th scope="col">{ts("Conditions")}</th>
                      <td />
                    </tr>
                  </thead>
                  <tbody>
                    {segment.items.map((item, index) => {
                      const itemLabel = item.label || ts("Item %1", { 1: index + 1 });
                      return (
                        <tr key={index}>
                          <td>
                            <div className="btn-group-vertical btn-group-xs">
                              <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={index === 0}
                                aria-label={ts("Move %1 up", { 1: itemLabel })}
                                onClick={() => {
                                  update({ items: moveItem(segment.items, index, index - 1) });
                                }}
                              >
                                <i className="crm-i fa-arrow-up" role="img" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={index === segment.items.length - 1}
                                aria-label={ts("Move %1 down", { 1: itemLabel })}
                                onClick={() => {
                                  update({ items: moveItem(segment.items, index, index + 1) });
                                }}
                              >
                                <i className="crm-i fa-arrow-down" role="img" aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                          <td>
                            <ModelText
                              className="form-control"
                              live
                              required
                              aria-label={ts("Label of item %1", { 1: index + 1 })}
                              value={item.label}
                              onChange={(label) => {
                                setItem(index, { ...item, label });
                              }}
                            />
                          </td>
                          <td>
                            {isDefaultItem(item) ? (
                              <em>{ts("Default Item")}</em>
                            ) : (
                              <>
                                {(item.when ?? []).map((condition, c) => {
                                  const { name, optionKey } = splitExpr(condition[0]);
                                  const field = current?.fields.find((f) => f.name === name);
                                  const fieldLabel = field?.label ?? name;
                                  const setCondition = (next: unknown[]) => {
                                    setItem(index, {
                                      ...item,
                                      when: (item.when ?? []).map((old, i) =>
                                        i === c ? next : old,
                                      ),
                                    });
                                  };
                                  return (
                                    <div key={c} className="form-inline">
                                      <Picker
                                        id={`${titleId}-item-${String(index)}-field-${String(c)}`}
                                        label={ts("Field")}
                                        placeholder={ts("Field")}
                                        single
                                        options={fields}
                                        value={
                                          typeof condition[0] === "string" ? [condition[0]] : []
                                        }
                                        onChange={(picked) => {
                                          setCondition([String(picked[0] ?? ""), "="]);
                                        }}
                                      />
                                      <SearchCondition
                                        label={fieldLabel}
                                        field={field && { ...field, entity: segment.entity_name }}
                                        clause={condition}
                                        offset={1}
                                        operators={meta.data?.operators ?? []}
                                        optionKey={optionKey}
                                        options={options.data?.[name]}
                                        onChange={setCondition}
                                      />
                                      {c > 0 && (
                                        <button
                                          type="button"
                                          className="crm-hover-button"
                                          aria-label={ts("Remove condition on %1", {
                                            1: fieldLabel,
                                          })}
                                          onClick={() => {
                                            setItem(index, {
                                              ...item,
                                              when: (item.when ?? []).filter((_, i) => i !== c),
                                            });
                                          }}
                                        >
                                          <i
                                            className="crm-i fa-times"
                                            role="img"
                                            aria-hidden="true"
                                          />
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                                <button
                                  type="button"
                                  className="btn btn-xs btn-secondary"
                                  onClick={() => {
                                    setItem(
                                      index,
                                      withCondition(item, defaultField(segment.items, current)),
                                    );
                                  }}
                                >
                                  <i className="crm-i fa-plus" role="img" aria-hidden="true" />{" "}
                                  {ts("Add Condition")}
                                </button>
                              </>
                            )}
                          </td>
                          <td className="text-right">
                            <button
                              type="button"
                              className="btn btn-xs btn-danger"
                              aria-label={ts("Remove %1", { 1: itemLabel })}
                              onClick={() => {
                                update({ items: segment.items.filter((_, i) => i !== index) });
                              }}
                            >
                              <i className="crm-i fa-trash" role="img" aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4}>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() => {
                            update({ items: addItem(segment.items, current, true) });
                          }}
                        >
                          <i className="crm-i fa-plus" role="img" aria-hidden="true" />{" "}
                          {ts("Add Item")}
                        </button>{" "}
                        {!hasDefault(segment.items) && (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => {
                              update({ items: addItem(segment.items, current, false) });
                            }}
                          >
                            <i className="crm-i fa-plus" role="img" aria-hidden="true" />{" "}
                            {ts("Default Item")}
                          </button>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </fieldset>
            {error && (
              <p className="alert alert-danger" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </form>
      <div className="afreact-dialog-buttons">
        <button
          type="submit"
          form={`${titleId}-form`}
          className="btn btn-primary"
          disabled={!valid || saving}
        >
          <i
            className={`crm-i ${saving ? "fa-spinner fa-spin" : "fa-save"}`}
            role="img"
            aria-hidden="true"
          />{" "}
          {ts("Save")}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            onClose(false);
          }}
        >
          {ts("Cancel")}
        </button>
      </div>
    </dialog>
  );
}
