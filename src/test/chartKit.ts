import type { ChartSettings } from "../admin/search/display/chartKit";

const options = (...keys: string[]) => keys.map((key) => ({ key, label: key.toUpperCase() }));

/** chart_kit's global as its bundle leaves it, cut down to a pie and a series chart. */
export const rawKit = () => ({
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
