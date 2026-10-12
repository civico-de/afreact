import { useId } from "react";
import { Dropdown } from "../../widgets/Dropdown";
import { Picker } from "../../widgets/Picker";
import { useEditor } from "../context";
import { formTokens } from "../tokens";

/**
 * afGuiTokenSelect: appends a `[token]` of the form's entities to a text. Core's action menu
 * shows as a select2 box with a code icon; its list opens with a search.
 */
export function FormTokenSelect({
  value,
  onChange,
  submission = false,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Offers the submission's tokens as well. */
  submission?: boolean;
  className?: string;
}) {
  const editor = useEditor();
  const id = useId();
  const options = formTokens(editor, submission).flatMap((group) =>
    group.children.map((token) => ({
      id: token.id,
      label: token.text,
      group: group.text,
      description: token.description,
    })),
  );
  return (
    <span className={className}>
      <Dropdown
        groupClass="select2-container form-control crm-auto-width crm-action-menu afreact-token-menu"
        buttonClass="select2-choice select2-default"
        title={ts("Insert Token")}
        label={
          <>
            <span className="select2-chosen">
              <i className="crm-i fa-code" role="img" aria-hidden="true" />
            </span>
            <span className="select2-arrow">
              <b />
            </span>
          </>
        }
      >
        {(close) => (
          <li className="afreact-token-search">
            <Picker
              id={id}
              label={ts("Insert Token")}
              hiddenLabel
              placeholder={ts("Search")}
              single
              // deviation:token-groups-by-entity-name
              openOnMount
              options={options}
              value={[]}
              onChange={(picked) => {
                const key = picked[0];
                if (key === undefined) return;
                onChange(`${value}${value.length ? " " : ""}[${String(key)}]`);
                close();
              }}
            />
          </li>
        )}
      </Dropdown>
    </span>
  );
}
