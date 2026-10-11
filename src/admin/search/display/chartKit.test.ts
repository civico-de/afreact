import { describe, expect, it } from "vitest";
import { metadata } from "../../../test/searchMetadata";
import {
  addColumn,
  applyChartType,
  axesOf,
  chartColumns,
  configOptions,
  initChart,
  pickSearchColumn,
  readChartKit,
  searchColumnOptions,
  searchColumns,
  setOrderColumn,
  type ChartContext,
  type ChartSettings,
} from "./chartKit";

const options = (...keys: string[]) => keys.map((key) => ({ key, label: key.toUpperCase() }));

/** chart_kit's global as its bundle leaves it, cut down to a pie and a series chart. */
const rawKit = () => ({
  chartTypes: [
    { key: "pie", label: "Pie", icon: "fa-pie-chart", backend: "pie" },
    { key: "line", label: "Line", icon: "fa-line-chart", backend: "series" },
  ],
  typeBackends: {
    pie: {
      getAxes: () => ({
        w: { label: "Category", reduceTypes: ["list"] },
        y: { label: "Value", sourceDataTypes: ["Integer", "Money"] },
      }),
      getInitialDisplaySettings: () => ({ showLegend: "left", maxSegments: 6 }),
      hasCoordinateGrid: () => false,
    },
    series: {
      getAxes: () => ({
        x: { label: "X" },
        y: { label: "Y", multiColumn: true, colorType: "one-per-column" },
        z: { label: "Group", prepopulate: false },
      }),
      getInitialDisplaySettings: () => ({ format: { height: 300 } }),
      hasCoordinateGrid: () => true,
    },
  },
  columnOptions: {
    scaleType: options("numeric", "integer", "categorical", "date"),
    datePrecision: options("year", "month"),
    reduceType: options("sum", "count", "list"),
    seriesType: options("line", "bar"),
    dataLabelType: options("none", "title"),
    dataLabelFormatter: options("none", "round", "formatMoney"),
  },
  utils: {
    legacySettingsAdaptor(settings: ChartSettings) {
      return settings.chartType === "old" ? { ...settings, chartType: "line" } : settings;
    },
  },
});

const kit = readChartKit(rawKit());
const search = {
  api_entity: "Contact",
  api_params: {
    version: 4,
    select: ["id", "display_name", "gender_id:label", "birth_date", "COUNT(id) AS COUNT_id"],
  },
};
const columns = searchColumns(metadata, search);
const contextFor = (type: string): ChartContext => {
  const backend = kit.typeBackends[type];
  if (!backend) throw new Error(`No backend ${type}`);
  return { kit, axes: axesOf(kit, backend), columns };
};

