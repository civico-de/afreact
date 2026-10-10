import type { FieldDefn } from "../afform/types";
import type { DisplaySettings, RunPage } from "../search/types";
import type * as Core from "./core.gen";

type Item<T> = T extends readonly (infer I)[] ? I : never;
type Obj<T> = Exclude<T, readonly unknown[] | string | number | boolean | null | undefined>;
type Join<Prefix extends string, Key extends string> = Prefix extends "" ? Key : `${Prefix}.${Key}`;

/**
 * Paths of the keys in `Seen` that `Hand` does not declare, e.g. "input_attrs.min_length",
 * "options[].color". `unknown` in `Hand` accepts anything below it.
 */
export type UnknownKeys<Hand, Seen, Prefix extends string = ""> = unknown extends Hand
  ? never
  :
      | ([Item<Seen>] extends [never]
          ? never
          : UnknownKeys<Item<NonNullable<Hand>>, Item<Seen>, `${Prefix}[]`>)
      | ([Obj<Seen>] extends [never]
          ? never
          : {
              [K in keyof Obj<Seen> & string]: [Obj<Hand>] extends [never]
                ? Join<Prefix, K>
                : K extends keyof Obj<Hand>
                  ? UnknownKeys<Obj<Hand>[K], Obj<Seen>[K], Join<Prefix, K>>
                  : Join<Prefix, K>;
            }[keyof Obj<Seen> & string]);

/**
 * Keys core sends that the renderer's type neither declares nor lists in `Ignored`, and `Ignored`
 * entries core no longer sends or the type now declares. Each one fails tsc by name.
 */
type Unexplained<Hand, Seen, Ignored extends string> =
  | Exclude<UnknownKeys<Hand, Seen>, Ignored>
  | Exclude<Ignored, UnknownKeys<Hand, Seen>>;

/**
 * Not read in the browser: datepicker options for native date inputs, the reference filter the
 * server applies to the autocomplete, the ng-include path, unused option data.
 */
type FieldDefnIgnored =
  | "input_attrs.filter"
  | "input_attrs.start_date_years"
  | "input_attrs.end_date_years"
  | "input_attrs.label"
  | "input_attrs.size"
  | "template"
  | "options[].abbr"
  | "options[].color"
  | "options[].description"
  | "options[].grouping"
  | "options[].icon"
  | "options[].name";

/**
 * Applied on the server: by SearchDisplay.run, whose result arrives in the rows, and for auto
 * columns by AfformSearchMetadataInjector. `nested` is read by no 6.19 code.
 */
type TableSettingsServer =
  | "columnMode"
  | "cssRules"
  | "nested"
  | `columns[].${"dataType" | "empty_value" | "format" | "icons" | "image" | "label_hidden" | "link" | "links" | "rewrite" | "show_linebreaks" | "subsearch" | "text" | "title"}`;

/** Read by no display. */
type TableRunIgnored = "rows[].columns[].dataType";

export const fieldDefn: Record<
  Unexplained<FieldDefn, Core.FieldDefn, FieldDefnIgnored>,
  never
> = {};
export const tableSettings: Record<
  Unexplained<DisplaySettings, Core.TableSettings, TableSettingsServer>,
  never
> = {};
export const tableRun: Record<Unexplained<RunPage, Core.TableRun, TableRunIgnored>, never> = {};
