import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import type { ApiError } from "../api/civi";
import { createQueryClient } from "../api/query";

/** Renders with a fresh query cache, as each page load gets. */
export function renderWithQuery(ui: ReactNode) {
  return render(<QueryClientProvider client={createQueryClient()}>{ui}</QueryClientProvider>);
}

type Handler = (params: Record<string, unknown>) => unknown;

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
