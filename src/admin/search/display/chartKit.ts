import { getDefaultLabel, parseExpr, type SearchInfo } from "../expr";
import type { SearchAdminMetadata } from "../meta";

/** searchAdminDisplayChartKit as functions over chart_kit's own chart types and type backends. */

export interface ChartOption {
  key: string;
  label: string;
}

export interface ChartAxis {
  label: string;
  sourceDataTypes?: string[];
  scaleTypes: string[];
  reduceTypes: string[];
  seriesTypes: string[];
  dataLabelTypes: string[];
  dataLabelFormatters: string[];
  multiColumn: boolean;
  prepopulate: boolean;
  colorType?: string;
  maxColumns: number;
}

export interface ChartBackend {
  getAxes: () => Record<string, Partial<ChartAxis>>;
  getInitialDisplaySettings: () => Record<string, unknown>;
  hasCoordinateGrid: () => boolean;
}

export interface ChartKit {
  chartTypes: (ChartOption & { icon: string; backend: string })[];
  typeBackends: Record<string, ChartBackend>;
  columnOptions: Record<ColumnConfig, ChartOption[]>;
  legacySettingsAdaptor: (settings: ChartSettings) => ChartSettings;
}

export interface ChartColumn {
  axis: string;
  key?: string | null;
  label?: string;
  color?: string;
  index?: number;
  name?: string;
  sourceDataType?: string;
  isOrder?: boolean;
  useRightAxis?: boolean;
  [config: string]: unknown;
}

export interface ChartSettings {
  chartType?: string | null;
  columns?: ChartColumn[];
  format?: Record<string, unknown> & { padding?: Record<string, unknown> };
  [key: string]: unknown;
}

export interface SearchColumn {
  key: string;
  label: string;
  dataType: string | undefined;
}

export const COLUMN_CONFIGS = [
  "scaleType",
  "datePrecision",
  "reduceType",
  "seriesType",
  "dataLabelType",
  "dataLabelFormatter",
] as const;
export type ColumnConfig = (typeof COLUMN_CONFIGS)[number];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isOptions = (value: unknown): value is ChartOption[] =>
  Array.isArray(value) &&
  value.every((o) => isRecord(o) && typeof o.key === "string" && typeof o.label === "string");

/** CRM.chart_kit once its bundle has run, checked for the members the editor uses. */
export function readChartKit(value: unknown): ChartKit {
  const fail = (what: string) => new Error(`chart_kit's bundle has no ${what}.`);
  if (!isRecord(value)) throw fail("CRM.chart_kit");
  const { chartTypes, typeBackends, columnOptions, utils } = value;
  if (
    !isOptions(chartTypes) ||
    !chartTypes.every((t) => isRecord(t) && typeof t.backend === "string")
  )
    throw fail("chart types");
  if (!isRecord(typeBackends)) throw fail("type backends");
  const backends: Record<string, ChartBackend> = {};
  for (const [key, backend] of Object.entries(typeBackends)) {
    if (
      !isRecord(backend) ||
      typeof backend.getAxes !== "function" ||
      typeof backend.getInitialDisplaySettings !== "function" ||
      typeof backend.hasCoordinateGrid !== "function"
    )
      throw fail(`complete type backend "${key}"`);
    const { getAxes, getInitialDisplaySettings, hasCoordinateGrid } = backend;
    backends[key] = {
      getAxes: () => {
        const axes: unknown = Reflect.apply(getAxes, backend, []);
        if (!isRecord(axes)) throw fail(`axes for "${key}"`);
        return Object.fromEntries(
          Object.entries(axes).map(([k, axis]) => {
            if (!isRecord(axis)) throw fail(`axis "${k}" for "${key}"`);
            return [k, axis];
          }),
        );
      },
      getInitialDisplaySettings: () => {
        const settings: unknown = Reflect.apply(getInitialDisplaySettings, backend, []);
        if (!isRecord(settings)) throw fail(`initial settings for "${key}"`);
        return settings;
      },
      hasCoordinateGrid: () => Reflect.apply(hasCoordinateGrid, backend, []) === true,
    };
  }
  if (!isRecord(columnOptions)) throw fail("column options");
  const optionList = (config: ColumnConfig) => {
    const list = columnOptions[config];
    if (!isOptions(list)) throw fail(`${config} options`);
    return list;
  };
  if (!isRecord(utils) || typeof utils.legacySettingsAdaptor !== "function")
    throw fail("legacy settings adaptor");
  const adaptor = utils.legacySettingsAdaptor;
  return {
    chartTypes: chartTypes.map((t) => ({
      key: t.key,
      label: t.label,
      icon: isRecord(t) && typeof t.icon === "string" ? t.icon : "",
      backend: String(Reflect.get(t, "backend")),
    })),
    typeBackends: backends,
    columnOptions: {
      scaleType: optionList("scaleType"),
      datePrecision: optionList("datePrecision"),
      reduceType: optionList("reduceType"),
      seriesType: optionList("seriesType"),
      dataLabelType: optionList("dataLabelType"),
      dataLabelFormatter: optionList("dataLabelFormatter"),
    },
    legacySettingsAdaptor: (settings) => {
      const adapted: unknown = Reflect.apply(adaptor, utils, [settings]);
      if (!isRecord(adapted)) throw fail("settings from the legacy adaptor");
      return adapted;
    },
  };
}

