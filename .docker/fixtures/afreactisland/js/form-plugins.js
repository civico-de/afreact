// FormBuilder plugin elements: each edits one attribute of what it gets and sends the result.
const send = (element, key, value) => {
  element.dispatchEvent(new CustomEvent("change", { detail: { [key]: value } }));
};

const withAttribute = (node, name, value) => {
  const { [name]: _old, ...rest } = node;
  return value ? { ...rest, [name]: value } : rest;
};

// The note element's settings: its text.
class IslandNoteAdmin extends HTMLElement {
  connectedCallback() {
    const label = document.createElement("label");
    label.textContent = "Note text ";
    this.input = document.createElement("input");
    this.input.className = "form-control";
    this.input.addEventListener("change", () => {
      send(this, "node", withAttribute(this.node, "text", this.input.value));
    });
    label.append(this.input);
    this.append(label);
    this.show();
  }
  set node(node) {
    this.current = node;
    this.show();
  }
  get node() {
    return this.current;
  }
  show() {
    if (this.input && this.current && document.activeElement !== this.input)
      this.input.value = this.current.text ?? "";
  }
}

// The stars input on the canvas: the field's label and a switch for a wide class.
class IslandStarsAdmin extends HTMLElement {
  connectedCallback() {
    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.className = "btn btn-default btn-xs";
    this.button.textContent = "Wide stars";
    this.button.addEventListener("click", () => {
      const wide = this.node.class === "island-wide";
      send(this, "node", withAttribute(this.node, "class", wide ? "" : "island-wide"));
    });
    this.text = document.createElement("span");
    this.append(this.text, " ", this.button);
    this.show();
  }
  set node(node) {
    this.current = node;
    this.show();
  }
  get node() {
    return this.current;
  }
  set defn(defn) {
    this.definition = defn;
    this.show();
  }
  get defn() {
    return this.definition;
  }
  show() {
    if (this.text) this.text.textContent = `★★★ ${this.definition?.label ?? ""}`;
    if (this.button)
      this.button.setAttribute("aria-pressed", String(this.node?.class === "island-wide"));
  }
}

// The greeting behavior: a select of its modes.
class IslandGreetingAdmin extends HTMLElement {
  connectedCallback() {
    const label = document.createElement("label");
    label.textContent = "Greeting ";
    this.select = document.createElement("select");
    this.select.className = "form-control";
    this.select.addEventListener("change", () => {
      send(this, "entity", withAttribute(this.entity, "island-greeting", this.select.value));
    });
    label.append(this.select);
    this.append(label);
    this.show();
  }
  set entity(entity) {
    this.current = entity;
    this.show();
  }
  get entity() {
    return this.current;
  }
  set modes(modes) {
    this.choices = modes;
    this.show();
  }
  get modes() {
    return this.choices;
  }
  show() {
    if (!this.select || !this.choices) return;
    this.select.replaceChildren(
      new Option("None", ""),
      ...this.choices.map((mode) => new Option(mode.label, mode.name)),
    );
    this.select.value = this.current?.["island-greeting"] ?? "";
  }
}

// The household's options: one checkbox.
class IslandHouseholdAdmin extends HTMLElement {
  connectedCallback() {
    const label = document.createElement("label");
    this.box = document.createElement("input");
    this.box.type = "checkbox";
    this.box.addEventListener("change", () => {
      send(
        this,
        "entity",
        withAttribute(this.entity, "island-household", this.box.checked ? "1" : ""),
      );
    });
    label.append(this.box, " Island household");
    this.append(label);
    this.show();
  }
  set entity(entity) {
    this.current = entity;
    this.show();
  }
  get entity() {
    return this.current;
  }
  show() {
    if (this.box) this.box.checked = this.current?.["island-household"] === "1";
  }
}

// A FormBuilder panel: silent until the form's title asks it to block saving, to note something,
// or to check it in the background ("[slow]" settles late, "[fail]" rejects).
class IslandFormPanel extends HTMLElement {
  set record(form) {
    this.form = form;
    this.textContent = this.validationMessage;
    const title = form?.title ?? "";
    // Each record restarts the check; only the last one's result counts.
    const run = (this.runs = (this.runs ?? 0) + 1);
    this.checked = !title.includes("[slow]");
    this.check = title.includes("[fail]")
      ? Promise.reject(new Error("The island form panel could not check this title."))
      : new Promise((resolve) => {
          setTimeout(
            () => {
              if (run === this.runs) this.checked = true;
              resolve();
            },
            title.includes("[slow]") ? 500 : 0,
          );
        });
    // Unhandled until a save asks.
    this.check.catch(() => {});
  }
  get record() {
    return this.form;
  }
  get ready() {
    return this.check;
  }
  get saveNotes() {
    if (!this.checked) return ["The island form panel has not checked this title."];
    if (this.form?.title?.includes("[slow]")) return ["The island form panel checked this title."];
    return this.form?.title?.includes("[note]") ? ["The island form panel notes this title."] : [];
  }
  get validationMessage() {
    return this.form?.title?.includes("[block]") ? "The island form panel blocks this title." : "";
  }
}

customElements.define("afreact-island-form-panel", IslandFormPanel);
customElements.define("afreact-afform-admin-afreact-island-note", IslandNoteAdmin);
customElements.define("afreact-afform-admin-input-island-stars", IslandStarsAdmin);
customElements.define("afreact-afform-admin-behavior-island-greeting", IslandGreetingAdmin);
customElements.define("afreact-afform-admin-entity-household", IslandHouseholdAdmin);
