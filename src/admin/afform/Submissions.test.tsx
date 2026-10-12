import { screen } from "@testing-library/react";
import { mockApi, recordParam, renderWithQuery } from "../../test/render";
import { Submissions } from "./Submissions";

const SETTINGS = {
  columns: [{ type: "field", key: "submission_date", label: "Submission Date/Time" }],
};

describe("Submissions", () => {
  it("asks core for the form's default display and runs it filtered to the form", async () => {
    const calls = mockApi({
      "Afform.get": () => [{ name: "afformX" }],
      "SearchDisplay.getDefault": () => [{ settings: SETTINGS }],
      "SearchDisplay.run": () => [{ key: 1, columns: [{ val: "2026-01-02" }] }],
    });
    renderWithQuery(<Submissions name="afformX" />);
    expect(await screen.findByText("2026-01-02")).toBeInTheDocument();
    const getDefault = calls.find((call) => call.call === "SearchDisplay.getDefault");
    expect(getDefault?.params).toMatchObject({
      savedSearch: "AfAdmin_Submission_List",
      type: "table",
      context: { filters: { afformName: "afformX" } },
    });
    const run = calls.find((call) => call.call === "SearchDisplay.run");
    expect(run?.params).toMatchObject({
      savedSearch: "AfAdmin_Submission_List",
      display: null,
    });
    expect(recordParam(run?.params.filters)).toEqual({ afformName: "afformX" });
  });

  it("names a missing form", () => {
    renderWithQuery(<Submissions name={null} />);
    expect(screen.getByRole("alert")).toHaveTextContent("The address names no form.");
  });

  // deviation:unknown-form-submissions
  it("reports a form that does not exist or is hidden instead of an empty table", async () => {
    const calls = mockApi({ "Afform.get": () => [] });
    renderWithQuery(<Submissions name="noSuchForm" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No form noSuchForm exists that you may see.",
    );
    expect(calls.map(({ call }) => call)).toEqual(["Afform.get"]);
  });

  it("fails on a default display without columns", async () => {
    mockApi({
      "Afform.get": () => [{ name: "afformX" }],
      "SearchDisplay.getDefault": () => [{ settings: {} }],
    });
    renderWithQuery(<Submissions name="afformX" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Search display AfAdmin_Submission_List has no columns.",
    );
  });
});
