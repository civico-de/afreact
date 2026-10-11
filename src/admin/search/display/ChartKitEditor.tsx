import { useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useId, type ReactNode } from "react";
import { loadChartKit } from "../../../search/ElementDisplay";
import type { EditorDisplay } from "../editor";
import {
  addColumn,
  settleColumnOptions,
  applyChartType,
  axesOf,
  backendOf,
  chartColumns,
  initChart,
  optionDetails,
  pickSearchColumn,
  readChartKit,
  searchColumnOptions,
  searchColumns,
  setOrderColumn,
  type ChartAxis,
  type ChartColumn,
  type ChartContext,
  type ChartKit,
  type ChartSettings,
  type ColumnConfig,
} from "./chartKit";
import type { DisplayContext } from "./model";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Stored settings as chart settings, or null when a column is not a chart column with an axis. */
function chartSettings(stored: Record<string, unknown> | undefined): ChartSettings | null {
  const { columns, ...rest } = structuredClone(stored ?? {});
  const settings: ChartSettings = rest;
  if (columns === undefined) return settings;
  if (!Array.isArray(columns)) return null;
  const valid = columns.flatMap((col: unknown) =>
    isRecord(col) && typeof col.axis === "string" ? [{ ...col, axis: col.axis }] : [],
  );
  if (valid.length !== columns.length) return null;
  settings.columns = valid;
  return settings;
}

function useChartKit() {
  return useQuery({
    queryKey: ["afreact-admin", "chartKit"],
    staleTime: Infinity,
    queryFn: async () => {
      await loadChartKit();
      return readChartKit(Reflect.get(window.CRM, "chart_kit"));
    },
  });
}

type EditChart = (change: (settings: ChartSettings) => void) => void;

const num = (value: unknown) => (typeof value === "number" ? value : "");
const str = (value: unknown) => (typeof value === "string" ? value : "");

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (value: number | undefined) => void;
}) {
  const id = useId();
  return (
    <>
      <label htmlFor={id}>{label}</label>{" "}
      <input
        id={id}
        type="number"
        className="form-control"
        value={num(value)}
        onChange={(event) => {
          onChange(event.target.value === "" ? undefined : Number(event.target.value));
        }}
      />{" "}
    </>
  );
}

function TextInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: unknown;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="form-inline">
      <label htmlFor={id}>{label}</label>{" "}
      <input
        id={id}
        type="text"
        className="form-control"
        placeholder={placeholder}
        value={str(value)}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="form-inline">
      <label>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => {
            onChange(event.target.checked);
          }}
        />{" "}
        {label}
      </label>
    </div>
  );
}

