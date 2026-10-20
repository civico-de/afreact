/** Core's civi-rich-text-input, holding its value as the site's editor would. */
export class FakeRichText extends HTMLElement {
  value = "";
  input = document.createElement("textarea");
  openEditor() {
    this.setAttribute("editing", "");
  }
  closeEditor() {
    this.removeAttribute("editing");
  }
  saveAndCloseEditor() {
    this.closeEditor();
  }
  getTokens() {
    return { results: [] };
  }
}
if (!customElements.get("civi-rich-text-input"))
  customElements.define("civi-rich-text-input", FakeRichText);
