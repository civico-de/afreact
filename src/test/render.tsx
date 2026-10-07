import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import type { ApiError } from "../api/civi";
import { createQueryClient } from "../api/query";
import { memoryStore, type ParamStore } from "../url/hash";
import { UrlState } from "../url/UrlState";

/**
 * Renders with a fresh query cache, as each page load gets, and URL state in `store`;
 * `onlyElement` false stands for a page with other afreact elements.
 */
export function renderWithQuery(
  ui: ReactNode,
  store: ParamStore = memoryStore(""),
  onlyElement = true,
  container?: HTMLElement,
) {
  const client = createQueryClient();
  return render(ui, {
    container,
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <UrlState store={store} onlyElement={onlyElement}>
          {children}
        </UrlState>
      </QueryClientProvider>
    ),
  });
}

type Handler = (params: Record<string, unknown>) => unknown;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isList = (value: unknown): value is unknown[] => Array.isArray(value);

/** A handler's nested parameter as the record it must be. */
export function recordParam(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Expected an object, got ${JSON.stringify(value)}`);
  return value;
}

/** A handler's nested parameter as the list it must be. */
export function listParam(value: unknown): unknown[] {
  if (!isList(value)) throw new Error(`Expected a list, got ${JSON.stringify(value)}`);
  return value;
}

/** Routes CRM.api4 calls to handlers keyed "Entity.action"; unknown calls reject loudly. */
export function mockApi(handlers: Record<string, Handler>) {
  const calls: { call: string; params: Record<string, unknown> }[] = [];
  vi.mocked(window.CRM.api4).mockImplementation(
    (entity, action, raw = {}) =>
      // A throwing handler rejects, as a failing server call does.
      new Promise((resolve) => {
        const call = `${entity}.${action}`;
        const params: Record<string, unknown> = Object.fromEntries(Object.entries(raw));
        calls.push({ call, params });
        const handler = handlers[call];
        if (!handler) throw new Error(`Unexpected API call ${call}`);
        resolve(handler(params));
      }),
  );
  return calls;
}

/** CRM.api4's rejection payload, as an Error so it can be thrown. */
export function apiError(message: string): Error & ApiError {
  return Object.assign(new Error(message), { error_message: message });
}
