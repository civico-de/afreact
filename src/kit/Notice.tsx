import type { ReactNode } from "react";

export type NoticeType = "info" | "status" | "success" | "warning" | "error";

/** CiviCRM's inline message box; an error is announced at once, the others politely. */
export function Notice({ type = "info", children }: { type?: NoticeType; children: ReactNode }) {
  return (
    <div className={`messages ${type} no-popup`} role={type === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
