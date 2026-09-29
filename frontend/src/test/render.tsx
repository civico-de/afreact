import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { createQueryClient } from "../api/query";

/** Renders with a fresh query cache, as each page load gets. */
export function renderWithQuery(ui: ReactNode) {
  return render(<QueryClientProvider client={createQueryClient()}>{ui}</QueryClientProvider>);
}

type Handler = (params: Record<string, unknown>) => unknown;

/** Routes CRM.api4 calls to handlers keyed "Entity.action"; unknown calls reject loudly. */
export function mockApi(handlers: Record<string, Handler>) {
  const calls: { call: string; params: Record<string, unknown> }[] = [];
  vi.mocked(window.CRM.api4).mockImplementation(async (entity, action, params = {}) => {
    const call = `${entity}.${action}`;
    calls.push({ call, params: params as Record<string, unknown> });
    const handler = handlers[call];
    if (!handler) throw new Error(`Unexpected API call ${call}`);
    return handler(params as Record<string, unknown>);
  });
  return calls;
}
