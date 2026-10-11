/**
 * The display settings keys the React editors know: what core's SearchKit and chart_kit
 * editors and runtime read, plus what core's packaged displays carry. `true` takes any value;
 * a shape checks a record, or each record in a list.
 */
interface Shape {
  readonly [key: string]: Shape | true;
}

const any = (names: string): Shape =>
  Object.fromEntries(names.split(" ").map((name) => [name, true] as const));

const LINK = any(
  "action autoOpen condition conditions csrf entity icon join path size style target task text title",
);

const COLUMN: Shape = {
  ...any(
    "alignment break colors cssRules dataType default editable empty empty_value forceLabel format icon index key label label_hidden name nowrap path required rewrite show_linebreaks size sortable spec style text title type",
  ),
  link: LINK,
  links: LINK,
  icons: any("field icon if side"),
  image: any("alt height width"),
  subsearch: {
    ...any("display search subsearch_mode"),
    filters: any("parent_field subsearch_field"),
  },
  tally: any("fn label rewrite target"),
};

const SEARCH_KIT: Shape = {
  ...any(
    "actions actions_display_mode button classes colno collapsible columnMode cssRules data_mode description draggable entity_permission entity_permission_operator extra header_tag headerCount hideThead hierarchical limit nested noResultsText parent_field placeholder primaryKey searchFields section_group_by sort style symbol toggleColumns",
  ),
  columns: COLUMN,
  toolbar: LINK,
  addButton: LINK,
  pager: any("expose_limit hide_single show_count"),
  tally: any("footer header label"),
  editableRow: any("create createLabel disable full"),
};

const CHART_KIT: Shape = {
  ...any(
    "barGap barWidth chartOrderDir chartType colorScaleMax colorScaleMin description maxSegments seriesDisplayType showDownloadLinks showLegend",
  ),
  columns: any(
    "axis color dataLabelColumnPrefix dataLabelFormatter dataLabelType datePrecision index isOrder key label name reduceType scaleType seriesType sourceDataType useRightAxis",
  ),
  format: {
    ...any(
      "backgroundColor height labelColor rightYAxisLabel title width xAxisGridlines xAxisLabel yAxisGridlines yAxisLabel",
    ),
    padding: any("bottom clip inner left outer right top"),
  },
};

const SHAPES: Record<string, Shape> = { "chart-kit": CHART_KIT };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function unknownIn(value: unknown, shape: Shape, path: string, found: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      unknownIn(item, shape, `${path}[${String(index)}]`, found);
    });
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    const known = Object.hasOwn(shape, key) ? shape[key] : undefined;
    const at = path ? `${path}.${key}` : key;
    if (known === undefined) found.push(at);
    else if (known !== true) unknownIn(item, known, at, found);
  }
}

/** The paths in a display's settings that its React editor does not know, in stored order. */
export function unknownSettings(type: string, settings: unknown): string[] {
  const found: string[] = [];
  unknownIn(settings, SHAPES[type] ?? SEARCH_KIT, "", found);
  return found;
}
