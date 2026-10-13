import { useQuery } from "@tanstack/react-query";
import { useEffect, useId } from "react";
import { api4 } from "../../../api/civi";
import { Picker } from "../../widgets/Picker";
import { permissionOptions, SortConfig, type Editing } from "./common";
import { Columns } from "./Columns";
import {
  createSqlName,
  defaultJob,
  isEntityColumnAllowed,
  isFkColumn,
  pascalCase,
  setEntityPermission,
  type Draft,
  type EntityJob,
} from "./model";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const dataModes = () => [
  { id: "table", label: ts("MySQL Table") },
  { id: "view", label: ts("MySQL View") },
];

/** The table's last refresh and its scheduled job, as searchAdminDisplayEntity loads them. */
function useRefreshInfo(name: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["afreact-admin", "entityRefresh", name],
    enabled: enabled && !!name,
    queryFn: async () => {
      const entity = `SK_${String(name)}`;
      const [ref] = await api4<{ refresh_date?: string | null }>(entity, "getRefreshDate", {});
      const [job] = await api4<EntityJob>("Job", "get", {
        where: [
          ["api_entity", "=", entity],
          ["api_action", "=", "refresh"],
        ],
      });
      return {
        date: ref?.refresh_date
          ? window.CRM.utils.formatDate(ref.refresh_date, null, true)
          : ts("never"),
        job: job?.id ? job : defaultJob(),
      };
    },
  });
}

