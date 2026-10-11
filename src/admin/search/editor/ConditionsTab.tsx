import { getAllFields, getEntity, getSelectFields, type ApiParams, type SearchInfo } from "../expr";
import type { SearchAdminMetadata } from "../meta";
import { ClauseEditor } from "./ClauseEditor";

interface ConditionsTabProps {
  meta: SearchAdminMetadata;
  search: SearchInfo;
  onChange: (params: ApiParams) => void;
}

/** crmSearchAdminConditions: where on fields, and having on the columns when the entity groups. */
export function ConditionsTab({ meta, search, onChange }: ConditionsTabProps) {
  const params = getEntity(meta, search.api_entity)?.params ?? [];
  return (
    <>
      <div className="crm-search-wheres">
        <ClauseEditor
          meta={meta}
          search={search}
          clauses={search.api_params.where ?? []}
          op="AND"
          label={ts("Where")}
          allowFunctions={params.includes("groupBy")}
          fields={getAllFields(meta, search, ":name")}
          onChange={(where) => {
            onChange({
              ...search.api_params,
              where: where.filter((c): c is unknown[] => Array.isArray(c)),
            });
          }}
        />
      </div>
      {params.includes("having") && (
        <div className="crm-search-havings">
          <ClauseEditor
            meta={meta}
            search={search}
            clauses={search.api_params.having ?? []}
            op="AND"
            label={ts("Having")}
            aliases={search.api_params.select}
            fields={getSelectFields(meta, search)}
            onChange={(having) => {
              onChange({
                ...search.api_params,
                having: having.filter((c): c is unknown[] => Array.isArray(c)),
              });
            }}
          />
        </div>
      )}
    </>
  );
}