/** The search's columns; option labels count as their own type, not as numbers. */
export function searchColumns(meta: SearchAdminMetadata, search: SearchInfo): SearchColumn[] {
  return search.api_params.select.map((select) => {
    const info = parseExpr(meta, select, search);
    const field = info.args.find((arg) => arg.type === "field")?.field;
    const dataType = select.includes(":label")
      ? "Option"
      : (info.fn?.data_type ?? field?.data_type);
    return { key: info.alias, label: getDefaultLabel(meta, select, search), dataType };
  });
}

export function backendOf(kit: ChartKit, settings: ChartSettings): ChartBackend | undefined {
  const type = kit.chartTypes.find((t) => t.key === settings.chartType);
  return type ? kit.typeBackends[type.backend] : undefined;
}

export function axesOf(kit: ChartKit, backend: ChartBackend): Record<string, ChartAxis> {
  const keys = (config: ColumnConfig) => kit.columnOptions[config].map((o) => o.key);
  return Object.fromEntries(
    Object.entries(backend.getAxes()).map(([key, axis]) => {
      const merged: ChartAxis = {
        reduceTypes: keys("reduceType"),
        scaleTypes: keys("scaleType"),
        dataLabelTypes: keys("dataLabelType"),
        seriesTypes: [],
        dataLabelFormatters: keys("dataLabelFormatter"),
        multiColumn: false,
        prepopulate: true,
        label: key,
        ...axis,
        maxColumns: axis.multiColumn ? -1 : 1,
      };
      return [key, merged];
    }),
  );
}

/** getColumns: numbers each column on its axis, as chart_kit stores, and skips extra ones. */
export function chartColumns(settings: ChartSettings, axes: Record<string, ChartAxis>) {
  const counts: Record<string, number> = {};
  return (settings.columns ?? []).flatMap((col, index) => {
    col.index = index;
    const axis = axes[col.axis];
    if (!axis) return [];
    const at = counts[col.axis] ?? 0;
    if (axis.maxColumns >= 0 && axis.maxColumns <= at) return [];
    col.name = `${col.axis}_${String(at)}`;
    counts[col.axis] = at + 1;
    return [col];
  });
}

export interface ChartContext {
  kit: ChartKit;
  axes: Record<string, ChartAxis>;
  columns: SearchColumn[];
}

const dataTypeOf = (ctx: ChartContext, col: ChartColumn) =>
  ctx.columns.find((c) => c.key === col.key)?.dataType;

export function searchColumnOptions(ctx: ChartContext, col: ChartColumn): SearchColumn[] {
  const allowed = ctx.axes[col.axis]?.sourceDataTypes;
  if (!allowed?.length) return ctx.columns;
  return ctx.columns.filter((c) => c.dataType !== undefined && allowed.includes(c.dataType));
}

export function configOptions(ctx: ChartContext, col: ChartColumn, config: ColumnConfig): string[] {
  const axis = ctx.axes[col.axis];
  if (!axis) return [];
  const type = dataTypeOf(ctx, col);
  switch (config) {
    case "scaleType": {
      let options = axis.scaleTypes;
      if (type === "Date" || type === "Time" || type === "Timestamp")
        options = ["date", "categorical"].filter((o) => options.includes(o));
      else if (type === "Integer")
        options = ["integer", "numeric", "categorical"].filter((o) => options.includes(o));
      else if (type === "String") options = options.filter((o) => o === "categorical");
      else options = options.filter((o) => o !== "date");
      if (col.key?.includes(":label") && options.includes("categorical")) return ["categorical"];
      return options;
    }
    case "datePrecision":
      return type === "Date" || type === "Time" || type === "Timestamp"
        ? ctx.kit.columnOptions.datePrecision.map((o) => o.key)
        : [];
    case "reduceType": {
      const options = col.axis === "x" ? ["list"] : axis.reduceTypes;
      return col.scaleType === "categorical" || col.scaleType === "date"
        ? options.filter((o) => o === "count" || o === "list")
        : options;
    }
    case "seriesType":
      return axis.seriesTypes;
    case "dataLabelType":
      return axis.dataLabelTypes;
    case "dataLabelFormatter":
      break;
  }
  if (type === "Money") return ["formatMoney", "round", "none"];
  if (col.scaleType === "categorical") return ["none", "round", "formatMoney"];
  if (col.scaleType === "integer" || col.scaleType === "date") return ["none"];
  return axis.dataLabelFormatters;
}

