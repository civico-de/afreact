import { useEffect, useEffectEvent, useRef } from "react";
import type { FieldDefn } from "../types";
import { useInvalid } from "./env";

interface RichTextEditorProps {
  id: string;
  defn: FieldDefn;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
  describedBy: string | undefined;
}

/**
 * fields/RichTextEditor.html: a textarea that core's CRM.wysiwyg turns into the site's editor,
 * which reports changes as jQuery "change" events. A disabled field gets a read-only editor.
 */
export function RichTextEditor({
  id,
  defn,
  value,
  onChange,
  disabled,
  describedBy,
}: RichTextEditorProps) {
  const invalid = useInvalid(id);
  const element = useRef<HTMLTextAreaElement>(null);
  const ready = useRef(false);
  const text = typeof value === "string" ? value : "";
  const wysiwyg = window.CRM.wysiwyg;

  const show = useEffectEvent((target: HTMLTextAreaElement) => {
    if (ready.current && wysiwyg && wysiwyg.getVal(target).trim() !== text.trim())
      wysiwyg.setVal(target, text);
  });
  const changed = useEffectEvent((target: HTMLTextAreaElement) => {
    if (!wysiwyg) return;
    // ngModel trims what crm-ui-richtext's textarea holds; the editor ends its HTML with a newline.
    const next = wysiwyg.getVal(target).trim();
    if (next !== text) onChange(next);
  });

  // deviation:rich-text-disabled
  // The editor reads the textarea's disabled state when it starts, so a change restarts it.
  useEffect(() => {
    const target = element.current;
    if (!target || !wysiwyg) return undefined;
    let mounted = true;
    wysiwyg.create(target).done(() => {
      if (!mounted) return;
      ready.current = true;
      show(target);
    });
    const listener = () => {
      changed(target);
    };
    const events = window.CRM.$(target).on("change", listener);
    return () => {
      mounted = false;
      ready.current = false;
      events.off("change", listener);
      wysiwyg.destroy(target);
    };
  }, [wysiwyg, disabled]);

  useEffect(() => {
    if (element.current) show(element.current);
  }, [text]);

  return (
    <>
      <textarea
        ref={element}
        id={id}
        name={defn.name}
        className={defn.input_style ?? undefined}
        disabled={disabled}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        value={text}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      {!wysiwyg && (
        <span className="crm-error" role="alert">
          {ts("The rich text editor is not loaded on this page.")}
        </span>
      )}
    </>
  );
}
