import { useEditor } from "../context";
import { PaletteAdd, PaletteList, usePaletteSearch } from "./common";
import { elementItems, extraFieldItems, globalBlockItems } from "./lists";

/** afGuiElements: the form's elements, blocks for any entity, and extra fields. */
export function ElementsTab() {
  const editor = useEditor();
  const [search, setSearch] = usePaletteSearch("extra");
  const term = search.toLowerCase();
  return (
    <form
      className="afreact-palette-sections"
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
      <PaletteAdd name="elements-add" title={ts("Add")} search={search} onSearch={setSearch}>
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
      </PaletteAdd>
    </form>
  );
}