/** searchAdminDisplayEntity */
export function EntityEditor(props: Editing & { adopt: (change: (draft: Draft) => void) => void }) {
  const { ctx, draft, edit, adopt } = props;
  const id = useId();
  const s = draft.settings;
  const tableMode = (s.data_mode ?? "table") === "table";
  const refresh = useRefreshInfo(draft.name, !!draft.id);
  const loadedJob = refresh.data?.job;
  useEffect(() => {
    if (loadedJob && !draft._job)
      adopt((d) => {
        d._job = loadedJob;
      });
  }, [loadedJob, draft._job, adopt]);
  const permissions = permissionOptions(ctx.meta.permissions);
  const job = draft._job;
  return (
    <>
      <div className="form-inline">
        <label htmlFor={`${id}-label`}>
          {ts("Label")}{" "}
          <span className="crm-marker" aria-hidden="true">
            *
          </span>
        </label>{" "}
        <input
          id={`${id}-label`}
          type="text"
          className="form-control"
          required
          placeholder={ts("Untitled")}
          value={draft.label}
          onChange={(event) => {
            const label = event.target.value;
            edit((d) => {
              d.label = label;
            });
          }}
        />
      </div>
      <div>
        <label htmlFor={`${id}-description`} className="sr-only">
          {ts("Description")}
        </label>
        <textarea
          id={`${id}-description`}
          className="form-control"
          placeholder={ts("Description")}
          value={s.description ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            edit((d) => {
              d.settings.description = value;
            });
          }}
        />
      </div>
      <div className="form-inline">
        <Picker
          id={`${id}-mode`}
          label={ts("Data Mode")}
          placeholder={ts("MySQL Table")}
          single
          options={dataModes()}
          value={s.data_mode ? [s.data_mode] : []}
          onChange={(picked) => {
            const next = picked[0];
            edit((d) => {
              if (next === undefined) delete d.settings.data_mode;
              else d.settings.data_mode = String(next);
            });
          }}
        />
      </div>
      <div className="form-inline">
        <label htmlFor={`${id}-api`}>
          {ts("API Name")}{" "}
          <span className="crm-marker" aria-hidden="true">
            *
          </span>
        </label>{" "}
        <div className="input-group">
          <span className="input-group-addon">SK_</span>
          <input
            id={`${id}-api`}
            type="text"
            className="form-control"
            required
            value={draft.name ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              edit((d) => {
                d.name = pascalCase(value === "" ? d.label : value);
              });
            }}
          />
        </div>
      </div>
      {tableMode && !!draft.id && (
        <p role="status">
          <i className="crm-i fa-clock-o" role="img" aria-hidden="true" />{" "}
          <strong>
            {refresh.data
              ? ts('Last refreshed: %1. Click "Save" to refresh now.', { 1: refresh.data.date })
              : ts("Checking last refresh date...")}
          </strong>
        </p>
      )}
      {refresh.error && (
        <p className="crm-error" role="alert">
          {refresh.error.message}
        </p>
      )}
      {tableMode && job && (
        <div className="form-inline">
          <label className="checkbox-inline form-control">
            <input
              type="checkbox"
              checked={!!job.is_active}
              onChange={() => {
                edit((d) => {
                  if (d._job) d._job.is_active = !d._job.is_active;
                });
              }}
            />{" "}
            <span>{ts("Auto-Refresh")}</span>
          </label>
          {job.is_active && (
            <select
              className="form-control"
              aria-label={ts("Refresh frequency")}
              value={job.run_frequency ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                edit((d) => {
                  if (d._job) d._job.run_frequency = value;
                });
              }}
            >
              {ctx.meta.jobFrequency.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      <div className="form-inline">
        <Picker
          id={`${id}-permission`}
          label={ts("API Permission")}
          placeholder={ts("administer CiviCRM")}
          options={permissions}
          value={s.entity_permission ?? []}
          onChange={(pick) => {
            edit((d) => {
              setEntityPermission(d.settings, pick(d.settings.entity_permission ?? []).map(String));
            });
          }}
        />
        {(s.entity_permission?.length ?? 0) > 1 && (
          <select
            className="form-control"
            aria-label={ts("Permission operator")}
            title={ts("Permission operator")}
            value={s.entity_permission_operator ?? "AND"}
            onChange={(event) => {
              const value = event.target.value;
              edit((d) => {
                d.settings.entity_permission_operator = value;
              });
            }}
          >
            <option value="AND">{ts("And")}</option>
            <option value="OR">{ts("Or")}</option>
          </select>
        )}
      </div>
      <SortConfig {...props} />

      <fieldset className="crm-search-admin-edit-columns-wrapper">
        <legend>{ts("Columns")}</legend>
        <Columns
          {...props}
          links={[]}
          defaults={ctx.entityIndex ? { label: true, index: true } : { label: true }}
          withTypes={false}
          typeFields={false}
          isAllowed={(key) => isEntityColumnAllowed(ctx, key)}
          head={(col, index, editCol) => (
            <>
              <div className="form-inline crm-search-admin-flex-row">
                <label htmlFor={`${id}-col-${String(index)}-name`}>{ts("Name")}</label>
                <input
                  id={`${id}-col-${String(index)}-name`}
                  className="form-control crm-flex-1"
                  type="text"
                  placeholder={createSqlName(col.key ?? "")}
                  maxLength={58}
                  value={col.name ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    editCol((c) => {
                      c.name = value === "" ? value : createSqlName(value);
                    });
                  }}
                />
                <label htmlFor={`${id}-col-${String(index)}-label`}>{ts("Label")}</label>
                <input
                  id={`${id}-col-${String(index)}-label`}
                  className="form-control crm-flex-1"
                  type="text"
                  value={typeof col.label === "string" ? col.label : ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    editCol((c) => {
                      c.label = value;
                    });
                  }}
                />
              </div>
              {tableMode && ctx.entityIndex && (
                <div className="form-inline">
                  <label>
                    <input
                      type="checkbox"
                      checked={!!col.index}
                      disabled={isFkColumn(ctx, col)}
                      onChange={() => {
                        editCol((c) => {
                          c.index = !c.index;
                        });
                      }}
                    />{" "}
                    {ts("Search Index")}
                  </label>
                </div>
              )}
            </>
          )}
        />
      </fieldset>
    </>
  );
}

export const entityPreviewSettings = (settings: unknown) => ({
  ...(isRecord(settings) ? settings : {}),
  limit: 50,
  pager: { expose_limit: true },
  classes: ["table", "table-striped"],
});
