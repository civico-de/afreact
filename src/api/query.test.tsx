import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { createQueryClient, dropUnobserved } from "./query";

function Answer({ id }: { id: string }) {
  const answer = useQuery({ queryKey: ["answer", id], queryFn: () => `${id}!` });
  return <p>{answer.data}</p>;
}

describe("dropUnobserved", () => {
  it("drops what an unmounted root observed and keeps what a mounted one does", async () => {
    const client = createQueryClient();
    const mount = (id: string) => {
      const root = createRoot(document.createElement("div"));
      act(() => {
        root.render(
          <QueryClientProvider client={client}>
            <Answer id={id} />
          </QueryClientProvider>,
        );
      });
      return root;
    };
    const left = mount("left");
    mount("kept");
    await waitFor(() => {
      expect(client.getQueryData(["answer", "left"])).toBe("left!");
      expect(client.getQueryData(["answer", "kept"])).toBe("kept!");
    });

    // As disconnectedCallback, outside act(): unmount, then drop at once.
    left.unmount();
    dropUnobserved(client);
    expect(client.getQueryData(["answer", "left"])).toBeUndefined();
    expect(client.getQueryData(["answer", "kept"])).toBe("kept!");
  });

  it("keeps a running request that no element observes yet", () => {
    const client = createQueryClient();
    let resolve = (_value: string) => {};
    void client.fetchQuery({
      queryKey: ["file"],
      queryFn: () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    });
    dropUnobserved(client);
    expect(client.getQueryCache().find({ queryKey: ["file"] })).toBeDefined();
    resolve("done");
  });
});
