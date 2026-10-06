import { errorMessage } from "../api/civi";
import { dispositionFileName } from "./searchTasks";

/**
 * crmSearchTaskDownload's request: SearchDisplay.download answers with the file itself, so it
 * goes through fetch rather than CRM.api4; an error answers as JSON.
 */
export async function fetchDownload(
  params: Record<string, unknown>,
  fallbackName: string,
): Promise<{ blob: Blob; fileName: string }> {
  const response = await fetch(window.CRM.url("civicrm/ajax/api4/SearchDisplay/download"), {
    method: "POST",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ params: JSON.stringify(params) }),
  });
  if (!response.ok) {
    const result: unknown = await response.json().catch(() => undefined);
    throw new Error(errorMessage(result ?? response.statusText));
  }
  return {
    blob: await response.blob(),
    fileName: dispositionFileName(response.headers.get("Content-Disposition")) ?? fallbackName,
  };
}

/** Hands the file to the browser's download, as crmSearchTaskDownload does with a link. */
export function saveBlob(blob: Blob, fileName: string) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
