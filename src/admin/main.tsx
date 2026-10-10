import { ReactElement } from "../element";
import { Builder, type BuilderName, type Screens } from "./Builder";
import { CoreVersion } from "./version";

const SCREENS: Record<BuilderName, Screens> = { search_kit: {}, afform: {} };

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
