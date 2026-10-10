import { ReactElement } from "../element";
import { Builder, type BuilderName, type Screens } from "./Builder";

const SCREENS: Record<BuilderName, Screens> = { search_kit: {}, afform: {} };

function builderName(value: string): BuilderName {
  if (value === "search_kit" || value === "afform") return value;
  throw new Error(`Unknown builder "${value}"`);
}

/** <afreact-builder builder="search_kit|afform" route="core path" classic="url"> renders a React builder. */
class AfreactBuilderElement extends ReactElement {
  protected view() {
    return (
      <Builder
        route={this.required("route")}
        classic={this.required("classic")}
        screens={SCREENS[builderName(this.required("builder"))]}
      />
    );
  }
}

customElements.define("afreact-builder", AfreactBuilderElement);
