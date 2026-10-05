import { QueryClient } from "@tanstack/react-query";

/**
 * One cache for every Afreact element on a page. Like the Angular runtime it
 * never retries or refetches on its own; answers stay valid until invalidated.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
}

export const queryClient = createQueryClient();

/**
 * Drops the settled answers no mounted element observes, so an element put back on the page
 * (a refreshed dashlet) loads afresh, as a recompiled Angular directive does.
 */
export function dropUnobserved(client: QueryClient): void {
  const cache = client.getQueryCache();
  for (const query of cache.getAll())
    if (query.getObserversCount() === 0 && query.state.fetchStatus === "idle") cache.remove(query);
}
