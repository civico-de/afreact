import { useState } from "react";
import { useEditor } from "../context";
import { PaletteFieldset, PaletteList } from "./common";
import { elementItems, extraFieldItems, globalBlockItems } from "./lists";

/** afGuiElements: the form's elements, blocks for any entity, and extra fields. */
export function ElementsTab() {
  const editor = useEditor();
  const [search, setSearch] = useState("");
  const term = search.toLowerCase();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      {editor.afform.type === "form" && (
        <div className="alert alert-warning">
          {ts(
            "Note: Extra fields are submitted with the form, but not saved to the CiviCRM database.",
          )}
        </div>
      )}
      <PaletteFieldset legend={ts("Add:")} search={search} onSearch={setSearch}>
        <PaletteList
          label={ts("Elements")}
          items={elementItems(editor.meta, editor.afform, term)}
          entity={null}
        />
        <PaletteList
          label={ts("Blocks")}
          items={globalBlockItems(editor.meta, editor.afform, term)}
          entity={null}
        />
        <PaletteList
          label={ts("Extra Fields")}
          items={extraFieldItems(editor.meta, editor.afform, term)}
          entity={null}
        />
      </PaletteFieldset>
    </form>
  );
}
