import { QueryClient } from "@tanstack/react-query";

/**
 * One cache for every Facade element on a page. Like the Angular runtime it
 * never retries or refetches on its own; answers stay valid until invalidated.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
}

export const queryClient = createQueryClient();