describe("chart_kit admin model", () => {
  it("refuses a chart_kit global without the members the editor uses", () => {
    expect(() => readChartKit(undefined)).toThrow("CRM.chart_kit");
    const { columnOptions, ...rest } = rawKit();
    expect(() =>
      readChartKit({ ...rest, columnOptions: { ...columnOptions, seriesType: 1 } }),
    ).toThrow("seriesType options");
    const broken = rawKit();
    Reflect.deleteProperty(broken.typeBackends.pie, "getAxes");
    expect(() => readChartKit(broken)).toThrow('complete type backend "pie"');
  });

  it("types the search's columns, with option labels as their own type", () => {
    expect(columns.map((c) => [c.key, c.dataType])).toEqual([
      ["id", "Integer"],
      ["display_name", "String"],
      ["gender_id:label", "Option"],
      ["birth_date", "Date"],
      ["COUNT_id", "Integer"],
    ]);
  });

  it("merges the axis defaults and allows one column unless the axis takes many", () => {
    const { axes } = contextFor("series");
    expect(axes.x).toMatchObject({ label: "X", maxColumns: 1, prepopulate: true });
    expect(axes.y).toMatchObject({ maxColumns: -1, reduceTypes: ["sum", "count", "list"] });
    expect(axes.z?.prepopulate).toBe(false);
  });

  it("numbers the columns per axis and skips those beyond a single-column axis", () => {
    const settings: ChartSettings = {
      columns: [
        { axis: "x", key: "id" },
        { axis: "x", key: "display_name" },
        { axis: "y", key: "id" },
        { axis: "y", key: "COUNT_id" },
        { axis: "gone", key: "id" },
      ],
    };
    const shown = chartColumns(settings, contextFor("series").axes);
    expect(shown.map((c) => [c.index, c.name])).toEqual([
      [0, "x_0"],
      [2, "y_0"],
      [3, "y_1"],
    ]);
  });

  it("offers only the source types an axis accepts", () => {
    const ctx = contextFor("pie");
    expect(searchColumnOptions(ctx, { axis: "y" }).map((c) => c.key)).toEqual(["id", "COUNT_id"]);
    expect(searchColumnOptions(ctx, { axis: "w" })).toHaveLength(columns.length);
  });

  it("narrows each setting's options by the column's type, as core does", () => {
    const ctx = contextFor("series");
    expect(configOptions(ctx, { axis: "x", key: "birth_date" }, "scaleType")).toEqual([
      "date",
      "categorical",
    ]);
    expect(configOptions(ctx, { axis: "x", key: "birth_date" }, "datePrecision")).toEqual([
      "year",
      "month",
    ]);
    expect(configOptions(ctx, { axis: "y", key: "id" }, "scaleType")).toEqual([
      "integer",
      "numeric",
      "categorical",
    ]);
    expect(configOptions(ctx, { axis: "y", key: "display_name" }, "scaleType")).toEqual([
      "categorical",
    ]);
    expect(configOptions(ctx, { axis: "y", key: "gender_id:label" }, "scaleType")).toEqual([
      "categorical",
    ]);
    expect(configOptions(ctx, { axis: "x", key: "id" }, "reduceType")).toEqual(["list"]);
    expect(
      configOptions(ctx, { axis: "y", key: "id", scaleType: "categorical" }, "reduceType"),
    ).toEqual(["count", "list"]);
    expect(
      configOptions(ctx, { axis: "y", key: "id", scaleType: "integer" }, "dataLabelFormatter"),
    ).toEqual(["none"]);
    expect(configOptions(ctx, { axis: "y", key: "id" }, "seriesType")).toEqual([]);
  });

  it("takes the label, type and first option of each setting when a field is picked", () => {
    const col = { axis: "x" };
    pickSearchColumn(contextFor("series"), col, "birth_date");
    expect(col).toEqual({
      axis: "x",
      key: "birth_date",
      label: "Birth Date",
      sourceDataType: "Date",
      scaleType: "date",
      datePrecision: "year",
      reduceType: "list",
      seriesType: null,
      dataLabelType: "none",
      dataLabelFormatter: "none",
    });
  });

  it("adds a column with the first field the chart does not use yet", () => {
    const settings: ChartSettings = { columns: [{ axis: "y", key: "id" }] };
    addColumn(contextFor("series"), settings, "y");
    expect(settings.columns?.[1]?.key).toBe("display_name");
  });

  it("starts a new display without a chart type", () => {
    expect(initChart(kit, columns, undefined)).toEqual({ chartType: null });
  });

  it("puts the type's defaults under the stored settings and fills the prepopulated axes", () => {
    const settings = initChart(kit, columns, {
      chartType: "line",
      format: { width: 500 },
      columns: [{ axis: "y", key: "COUNT_id" }],
    });
    expect(settings.format).toMatchObject({ width: 500, height: 300, backgroundColor: "#f2f2ed" });
    expect(settings.columns?.map((c) => [c.axis, c.key, c.name])).toEqual([
      ["y", "COUNT_id", "y_0"],
      ["x", "id", "x_0"],
    ]);
  });

  it("migrates legacy settings through chart_kit's adaptor", () => {
    expect(initChart(kit, columns, { chartType: "old" }).chartType).toBe("line");
  });

  it("keeps settings the user chose when the chart type changes", () => {
    const pie = applyChartType(kit, columns, { chartType: "pie", showLegend: "right" });
    expect(pie).toMatchObject({ showLegend: "right", maxSegments: 6 });
    expect(pie.columns?.map((c) => [c.axis, c.key])).toEqual([
      ["w", "id"],
      ["y", "COUNT_id"],
    ]);
  });

  it("marks exactly one column as the order column", () => {
    const settings: ChartSettings = {
      columns: [{ axis: "x", isOrder: true }, { axis: "y" }],
    };
    setOrderColumn(settings, 1);
    expect(settings.columns?.map((c) => c.isOrder)).toEqual([false, true]);
  });
});
