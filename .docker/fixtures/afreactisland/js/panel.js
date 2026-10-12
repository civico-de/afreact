// A builder panel: silent until the search's label asks it to block saving or to note something.
class AfreactIslandPanel extends HTMLElement {
  set record(search) {
    this.search = search;
    this.textContent = this.validationMessage;
  }
  get record() {
    return this.search;
  }
  get saveNotes() {
    return this.search?.label.includes("[note]") ? ["The island panel notes this label."] : [];
  }
  get validationMessage() {
    return this.search?.label.includes("[block]") ? "The island panel blocks this label." : "";
  }
}
customElements.define("afreact-island-panel", AfreactIslandPanel);
