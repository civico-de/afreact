// A builder panel: silent until the search's label asks it to block saving.
class AfreactIslandPanel extends HTMLElement {
  set record(search) {
    this.search = search;
    this.textContent = this.validationMessage;
  }
  get record() {
    return this.search;
  }
  get validationMessage() {
    return this.search?.label.includes("[block]") ? "The island panel blocks this label." : "";
  }
}
customElements.define("afreact-island-panel", AfreactIslandPanel);
