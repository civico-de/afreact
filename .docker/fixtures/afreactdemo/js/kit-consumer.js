// Another extension's module as its build would emit it: React, its JSX and compiler runtimes,
// TanStack Query and afreact's components all come through the `afreact/` import map prefix.
import { useState } from "afreact/react.js";
import { createRoot } from "afreact/react-dom-client.js";
import { jsx, jsxs, Fragment } from "afreact/jsx-runtime.js";
import { c } from "afreact/compiler-runtime.js";
import { QueryClientProvider, useQuery } from "afreact/react-query.js";
import {
  api4,
  CountBadge,
  Dialog,
  errorMessage,
  FieldCondition,
  FieldPicker,
  Notice,
  queryClient,
} from "afreact/kit.js";

const complete = (clause) => {
  const [, op, value] = clause;
  if (typeof op !== "string") return false;
  if (op.startsWith("IS ")) return true;
  return (
    value !== "" &&
    value !== null &&
    value !== undefined &&
    !(Array.isArray(value) && !value.length)
  );
};

// What the React Compiler makes of a component with a constant heading.
function Heading() {
  const $ = c(1);
  if ($[0] === Symbol.for("react.memo_cache_sentinel"))
    $[0] = jsx("h2", { id: "afreact-kit-consumer-title", children: "Segment" });
  return $[0];
}

function Segment() {
  const [field, setField] = useState(null);
  const [clause, setClause] = useState([]);
  const [explaining, setExplaining] = useState(false);
  const where = complete(clause) ? [clause] : [];
  const count = useQuery({
    queryKey: ["afreactdemo", "segment", where],
    queryFn: async () =>
      (await api4("Contact", "get", { select: ["row_count"], where })).count ?? 0,
  });
  return jsxs(Fragment, {
    children: [
      jsx(Heading, {}),
      jsx(Notice, { children: "Pick a field and a condition to count the matching contacts." }),
      jsxs("div", {
        className: "afreact-kit-demo-condition",
        children: [
          jsx(FieldPicker, {
            id: "afreact-kit-field",
            entity: "Contact",
            label: "Field",
            value: field?.name ?? null,
            onChange: (next) => {
              setField(next);
              setClause(next ? [next.name] : []);
            },
          }),
          field && jsx(FieldCondition, { field, clause, onChange: setClause }),
        ],
      }),
      // The count changes as the condition does; the status region announces it.
      jsxs("p", {
        role: "status",
        children: [
          "Matching contacts: ",
          jsx(CountBadge, { count: count.data ?? null, label: "contacts" }),
        ],
      }),
      count.isError && jsx(Notice, { type: "error", children: errorMessage(count.error) }),
      jsx("button", {
        type: "button",
        className: "btn btn-secondary",
        onClick: () => {
          setExplaining(true);
        },
        children: "Explain",
      }),
      explaining &&
        jsx(Dialog, {
          title: "Explanation",
          buttons: null,
          onClose: () => {
            setExplaining(false);
          },
          children: jsx("p", { children: where.length ? JSON.stringify(where) : "All contacts." }),
        }),
    ],
  });
}

// An element mounts wherever its markup lands, also in a snippet loaded into the page later,
// whose own module scripts core's jQuery does not run.
class SegmentElement extends HTMLElement {
  connectedCallback() {
    this.root = createRoot(this);
    this.root.render(jsx(QueryClientProvider, { client: queryClient, children: jsx(Segment, {}) }));
  }

  disconnectedCallback() {
    this.root?.unmount();
  }
}

customElements.define("afreactdemo-segment", SegmentElement);
