import { useEffect, useRef, useState } from "react";
import { InlineEdit } from "../../widgets/InlineEdit";
import { MoveButtons } from "../../widgets/ClauseMove";
import { NgElement } from "../../widgets/NgElement";
import type { FieldApi } from "./Field";
import { toLiteral } from "../literal";
import type { FieldOption } from "./fieldModel";

const same = (a: unknown, b: unknown) => String(a) === String(b);

/**
 * afGuiEditOptions: the field's options to order, relabel, remove and restore; "Done" keeps
 * them as the field's own list. Move buttons stand in for core's dragging.
 */
export function EditOptions({ api, onClose }: { api: FieldApi; onClose: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const original = api.originalOptions ?? [];
  const [options, setOptions] = useState<FieldOption[]>(() => [...(api.options ?? [])]);
  const [deleted, setDeleted] = useState<FieldOption[]>(() =>
    original.filter((item) => !(api.options ?? []).some((option) => same(option.id, item.id))),
  );
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const originalLabel = (id: unknown) => original.find((item) => same(item.id, id))?.label ?? "";
  // deviation:option-move-buttons
  const move = (index: number, by: number) => {
    const next = [...options];
    const [item] = next.splice(index, 1);
    if (!item) return null;
    next.splice(index + by, 0, item);
    setOptions(next);
    return `option:${String(item.id)}`;
  };
  return (
    <NgElement tag="af-gui-edit-options" className="af-gui-content-editing-area">
      <div className="af-gui-edit-options-bar">
        <h4 ref={heading} tabIndex={-1} className="pull-left">
          {ts("Customize options")}
        </h4>
        <div className="btn-group-sm">
          <button type="button" className="btn btn-default" onClick={onClose}>
            <i className="crm-i fa-times-circle" role="img" aria-hidden="true" /> {ts("Cancel")}
          </button>{" "}
          <button
            type="button"
            className="btn btn-success"
            onClick={() => {
              api.set("options", toLiteral(options));
              onClose();
            }}
          >
            <i className="crm-i fa-check-circle" role="img" aria-hidden="true" /> {ts("Done")}
          </button>
        </div>
      </div>
      <ul className="af-gui-edit-options-enabled">
        {options.map((option, index) => (
          <li key={String(option.id)}>
            <InlineEdit
              label={ts("Option label")}
              value={option.label}
              defaultValue={originalLabel(option.id)}
              onChange={(label) => {
                setOptions(options.map((item, at) => (at === index ? { ...item, label } : item)));
              }}
            />
            <span className="pull-right">
              <MoveButtons
                focusKey={`option:${String(option.id)}`}
                name={option.label}
                canMove={(direction) =>
                  direction === "up" ? index > 0 : index < options.length - 1
                }
                onMove={(direction) => move(index, direction === "up" ? -1 : 1)}
              />{" "}
              <button
                type="button"
                className="btn btn-danger-outline btn-xs"
                title={ts("Remove option")}
                aria-label={ts("Remove option %1", { 1: option.label })}
                onClick={() => {
                  setOptions(options.filter((_, at) => at !== index));
                  setDeleted([...deleted, option]);
                }}
              >
                <i className="crm-i fa-trash" role="img" aria-hidden="true" />
              </button>
            </span>
          </li>
        ))}
      </ul>
      {deleted.length > 0 && (
        <>
          <h5>{ts("Deleted options")}</h5>
          <ul className="af-gui-edit-options-deleted">
            {deleted.map((option, index) => (
              <li key={String(option.id)}>
                <div>{option.label}</div>
                <button
                  type="button"
                  className="btn btn-success-outline btn-xs pull-right"
                  title={ts("Restore option")}
                  aria-label={ts("Restore option %1", { 1: option.label })}
                  onClick={() => {
                    setDeleted(deleted.filter((_, at) => at !== index));
                    setOptions([...options, option]);
                  }}
                >
                  <i className="crm-i fa-arrow-circle-o-up" role="img" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </NgElement>
  );
}
