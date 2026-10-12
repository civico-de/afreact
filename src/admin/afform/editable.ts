import { kebab, pluginDefined } from "./canvas/plugins";

/** Core's builder templates React builds itself, by the parts that name them. */
export const CORE_INPUT_TEMPLATE = /^~\/afGuiEditor\/inputType\/(\w+)\.html$/;
export const CHECKOUT_TEMPLATE = "~/afCheckout/inputType/CheckoutBlockAdmin.html";
export const PARAM_SETS_TEMPLATE = "~/afGuiEditor/elements/afGuiSearchParamSets.html";
export const RECAPTCHA_TEMPLATE = "~/afGuiRecaptcha2/afGuiRecaptcha2.html";
export const GENERIC_OPTIONS = "~/afGuiEditor/entityConfig/EntityOptionsGeneric.html";
export const GROUP_OPTIONS = "~/afGuiEditor/entityConfig/GroupSubscriptionOptions.html";
export const RELATIONSHIP_BEHAVIOR = "~/afGuiEditor/behaviors/autofillRelationshipBehavior.html";

// deviation:afform-plugin-parts
/** The plugin elements of the FormBuilder contract, by the part they edit. */
export const elementTag = (directive: string) => `afreact-afform-admin-${directive}`;
export const inputTypeTag = (type: string) => `afreact-afform-admin-input-${kebab(type)}`;
export const behaviorTag = (key: string) => `afreact-afform-admin-behavior-${key}`;
export const entityOptionsTag = (type: string) => `afreact-afform-admin-entity-${kebab(type)}`;

/** Whether React edits a part with a template: it builds the template, or a plugin defines the element. */
export const elementEditable = (directive: string, template: string | undefined) =>
  !template ||
  template === PARAM_SETS_TEMPLATE ||
  template === RECAPTCHA_TEMPLATE ||
  pluginDefined(elementTag(directive));

export const inputTypeEditable = (name: string, template: string | undefined) =>
  !template ||
  CORE_INPUT_TEMPLATE.test(template) ||
  template === CHECKOUT_TEMPLATE ||
  pluginDefined(inputTypeTag(name));

export const behaviorEditable = (key: string, template: string | null | undefined) =>
  !template || template === RELATIONSHIP_BEHAVIOR || pluginDefined(behaviorTag(key));

export const entityOptionsEditable = (type: string, template: string | undefined) =>
  !template ||
  template === GENERIC_OPTIONS ||
  template === GROUP_OPTIONS ||
  pluginDefined(entityOptionsTag(type));
