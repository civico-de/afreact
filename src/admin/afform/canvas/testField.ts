import type { EditorApi } from "../context";
import type { AfformDefinition, EditorMeta } from "../meta";
import { META } from "../testMeta";
import type { NodeOps } from "./common";
import type { FieldApi } from "./Field";
import type { BaseDefn, FieldOption } from "./fieldModel";

/** A field's editing api for component tests, its writes spied on. */
export function fieldApi(
  base: BaseDefn,
  local: FieldApi["state"]["local"],
  { meta = META, options = null }: { meta?: EditorMeta; options?: FieldOption[] | null } = {},
): FieldApi {
  const afform: AfformDefinition = { type: "search", title: "Probe", layout: [] };
  const editor: EditorApi = {
    meta,
    afform,
    entities: [],
    change: vi.fn<EditorApi["change"]>(),
    selected: null,
    select: () => undefined,
    addMeta: () => undefined,
    removeEntity: () => undefined,
    saveBlocked: null,
    openDialog: () => undefined,
  };
  return {
    editor,
    ops: {
      path: [0],
      node: { "#tag": "af-field", name: base.name },
      edit: vi.fn<NodeOps["edit"]>(),
      remove: vi.fn<NodeOps["remove"]>(),
    },
    scope: {
      path: [],
      entityName: null,
      dataEntity: "",
      inFieldset: true,
      inBlock: false,
      join: null,
      label: "Form",
      axis: "y",
    },
    state: { base, local, isSearch: true, fieldName: base.name },
    defn: { ...base, ...local },
    set: vi.fn<FieldApi["set"]>(),
    update: vi.fn<FieldApi["update"]>(),
    hasDefault: false,
    toggleDefault: vi.fn<FieldApi["toggleDefault"]>(),
    setHasDefault: vi.fn<FieldApi["setHasDefault"]>(),
    options,
    originalOptions: options,
    display: undefined,
    fkEntity: undefined,
    fieldId: "probe",
    editOptions: vi.fn<FieldApi["editOptions"]>(),
  };
}
