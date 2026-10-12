# The Afform markup

An Afform layout is HTML with Angular directives. Core gives it no name and no
specification; its vocabulary lives in the PHP that converts it, the Angular
directives that run it and the GUI editor that writes it. This page describes
it as a language of its own, says what the React renderer reads of it, and
lists what core could change so that a second renderer does not have to
reverse-engineer it.

## Files

A form is two files with the same name: the layout (`name.aff.html`) and its
metadata (`name.aff.php`, older `name.aff.json`): title, type, placement,
permissions. Core and extensions ship them under `ang/`; a form edited in
FormBuilder is saved as an override in the site's files directory.

The stored layout is not what runs. Each form becomes an Angular module, and
`hook_civicrm_alterAngular` lets extensions change its markup with
selector-based change sets before the page receives it.

## Vocabulary

Elements:

| Element | Meaning |
|---|---|
| `af-form` | the form; `ctrl="afform"` names its controller for expressions |
| `af-entity` | a record the form creates or updates: `type`, `name`, `actions`, `security`, `data`, plus attributes AfformBehavior extensions add (`contact-dedupe`, …) |
| `af-field` | a field: `name`, `defn` (overrides of the field definition) |
| `af-tabset`, `af-tab` | tabs |
| `crm-search-display-*` | a SearchKit display: `search-name`, `display-name`, `filters` |
| a block's directive name (`afblock-contact-email`, …) | another layout embedded |
| `af-search-param-sets` | saved filter sets of a search form |

Attributes on any element:

| Attribute | Meaning |
|---|---|
| `af-fieldset` | the children edit this entity (`""` on a search form: filters) |
| `af-join` | the children edit a joined entity (emails, addresses) |
| `af-repeat`, `af-repeat-default`, `min`, `max`, `af-copy` | repeatable groups |
| `af-if` | show only when the condition list holds |
| `af-required`, `af-disabled` (on `af-field`) | conditional required and disabled |
| `af-title` | a heading for the container |

Classes mark the editor's building blocks: `af-container`, `af-text`,
`af-button` and `af-markup` (raw HTML). Buttons are plain `<button>` elements whose `ng-click` calls the
form controller, for example `afform.submit()`.

## Attribute types

Every attribute is either `text` or `js`. `CRM_Afform_ArrayHtml` holds the
list of `js` attributes: `data` and `actions` on every element, `defn` on
`af-field`, `actions` on `af-entity`, and what AfformBehavior extensions
declare for `af-entity`. Everything else is text.

A `js` attribute holds a JavaScript object literal, not JSON:
`defn="{required: true, input_attrs: {placeholder: 'Name'}}"`. Conditions in
`af-if` and the like are JSON in parentheses:
`af-if="([[&quot;Role1[0][fields][name]&quot;,&quot;!=&quot;,&quot;\&quot;admin\&quot;&quot;]])"`.

Text nodes carry Angular expressions in `{{ }}`. Core's layouts use
`{{:: ts('…', {…}) }}` and `{{ ts('…') }}`; a few extension forms read
variables their own controllers set (`{{options.client.id}}`).

## Three layout formats

The API returns a layout in one of three formats (`layoutFormat` on
`Afform.get`, `from`/`to` on `Afform.convert`):

| Format | What it is | Used by |
|---|---|---|
| `html` | the stored markup | the runtime: Angular compiles it as a template |
| `deep` | an array tree (`#tag`, `#children`, `#text`, `#comment`); `js` attributes decoded into arrays, text attributes as strings | the API's default |
| `shallow` | the same tree, every attribute as text; elements the GUI editor does not recognise keep their content as raw `#markup` | the GUI editor's `loadAdminData` |

There are three because the markup has no schema. Turning HTML into data
needs to know which attributes are code, and only `deep` applies the list
above. The editor needs more than that: it must hand back markup it does not
understand unchanged. `shallow` keeps that markup verbatim. The editor then
evaluates `shallow` attributes in the browser, by shape: a value that starts
and ends with `{}` or `[]`, or starts with `ts(`, goes through Angular's
`$parse`, `filters` excepted, and a value that fails to parse stays text. It
saves and converts the result as `deep`.

Which elements the editor recognises is fixed in
`CRM_Afform_ArrayHtml::isNodeEditable()`: `af-field`, `af-form`, `af-tabset`,
`af-tab`, the `af-fieldset` and `af-join` attributes and the
`af-container`, `af-text` and `af-button` classes.

## SearchKit is configuration, not markup

A saved search is an APIv4 query (`SavedSearch.api_params`), a display is a
JSON object of settings (`SearchDisplay.settings`): columns, links, pager,
sort, style rules as `[class, field, operator, value]`. Neither contains markup or
expressions. The server resolves each row's values, rewrites, links and
classes (`SearchDisplay.run`), so a renderer receives finished cells and lays
them out. The markup meets SearchKit only in the display element and its
`filters` attribute, which is an Angular expression again.

Angular remains where SearchKit lets extensions bring their own: display
types, column type `include` (an `ng-include`) and bulk actions with their
own dialogs.

## What the React renderer reads

The React renderer reads the layout after the change sets, as Angular does.
By default its server converts it with a subclass of `CRM_Afform_ArrayHtml`
into the `deep` format, translating `ts('…')` in `js` attributes, which
core's decoding turns into null. Its `bundle` source parses the compiled
module in the browser instead, with core's attribute types exported by
`Civi/Afreact/AttributeSchema.php`. The renderer renders the vocabulary above and
evaluates `ts()` and `crmUrl()` with literal arguments; any other expression,
directive or attribute renders a "Not supported by the React renderer" note.
The full list and the reasons are in
[comparison.md](comparison.md#not-implemented-in-the-react-renderer); the
support report lists them per form.

## What would make a second renderer easy

Each item is a change in core that would remove guesswork from every
renderer and editor, React and Angular alike.

1. **Publish the attribute schema.** `getSchema()` is protected; renderers
   have to subclass `CRM_Afform_ArrayHtml` to read it. An API action
   returning tags, attributes and their types, and a hook to add to it, would
   resolve core's own FIXME ("Need a way to make this extendable").
2. **One typed format for the editor.** With the schema public, the editor
   could load `deep` with raw `#markup` for unknown elements, instead of
   `shallow` plus evaluation by shape in the browser.
3. **Declare the editable vocabulary.** `isNodeEditable()` is a hard-coded
   list with a TODO to make it hookable; an extension's element is raw
   markup to the editor.
4. **Actions instead of `ng-click`.** A button that submits, saves a draft
   or resets could name the action (`af-action="submit"`) instead of calling
   a controller method; every renderer would then know what it does.
5. **Translate on the server.** `{{:: ts('…') }}` is the only expression
   most layouts contain, and `ts('…')` in a `js` attribute decodes to null on
   the server. Translating static text when the layout is delivered would
   leave layouts free of expressions.
6. **Renderer-neutral extension points.** An extension's field type, display
   type or bulk action dialog is an Angular template. A contract that names
   the element and its inputs (a custom element, for example) would let any
   renderer mount it.
7. **Follow SearchKit's lead.** Where SearchKit computes on the server and
   sends data, a second renderer costs little. The same split for Afform
   (conditions and defaults resolved by the server, a `deep` layout delivered
   to the browser) would make the markup a data format rather than a
   template.
