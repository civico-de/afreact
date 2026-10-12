import { ReactElement } from "../element";
import { FormEditor } from "./afform/FormEditor";
import { FormList } from "./afform/FormList";
import { Submissions } from "./afform/Submissions";
import { Builder, type BuilderName, type Screens } from "./Builder";
import { DisplayPage } from "./search/DisplayPage";
import { SearchEditor } from "./search/SearchEditor";
import { SearchList } from "./search/SearchList";
import { BuildersReport, parseFindings, parseFormFindings } from "./support/BuildersReport";
import { CoreVersion } from "./version";

const SCREENS: Record<BuilderName, Screens> = {
  search_kit: {
    "civicrm/admin/search": {
      list: { pattern: "/list", render: () => <SearchList /> },
      create: {
        pattern: "/create/:entity",
        render: (p) => <SearchEditor mode="create" entity={p.entity ?? ""} />,
      },
      edit: {
        pattern: "/edit/:id",
        render: (p) => <SearchEditor mode="edit" id={Number(p.id)} />,
      },
      clone: {
        pattern: "/clone/:id",
        render: (p) => <SearchEditor mode="clone" id={Number(p.id)} />,
      },
    },
    "civicrm/search": {
      display: {
        pattern: "/display/:search/:display",
        render: (p) => <DisplayPage search={p.search ?? ""} display={p.display ?? null} />,
      },
      defaultDisplay: {
        pattern: "/display/:search",
        render: (p) => <DisplayPage search={p.search ?? ""} display={null} />,
      },
    },
  },
  afform: {
    "civicrm/admin/afform": {
      list: { pattern: "/", render: () => <FormList /> },
      create: {
        pattern: "/create/:type/:entity",
        render: (p) => <FormEditor mode="create" type={p.type ?? ""} entity={p.entity ?? ""} />,
      },
      edit: {
        pattern: "/edit/:name",
        render: (p) => <FormEditor mode="edit" name={p.name ?? ""} />,
      },
      clone: {
        pattern: "/clone/:name",
        render: (p) => <FormEditor mode="clone" name={p.name ?? ""} />,
      },
    },
    "civicrm/admin/afform/submissions": {
      submissions: {
        pattern: "/",
        render: () => (
          <Submissions name={new URLSearchParams(window.location.search).get("name")} />
        ),
      },
    },
  },
};

function builderName(value: string): BuilderName {
  if (value === "search_kit" || value === "afform") return value;
  throw new Error(`Unknown builder "${value}"`);
}

/** <afreact-builder builder="search_kit|afform" route="core path" classic="url" core-version="6.19.0"> renders a React builder. */
class AfreactBuilderElement extends ReactElement {
  protected view() {
    return (
      <CoreVersion value={this.required("core-version")}>
        <Builder
          route={this.required("route")}
          classic={this.required("classic")}
          screens={SCREENS[builderName(this.required("builder"))]}
        />
      </CoreVersion>
    );
  }
}

customElements.define("afreact-builder", AfreactBuilderElement);

/** <afreact-builders-report report="{…}" afform="{…}"> lists what each builder hands to the classic one. */
class AfreactBuildersReportElement extends ReactElement {
  protected view() {
    return (
      <BuildersReport
        findings={parseFindings(this.required("report"))}
        form={parseFormFindings(this.required("afform"))}
      />
    );
  }
}

customElements.define("afreact-builders-report", AfreactBuildersReportElement);
