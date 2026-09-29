import { api4, errorMessage, get } from "./civi";

describe("errorMessage", () => {
  it("reads API errors, exceptions and empty rejections", () => {
    expect(errorMessage({ error_code: 0, error_message: "Denied" })).toBe("Denied");
    expect(errorMessage(new Error("Broken"))).toBe("Broken");
    expect(errorMessage(undefined)).toBe("The server sent no readable answer.");
    expect(errorMessage("plain")).toBe("plain");
    expect(errorMessage({ status: 500 })).toBe('{"status":500}');
  });
});

describe("api4", () => {
  it("passes calls through CRM.api4", async () => {
    vi.mocked(window.CRM.api4).mockResolvedValue([{ id: 1 }]);
    await expect(get("Contact", { select: ["id"], limit: 1 })).resolves.toEqual([{ id: 1 }]);
    await api4("Afform", "prefill");
    expect(vi.mocked(window.CRM.api4).mock.calls).toEqual([
      ["Contact", "get", { select: ["id"], limit: 1 }],
      ["Afform", "prefill", {}],
    ]);
  });

  it("rejects an answer that is no list of rows", async () => {
    vi.mocked(window.CRM.api4).mockResolvedValue({ values: [] });
    await expect(api4("Afform", "prefill")).rejects.toThrow(
      "Afform.prefill answered without a list of rows.",
    );
  });
});
