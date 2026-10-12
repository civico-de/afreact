import { AfreactForm } from "./afform/AfreactForm";
import { placementOptions } from "./afform/model";
import { popupLocation } from "./afform/popup";
import { layoutSource } from "./afform/source";
import { AfreactSearch } from "./search/AfreactSearch";
import { AfreactSupport } from "./support/AfreactSupport";
import { listedForms } from "./support/listed";
import { ReactElement } from "./element";
import "./afreact.css";

/**
 * <afreact-form name="afformName" source="api|page|bundle" options='{"contact_id": 5}'> renders a
 * FormBuilder form; `options` carries a placement's arguments as core's InlineAfform.tpl does,
 * and `page-title` marks the form a page is made of, as core's AfformBase.tpl.
 */
class AfreactFormElement extends ReactElement {
  protected view() {
    return (
      <AfreactForm
        name={this.required("name")}
        source={layoutSource(this.getAttribute("source"))}
        location={popupLocation(this) ?? window.location}
        options={placementOptions(this.getAttribute("options"))}
        pageTitle={this.hasAttribute("page-title")}
      />
    );
  }
}

/** <afreact-search search="SavedSearch" display="SearchDisplay"> renders a SearchKit display. */
class AfreactSearchElement extends ReactElement {
  protected view() {
    return <AfreactSearch search={this.required("search")} display={this.required("display")} />;
  }
}

/** <afreact-support listed='["afformName", …]' settings="url"> reports what React cannot show per form. */
class AfreactSupportElement extends ReactElement {
  protected view() {
    return (
      <AfreactSupport
        listed={listedForms(this.required("listed"))}
        settings={this.required("settings")}
      />
    );
  }
}

customElements.define("afreact-form", AfreactFormElement);
customElements.define("afreact-search", AfreactSearchElement);
customElements.define("afreact-support", AfreactSupportElement);