/** A color, or the theme's default with a link to set one. */
function ColorInput({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: unknown;
  fallback: string;
  onChange: (value: string | null) => void;
}) {
  const id = useId();
  return (
    <div className="form-inline">
      <label htmlFor={id}>{label}</label>{" "}
      {value === null ? (
        <button
          id={id}
          type="button"
          className="btn btn-link"
          onClick={() => {
            onChange(fallback);
          }}
        >
          {ts("Set custom color")}
        </button>
      ) : (
        <>
          <input
            id={id}
            type="color"
            className="form-control"
            value={str(value) || fallback}
            onChange={(event) => {
              onChange(event.target.value);
            }}
          />
          <button
            type="button"
            className="btn btn-xs crm-hover-button"
            aria-label={ts("Use theme default for %1", { 1: label })}
            title={ts("Use theme default")}
            onClick={() => {
              onChange(null);
            }}
          >
            <i className="crm-i fa-times" role="img" aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}

function ConfigSelect({
  ctx,
  col,
  config,
  label,
  editCol,
}: {
  ctx: ChartContext;
  col: ChartColumn;
  config: ColumnConfig;
  label: string;
  editCol: (change: (col: ChartColumn) => void) => void;
}) {
  const id = useId();
  const options = optionDetails(ctx, col, config);
  if (options.length < 2) return null;
  return (
    <div className="form-inline">
      <label htmlFor={id}>{label}</label>{" "}
      <select
        id={id}
        className="form-control"
        value={str(col[config])}
        onChange={(event) => {
          const value = event.target.value;
          editCol((c) => {
            c[config] = value;
          });
        }}
      >
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** chartKitAdminColumns: each axis with its columns. */
function AxisColumns({
  ctx,
  settings,
  edit,
}: {
  ctx: ChartContext;
  settings: ChartSettings;
  edit: EditChart;
}) {
  const id = useId();
  const columns = chartColumns(structuredClone(settings), ctx.axes);
  const editAt = (index: number) => (change: (col: ChartColumn) => void) => {
    edit((s) => {
      const col = s.columns?.[index];
      if (col) change(col);
    });
  };
  return (
    <fieldset className="crm-search-admin-edit-columns-wrapper crm-chart-kit-admin-columns panel">
      <legend>{ts("Columns")}</legend>
      {Object.entries(ctx.axes).map(([axisKey, axis]: [string, ChartAxis]) => {
        const onAxis = columns.filter((col) => col.axis === axisKey);
        return (
          <fieldset key={axisKey}>
            <legend>{axis.label}</legend>
            {onAxis.map((col, position) => {
              const index = col.index;
              if (index === undefined) throw new Error("chartColumns numbers every column.");
              const editCol = editAt(index);
              const prefix = `${id}-${String(index)}`;
              return (
                <fieldset key={index}>
                  <legend className="sr-only">
                    {ts("%1 field %2", { 1: axis.label, 2: position + 1 })}
                  </legend>
                  <div className="form-inline crm-chart-kit-axis-column-selector">
                    <label htmlFor={`${prefix}-field`}>
                      {ts("Field")}{" "}
                      <span className="crm-marker" aria-hidden="true">
                        *
                      </span>
                    </label>{" "}
                    <select
                      id={`${prefix}-field`}
                      className="form-control huge"
                      required
                      value={col.key ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        editCol((c) => {
                          pickSearchColumn(ctx, c, value);
                        });
                      }}
                    >
                      {!searchColumnOptions(ctx, col).some((c) => c.key === col.key) && (
                        <option value="">{ts("- select -")}</option>
                      )}
                      {searchColumnOptions(ctx, col).map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <TextInput
                    label={ts("Label")}
                    value={col.label}
                    onChange={(value) => {
                      editCol((c) => {
                        c.label = value;
                      });
                    }}
                  />
                  {axis.colorType === "one-per-column" && (
                    <div className="form-inline crm-chart-kit-column-color">
                      <label htmlFor={`${prefix}-color`}>{ts("Color")}</label>{" "}
                      <input
                        id={`${prefix}-color`}
                        type="color"
                        className="form-control"
                        value={str(col.color) || "#000000"}
                        onChange={(event) => {
                          const value = event.target.value;
                          editCol((c) => {
                            c.color = value;
                          });
                        }}
                      />
                    </div>
                  )}
                  <details className="crm-accordion">
                    <summary>{ts("Data handling")}</summary>
                    <div className="crm-accordion-body">
                      <ConfigSelect
                        ctx={ctx}
                        col={col}
                        config="seriesType"
                        label={ts("Series type")}
                        editCol={editCol}
                      />
                      <ConfigSelect
                        ctx={ctx}
                        col={col}
                        config="dataLabelType"
                        label={ts("Value labels")}
                        editCol={editCol}
                      />
                      {!!col.dataLabelType && col.dataLabelType !== "none" && (
                        <Toggle
                          label={ts("Include column label")}
                          checked={!!col.dataLabelColumnPrefix}
                          onChange={(checked) => {
                            editCol((c) => {
                              c.dataLabelColumnPrefix = checked;
                            });
                          }}
                        />
                      )}
                      {col.sourceDataType && (
                        <div className="form-inline">
                          {ts("Source Data Type")}: <span>{col.sourceDataType}</span>
                        </div>
                      )}
                      <ConfigSelect
                        ctx={ctx}
                        col={col}
                        config="scaleType"
                        label={ts("Scale type")}
                        editCol={editCol}
                      />
                      <ConfigSelect
                        ctx={ctx}
                        col={col}
                        config="datePrecision"
                        label={ts("Date precision")}
                        editCol={editCol}
                      />
                      <ConfigSelect
                        ctx={ctx}
                        col={col}
                        config="reduceType"
                        label={ts("Stat Type")}
                        editCol={editCol}
                      />
                      <ConfigSelect
                        ctx={ctx}
                        col={col}
                        config="dataLabelFormatter"
                        label={ts("Label formatter")}
                        editCol={editCol}
                      />
                      {col.dataLabelFormatter === "round" && (
                        <div className="form-inline">
                          <NumberInput
                            label={ts("Decimal places")}
                            value={col.dataLabelDecimalPlaces}
                            onChange={(value) => {
                              editCol((c) => {
                                c.dataLabelDecimalPlaces = value;
                              });
                            }}
                          />
                        </div>
                      )}
                      {col.dataLabelFormatter === "formatMoney" && (
                        <TextInput
                          label={ts("Money format string")}
                          placeholder={ts("e.g. £1,234.56 or €1.234,56")}
                          value={col.dataLabelMoneyFormatString}
                          onChange={(value) => {
                            editCol((c) => {
                              c.dataLabelMoneyFormatString = value;
                            });
                          }}
                        />
                      )}
                      {axisKey === "y" && settings.chartType === "composite" && (
                        <Toggle
                          label={ts("Use right axis?")}
                          checked={!!col.useRightAxis}
                          onChange={(checked) => {
                            editCol((c) => {
                              c.useRightAxis = checked;
                            });
                          }}
                        />
                      )}
                    </div>
                  </details>
                  {(axis.multiColumn || !axis.prepopulate) && (
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary-outline"
                      aria-label={ts("Remove %1 field %2", { 1: axis.label, 2: position + 1 })}
                      onClick={() => {
                        edit((s) => {
                          s.columns = (s.columns ?? []).filter((_, i) => i !== index);
                        });
                      }}
                    >
                      <i className="crm-i fa-minus" role="img" aria-hidden="true" />{" "}
                      {ts("Remove field")}
                    </button>
                  )}
                </fieldset>
              );
            })}
            {(axis.multiColumn || !onAxis.length) && (
              <button
                type="button"
                className="btn btn-default"
                onClick={() => {
                  edit((s) => {
                    addColumn(ctx, s, axisKey);
                  });
                }}
              >
                <i className="crm-i fa-plus" role="img" aria-hidden="true" /> {ts("Add field")}
              </button>
            )}
          </fieldset>
        );
      })}
    </fieldset>
  );
}

/** chartKitAdminCanvas */
function Canvas({
  settings,
  grid,
  edit,
}: {
  settings: ChartSettings;
  grid: boolean;
  edit: EditChart;
}) {
  const format = settings.format ?? {};
  const padding = format.padding ?? {};
  const setFormat = (key: string, value: unknown) => {
    edit((s) => {
      s.format = { ...s.format, [key]: value };
    });
  };
  const setPadding = (key: string) => (value: number | undefined) => {
    edit((s) => {
      s.format = { ...s.format, padding: { ...s.format?.padding, [key]: value } };
    });
  };
  return (
    <fieldset className="crm-chart-kit-admin-format-canvas">
      <legend>{ts("Canvas")}</legend>
      <TextInput
        label={ts("Title")}
        value={format.title}
        onChange={(value) => {
          setFormat("title", value);
        }}
      />
      <ColorInput
        label={ts("Background color")}
        value={format.backgroundColor}
        fallback="#f2f2ed"
        onChange={(value) => {
          setFormat("backgroundColor", value);
        }}
      />
      <ColorInput
        label={ts("Text color")}
        value={format.labelColor}
        fallback="#000000"
        onChange={(value) => {
          setFormat("labelColor", value);
        }}
      />
      <div className="form-inline">
        <NumberInput
          label={ts("Width")}
          value={format.width}
          onChange={(value) => {
            setFormat("width", value);
          }}
        />
        <NumberInput
          label={ts("Height")}
          value={format.height}
          onChange={(value) => {
            setFormat("height", value);
          }}
        />
      </div>
      <details>
        <summary>{ts("Padding")}</summary>
        <div className="form-inline">
          <NumberInput label={ts("Inner")} value={padding.inner} onChange={setPadding("inner")} />
          <NumberInput label={ts("Outer")} value={padding.outer} onChange={setPadding("outer")} />
        </div>
        {grid && (
          <div className="form-inline">
            <NumberInput label={ts("Top")} value={padding.top} onChange={setPadding("top")} />
            <NumberInput
              label={ts("Bottom")}
              value={padding.bottom}
              onChange={setPadding("bottom")}
            />
            <NumberInput label={ts("Left")} value={padding.left} onChange={setPadding("left")} />
            <NumberInput label={ts("Right")} value={padding.right} onChange={setPadding("right")} />
            <NumberInput
              label={ts("Clipping")}
              value={padding.clip}
              onChange={setPadding("clip")}
            />
          </div>
        )}
      </details>
      {grid && (
        <details>
          <summary>{ts("Axes")}</summary>
          <TextInput
            label={ts("X-axis label")}
            value={format.xAxisLabel}
            onChange={(value) => {
              setFormat("xAxisLabel", value);
            }}
          />
          <Toggle
            label={ts("Show X gridlines?")}
            checked={!!format.xAxisGridlines}
            onChange={(checked) => {
              setFormat("xAxisGridlines", checked);
            }}
          />
          <TextInput
            label={ts("Y-axis label")}
            value={format.yAxisLabel}
            onChange={(value) => {
              setFormat("yAxisLabel", value);
            }}
          />
          <Toggle
            label={ts("Show Y gridlines?")}
            checked={!!format.yAxisGridlines}
            onChange={(checked) => {
              setFormat("yAxisGridlines", checked);
            }}
          />
          <TextInput
            label={ts("Right Y-axis label")}
            value={format.rightYAxisLabel}
            onChange={(value) => {
              setFormat("rightYAxisLabel", value);
            }}
          />
        </details>
      )}
      <Toggle
        label={ts("Show download links?")}
        checked={!!settings.showDownloadLinks}
        onChange={(checked) => {
          edit((s) => {
            s.showDownloadLinks = checked;
          });
        }}
      />
    </fieldset>
  );
}

function Legend({ settings, edit }: { settings: ChartSettings; edit: EditChart }) {
  const id = useId();
  return (
    <div className="form-inline">
      <label htmlFor={id}>{ts("Show legend?")}</label>{" "}
      <select
        id={id}
        className="form-control crm-search-display-chart-show-legend"
        value={str(settings.showLegend)}
        onChange={(event) => {
          const value = event.target.value;
          edit((s) => {
            s.showLegend = value;
          });
        }}
      >
        {!["none", "left", "right"].includes(str(settings.showLegend)) && (
          <option value="">{ts("- select -")}</option>
        )}
        <option value="none">{ts("None")}</option>
        <option value="left">{ts("Left")}</option>
        <option value="right">{ts("Right")}</option>
      </select>
    </div>
  );
}

/** The options of each chart type's admin template. */
function TypeOptions({
  ctx,
  settings,
  edit,
}: {
  ctx: ChartContext;
  settings: ChartSettings;
  edit: EditChart;
}) {
  const id = useId();
  const backend = backendOf(ctx.kit, settings);
  const type = ctx.kit.chartTypes.find((t) => t.key === settings.chartType)?.backend;
  const set = (key: string) => (value: unknown) => {
    edit((s) => {
      s[key] = value;
    });
  };
  const columns = chartColumns(structuredClone(settings), ctx.axes);
  const fieldset = (legend: string, children: ReactNode) => (
    <fieldset>
      <legend>{legend}</legend>
      {children}
    </fieldset>
  );
  let options: ReactNode = null;
  if (type === "composite") {
    const groupedBar = columns.filter((c) => c.axis === "y" && c.seriesType === "bar").length > 1;
    options = fieldset(
      ts("Series options"),
      <>
        {groupedBar && (
          <div className="form-inline">
            <NumberInput
              label={ts("Bar Width (px)")}
              value={settings.barWidth}
              onChange={set("barWidth")}
            />
            <NumberInput
              label={ts("Bar Gap (px)")}
              value={settings.barGap}
              onChange={set("barGap")}
            />
          </div>
        )}
        <Legend settings={settings} edit={edit} />
      </>,
    );
  } else if (type === "heatmap") {
    options = fieldset(
      ts("Heat map options"),
      <>
        <div className="form-inline">
          <label htmlFor={`${id}-min`}>{ts("Color Min")}</label>{" "}
          <input
            id={`${id}-min`}
            type="color"
            className="form-control"
            value={str(settings.colorScaleMin) || "#000000"}
            onChange={(event) => {
              set("colorScaleMin")(event.target.value);
            }}
          />
        </div>
        <div className="form-inline">
          <label htmlFor={`${id}-max`}>{ts("Color Max")}</label>{" "}
          <input
            id={`${id}-max`}
            type="color"
            className="form-control"
            value={str(settings.colorScaleMax) || "#000000"}
            onChange={(event) => {
              set("colorScaleMax")(event.target.value);
            }}
          />
        </div>
      </>,
    );
  } else if (type === "pie") {
    options = fieldset(
      ts("Pie chart options"),
      <>
        <Legend settings={settings} edit={edit} />
        <div className="form-inline">
          <NumberInput
            label={ts("Max segments to show")}
            value={settings.maxSegments}
            onChange={set("maxSegments")}
          />
        </div>
      </>,
    );
  } else if (type === "row") {
    const order = columns.find((c) => c.isOrder);
    options = fieldset(
      ts("Row options"),
      <>
        <div className="form-inline">
          <NumberInput
            label={ts("Maximum rows to show")}
            value={settings.maxSegments}
            onChange={set("maxSegments")}
          />
        </div>
        <div className="form-inline">
          <label htmlFor={`${id}-order`}>{ts("Order by")}</label>{" "}
          <select
            id={`${id}-order`}
            className="form-control"
            value={order ? String(order.index) : ""}
            onChange={(event) => {
              const value = event.target.value;
              if (value !== "")
                edit((s) => {
                  setOrderColumn(s, Number(value));
                });
            }}
          >
            <option value="">{ts("- select -")}</option>
            {columns.map((col) => (
              <option key={col.index} value={String(col.index)}>
                {col.label === undefined || col.label === "" ? col.key : col.label}
              </option>
            ))}
          </select>
        </div>
        <div className="form-inline">
          <label htmlFor={`${id}-dir`}>{ts("Order")}</label>{" "}
          <select
            id={`${id}-dir`}
            className="form-control"
            value={str(settings.chartOrderDir)}
            onChange={(event) => {
              set("chartOrderDir")(event.target.value);
            }}
          >
            {!["ASC", "DESC"].includes(str(settings.chartOrderDir)) && (
              <option value="">{ts("- select -")}</option>
            )}
            <option value="ASC">{ts("Ascending")}</option>
            <option value="DESC">{ts("Descending")}</option>
          </select>
        </div>
      </>,
    );
  } else if (type === "series") {
    options = fieldset(
      ts("Series options"),
      <>
        <Legend settings={settings} edit={edit} />
        <div className="form-inline">
          <label htmlFor={`${id}-show`}>{ts("Show as")}</label>{" "}
          <select
            id={`${id}-show`}
            className="form-control"
            value={str(settings.seriesDisplayType)}
            onChange={(event) => {
              set("seriesDisplayType")(event.target.value);
            }}
          >
            {!["line", "bar"].includes(str(settings.seriesDisplayType)) && (
              <option value="">{ts("- select -")}</option>
            )}
            <option value="line">{ts("Lines")}</option>
            <option value="bar">{ts("Bars")}</option>
          </select>
        </div>
      </>,
    );
  } else if (type === "stack") {
    options = fieldset(ts("Series options"), <Legend settings={settings} edit={edit} />);
  }
  return (
    <>
      <AxisColumns ctx={ctx} settings={settings} edit={edit} />
      <div className="crm-chart-kit-admin-presentation">
        <Canvas settings={settings} grid={!!backend?.hasCoordinateGrid()} edit={edit} />
        {options}
      </div>
    </>
  );
}

interface ChartKitEditorProps {
  ctx: DisplayContext;
  display: EditorDisplay;
  onSettings: (settings: ChartSettings) => void;
  onAdoptSettings: (settings: ChartSettings) => void;
}

function Editor({ kit, props }: { kit: ChartKit; props: ChartKitEditorProps }) {
  const { ctx, display, onSettings, onAdoptSettings } = props;
  const columns = searchColumns(ctx.meta, ctx.search);
  const stored = chartSettings(display.settings);
  const settings = stored ?? {};
  const backend = backendOf(kit, settings);
  const chart: ChartContext = { kit, axes: backend ? axesOf(kit, backend) : {}, columns };
  const settle = useEffectEvent(() => {
    if (!stored) return;
    const raw = display.settings === undefined ? undefined : structuredClone(display.settings);
    const settled = initChart(kit, columns, raw);
    if (JSON.stringify(settled) !== JSON.stringify(raw ?? {})) onAdoptSettings(settled);
  });
  // Once per display, as core's $onInit; later edits keep the settings normalized.
  useEffect(() => {
    settle();
  }, [kit, display.id, display.name]);
  if (!stored)
    return (
      <p className="crm-error" role="alert">
        {ts("A column of this chart has no axis, so the chart cannot be edited.")}
      </p>
    );
  const editChart: EditChart = (change) => {
    const next = structuredClone(stored);
    change(next);
    settleColumnOptions(chart, next);
    onSettings(next);
  };
  return (
    <div className="crm-chart-kit-admin">
      <fieldset className="crm-chart-kit-admin-chart-type">
        <legend className="sr-only">{ts("Chart type")}</legend>
        {kit.chartTypes.map((type) => (
          <label key={type.key}>
            <input
              type="radio"
              name={`chart-type-${String(display.id ?? display.name ?? "new")}`}
              checked={settings.chartType === type.key}
              onChange={() => {
                onSettings(
                  applyChartType(kit, columns, {
                    ...structuredClone(stored),
                    chartType: type.key,
                  }),
                );
              }}
            />{" "}
            <i className={`crm-i ${type.icon}`} role="img" aria-hidden="true" /> {type.label}
          </label>
        ))}
      </fieldset>
      {settings.chartType && backend && (
        <TypeOptions ctx={chart} settings={settings} edit={editChart} />
      )}
    </div>
  );
}

/** searchAdminDisplayChartKit, on chart_kit's own chart types and type backends. */
export function ChartKitEditor(props: ChartKitEditorProps) {
  const kit = useChartKit();
  if (kit.error)
    return (
      <p className="crm-error" role="alert">
        {kit.error.message}
      </p>
    );
  if (!kit.data) return <p role="status">{ts("Loading…")}</p>;
  return <Editor kit={kit.data} props={props} />;
}
