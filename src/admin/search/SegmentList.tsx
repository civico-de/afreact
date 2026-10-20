import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api4, errorMessage } from "../../api/civi";
import { Pager } from "../../search/Pager";
import { ConfirmDialog } from "../widgets/ConfirmDialog";
import { searchAdminSettings, useRefreshSearchMetadata } from "./meta";
import { SegmentDialog } from "./SegmentDialog";
import { asHtml } from "../../html";

interface SegmentRow {
  id: number;
  label: string;
  description: string | null;
  entity_name: string;
  "entity_name:label": string | null;
  items: { label: string }[] | null;
}

interface SegmentListProps {
  /** The edit dialog: a segment id, a new segment's entity, or closed. */
  dialog: { id?: number; entity?: string } | null;
  onDialog: (dialog: { id?: number; entity?: string } | null) => void;
}

/** crmSearchAdminSegmentListing: the segments with their items, edit and delete. */
export function SegmentList({ dialog, onDialog }: SegmentListProps) {
  const client = useQueryClient();
  const refreshMetadata = useRefreshSearchMetadata();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(searchAdminSettings().defaultPagerSize);
  const [deleting, setDeleting] = useState<SegmentRow | null>(null);
  const params = {
    select: [
      "id",
      "label",
      "description",
      "entity_name",
      "entity_name:label",
      "items",
      "row_count",
    ],
    orderBy: { label: "ASC" },
    limit,
    offset: (page - 1) * limit,
  };
  const segments = useQuery({
    queryKey: ["SearchSegment", "listing", params],
    queryFn: () => api4<SegmentRow>("SearchSegment", "get", params),
    placeholderData: (previous) => previous,
  });
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["SearchSegment"] });
    await client.invalidateQueries({ queryKey: ["SavedSearch", "listCount", "segment"] });
    await refreshMetadata();
  };

  async function remove(row: SegmentRow) {
    setDeleting(null);
    const status = window.CRM.status({ start: ts("Deleting..."), success: ts("Segment Deleted") });
    try {
      await api4("SearchSegment", "delete", { where: [["id", "=", row.id]] });
      status.resolve();
    } catch (error) {
      status.reject();
      window.CRM.alert(asHtml(errorMessage(error)), ts("Error"), "error");
    }
    await refresh();
  }

  const rows = segments.data ?? [];
  return (
    <>
      <table className="table table-striped crm-search-admin-segment-listing">
        <thead>
          <tr>
            <th scope="col">{ts("Label")}</th>
            <th scope="col">{ts("Description")}</th>
            <th scope="col">{ts("For")}</th>
            <th scope="col">{ts("Items")}</th>
            <td />
          </tr>
        </thead>
        <tbody aria-busy={segments.isFetching}>
          {segments.error ? (
            <tr>
              <td colSpan={5} className="crm-error" role="alert">
                {errorMessage(segments.error)}
              </td>
            </tr>
          ) : !segments.data ? (
            <tr>
              <td colSpan={5} role="status">
                {ts("Loading…")}
              </td>
            </tr>
          ) : !rows.length ? (
            <tr>
              <td colSpan={5}>{ts("None found.")}</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td>{row.label}</td>
                <td>{row.description}</td>
                <td>{row["entity_name:label"] ?? <em>{ts("Missing")}</em>}</td>
                <td>{(row.items ?? []).map((item) => item.label).join(", ")}</td>
                <td className="text-right">
                  <div className="btn-group btn-group-xs">
                    <button
                      type="button"
                      className="btn btn-primary"
                      title={ts("Edit Search Segment")}
                      onClick={() => {
                        onDialog({ id: row.id });
                      }}
                    >
                      <i className="crm-i fa-pencil" role="img" aria-hidden="true" /> {ts("Edit")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => {
                        setDeleting(row);
                      }}
                    >
                      <i className="crm-i fa-trash" role="img" aria-hidden="true" /> {ts("Delete")}
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <Pager
        settings={{ show_count: true, expose_limit: true }}
        rowCount={segments.data?.countMatched ?? 0}
        page={page}
        limit={limit}
        onPage={setPage}
        onLimit={(next) => {
          setLimit(next);
          setPage(1);
        }}
      />
      {deleting && (
        <ConfirmDialog
          title={ts("Delete %1", { 1: deleting.label })}
          confirmLabel={ts("Delete")}
          onConfirm={() => void remove(deleting)}
          onCancel={() => {
            setDeleting(null);
          }}
        >
          <p>{ts("Are you sure you want to delete %1?", { 1: deleting.label })}</p>
        </ConfirmDialog>
      )}
      {dialog && (
        <SegmentDialog
          id={dialog.id}
          entity={dialog.entity}
          onClose={(saved) => {
            onDialog(null);
            if (saved) void refresh();
          }}
        />
      )}
    </>
  );
}
