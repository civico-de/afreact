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
  /** The field by item path and name, which outlasts its remount after an undone removal. */
  owner: string;
  /** Read when the upload starts: removing an earlier repeat item moves the field's record. */
  target: () => UploadTarget;
  /** Shows the stored file in the field. */
  onUploaded: (file: FileInfo) => void;
  /** Whether the submit must upload the file again after a draft took it. */
  again: () => boolean;
}

/** The files chosen in a form's File fields, by field instance; uploaded after Afform.submit. */
export type Uploads = Map<string, PendingUpload>;

export interface UploadsState {
  pending: Uploads;
  /** Files of an undone repeat-item removal, by owner, until their fields take them back. */
  restored: Map<string, File>;
  /** The fields whose upload failed after the records were saved; only these stay editable. */
  retry: ReadonlySet<string> | null;
  /** A file was chosen or removed, a change no draft holds yet. */
  changed: () => void;
}

export const UploadsContext = createContext<UploadsState | null>(null);

export function isFileInfo(value: unknown): value is FileInfo {
  return typeof value === "object" && value !== null && "id" in value;
}

/**
 * afForm's file uploader: a multipart POST of `params` and `file` (angular-file-upload).
 * Without a token the file goes into the user's draft (SubmitFile::updateDraft).
 */
async function uploadFile(formName: string, token: string | null, upload: PendingUpload) {
  const body = new FormData();
  const params = { ...(token !== null && { token }), name: formName, ...upload.target() };
  body.append("params", JSON.stringify(params));
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
  const stored: unknown = Array.isArray(values) ? values[0] : undefined;
  // The contact image is written as image_URL and returns no file.
  return isFileInfo(stored) && stored.id ? stored : null;
}

/**
 * Uploads the chosen files one after another, as afForm's uploader does after submit or
 * submitDraft, and returns a message for each that failed; `onStart` names the current file.
 */
export async function uploadAll(
  formName: string,
  token: string | null,
  uploads: Uploads,
  onStart: (fileName: string | null) => void,
): Promise<string[]> {
  if (!uploads.size) return [];
  const failed: string[] = [];
  for (const [key, upload] of [...uploads]) {
    onStart(upload.file.name);
    try {
      const stored = await uploadFile(formName, token, upload);
      // A file chosen or removed meanwhile stands; this one is outdated.
      if (uploads.get(key) !== upload) continue;
      if (token !== null || !upload.again()) uploads.delete(key);
      if (stored) upload.onUploaded(stored);
    } catch (error) {
      failed.push(
        ts("%1 could not be uploaded: %2", { 1: upload.file.name, 2: errorMessage(error) }),
      );
    }
  }
  onStart(null);
  return failed;
}