export function optionDetails(ctx: ChartContext, col: ChartColumn, config: ColumnConfig) {
  const all = ctx.kit.columnOptions[config];
  return configOptions(ctx, col, config).flatMap((key) => all.filter((o) => o.key === key));
}

/** onColumnSearchColumnChange: the field's label and type, and the first option of each setting. */
export function pickSearchColumn(ctx: ChartContext, col: ChartColumn, key: string | null): void {
  col.key = key;
  const picked = ctx.columns.find((c) => c.key === key);
  if (picked) {
    col.label = picked.label;
    if (picked.dataType !== undefined) col.sourceDataType = picked.dataType;
  }
  for (const config of COLUMN_CONFIGS) col[config] = configOptions(ctx, col, config)[0] ?? null;
}

export function addColumn(ctx: ChartContext, settings: ChartSettings, axis: string): void {
  const used = chartColumns(settings, ctx.axes).map((c) => c.key);
  const col: ChartColumn = { axis };
  const free = searchColumnOptions(ctx, col).find((c) => !used.includes(c.key));
  settings.columns = [...(settings.columns ?? []), col];
  pickSearchColumn(ctx, col, free?.key ?? null);
}

const BASE_SETTINGS = () => ({
  columns: [],
  format: {
    labelColor: "#000000",
    backgroundColor: "#f2f2ed",
    height: 480,
    width: 700,
    padding: { outer: 10, clip: 20, top: 50, bottom: 50, left: 50, right: 50 },
  },
});

// deviation:chart-legacy-settings-guarded
/** What the legacy adaptor dereferences without a check: the column list and the order index. */
function adaptable(settings: ChartSettings): ChartSettings {
  const columns = Array.isArray(settings.columns) ? settings.columns : [];
  const order = settings.chartOrderColIndex;
  if (typeof order === "number" && !columns[order])
    Reflect.deleteProperty(settings, "chartOrderColIndex");
  return { ...settings, columns };
}

/** $onInit and the chart type watch: defaults under the stored settings, a column per axis. */
export function initChart(kit: ChartKit, columns: SearchColumn[], raw: unknown): ChartSettings {
  const settings: ChartSettings = isRecord(raw)
    ? kit.legacySettingsAdaptor(adaptable(structuredClone(raw)))
    : { chartType: null };
  return applyChartType(kit, columns, settings);
}

/** onSetChartType: the chosen type's defaults under the settings, and its axes' first columns. */
export function applyChartType(
  kit: ChartKit,
  columns: SearchColumn[],
  current: ChartSettings,
): ChartSettings {
  let settings = current;
  const backend = backendOf(kit, settings);
  if (!backend) return settings;
  const base = BASE_SETTINGS();
  const typed = backend.getInitialDisplaySettings();
  const typedFormat = isRecord(typed.format) ? typed.format : {};
  settings = { ...base, ...typed, ...settings };
  settings.format = { ...base.format, ...typedFormat, ...settings.format };
  const ctx: ChartContext = { kit, axes: axesOf(kit, backend), columns };
  for (const [key, axis] of Object.entries(ctx.axes)) {
    if (!axis.prepopulate) continue;
    if (chartColumns(settings, ctx.axes).some((col) => col.axis === key)) continue;
    addColumn(ctx, settings, key);
  }
  chartColumns(settings, ctx.axes);
  return settings;
}

export function setOrderColumn(settings: ChartSettings, index: number): void {
  for (const col of settings.columns ?? []) col.isOrder = false;
  const col = settings.columns?.[index];
  if (col) col.isOrder = true;
}

// deviation:chart-scale-type-repicks
/** The first option of each setting whose stored value its column's type no longer offers. */
export function settleColumnOptions(ctx: ChartContext, settings: ChartSettings): void {
  for (const col of chartColumns(settings, ctx.axes))
    for (const config of COLUMN_CONFIGS) {
      const options = configOptions(ctx, col, config);
      if (options.length && !options.some((o) => o === col[config])) col[config] = options[0];
    }
}
