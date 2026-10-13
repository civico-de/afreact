import { api4 } from "../../api/civi";

/** Afform.convert: a layout from one format into another. */
export async function convert(layout: unknown, from: string, to: string): Promise<unknown> {
  const [result] = await api4<{ layout: unknown }>("Afform", "convert", {
    layout,
    from,
    to,
    formatWhitespace: true,
  });
  if (!result) throw new Error("Afform.convert returned nothing.");
  return result.layout;
}

/**
 * Afform.save of a record whose layout is shallow. The layout goes as HTML, which save writes as
 * is and its pre hook's listeners read as HTML, where they take an array to be deep.
 * deviation:save-sends-html
 */
export async function saveAfform<T>(record: Record<string, unknown>): Promise<T> {
  const layout =
    record.layout === undefined ? {} : { layout: await convert(record.layout, "shallow", "html") };
  const [saved] = await api4<T>("Afform", "save", { records: [{ ...record, ...layout }] });
  if (!saved) throw new Error("Afform.save returned nothing.");
  // Save echoes the layout it was sent; callers get the shallow one back.
  return record.layout === undefined ? saved : { ...saved, layout: record.layout };
}
