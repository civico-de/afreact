import { createContext } from "react";
import { errorMessage } from "../../api/civi";

/** A stored file as prefill and Afform.submitFile return it (AbstractProcessor::getFileInfo). */
export interface FileInfo {
  id: number | null;
  file_name?: string | null;
  icon?: string;
  /** Only for users who may see uploaded files. */
  url?: string;
}

/** afField's getFileUploadParams(): where the server stores the file. */
export interface UploadTarget {
  modelName: string;
  fieldName: string;
  joinEntity: string | null;
  entityIndex: number;
  joinIndex: number | null;
}

export interface PendingUpload {
  file: File;
  target: UploadTarget;
  /** Shows the stored file in the field. */
  onUploaded: (file: FileInfo) => void;
}

/** The files chosen in a form's File fields, by field instance; uploaded after Afform.submit. */
export type Uploads = Map<string, PendingUpload>;

export const UploadsContext = createContext<Uploads | null>(null);

export function isFileInfo(value: unknown): value is FileInfo {
  return typeof value === "object" && value !== null && "id" in value;
}

/** afForm's file uploader: a multipart POST of `params` and `file` (angular-file-upload). */
async function uploadFile(formName: string, token: string, upload: PendingUpload) {
  const body = new FormData();
  body.append("params", JSON.stringify({ token, name: formName, ...upload.target }));
  body.append("file", upload.file, upload.file.name);
  const headers: Record<string, string> = { "X-Requested-With": "XMLHttpRequest" };
  // A form opened from a page token authenticates its requests with it (PageTokenCredential).
  const pageToken = new URLSearchParams(window.location.search).get("_aff");
  if (pageToken) headers["X-Civi-Auth-Afform"] = pageToken;
  const response = await fetch(window.CRM.url("civicrm/ajax/api4/Afform/submitFile"), {
    method: "POST",
    headers,
    body,
  });
  const result: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(errorMessage(result));
  const values =
    typeof result === "object" && result !== null && "values" in result ? result.values : null;
  const [stored] = Array.isArray(values) ? values : [];
  // The contact image is written as image_URL and returns no file.
  if (isFileInfo(stored) && stored.id) upload.onUploaded(stored);
}

/**
 * Uploads the chosen files one after another, as afForm's uploader does after submit, and
 * returns a message for each that failed; `onStart` names the file being uploaded.
 */
export async function uploadAll(
  formName: string,
  token: unknown,
  uploads: Uploads,
  onStart: (fileName: string | null) => void,
): Promise<string[]> {
  if (!uploads.size) return [];
  if (typeof token !== "string") throw new Error("Afform.submit returned no token for the files.");
  const failed: string[] = [];
  for (const [key, upload] of [...uploads]) {
    onStart(upload.file.name);
    try {
      await uploadFile(formName, token, upload);
      uploads.delete(key);
    } catch (error) {
      failed.push(
        ts("%1 could not be uploaded: %2", { 1: upload.file.name, 2: errorMessage(error) }),
      );
    }
  }
  onStart(null);
  return failed;
}
