import type { Condition } from "./conditions";

/** Afform layout in the deep array format of CRM_Afform_ArrayHtml. */
export interface TextNode {
  "#text": string;
}
export interface CommentNode {
  "#comment": string;
}
export interface ElementNode {
  "#tag": string;
  "#children"?: LayoutNode[];
  [attribute: string]: unknown;
}
export type LayoutNode = TextNode | CommentNode | ElementNode;

export interface FieldOption {
  id: string | number | boolean;
  label: string;
  /** Conditions under which FormBuilder shows the option. */
  if?: Condition[];
}

/** Field metadata as merged by core's AfformMetadataInjector. */
export interface FieldDefn {
  name: string;
  label?: string | false;
  input_type: string;
  data_type: string;
  required?: boolean;
  options?: FieldOption[] | false;
  input_attrs?: {
    /** Entity action this field selects a record for, e.g. "update" on the id field. */
    autofill?: string;
    multiple?: boolean;
    placeholder?: string;
    time?: boolean;
    min?: number;
    max?: number;
    step?: number;
    maxlength?: number;
    /** Text and TextArea only, as in core's templates. */
    minlength?: number;
    rows?: number;
    cols?: number;
    /** EntityRef: list results before anything is typed. */
    autoOpen?: boolean;
    /** EntityRef: links to quick-add forms, all of the entity's (true) or by path. */
    quickAdd?: boolean | string[];
    /** ChainSelect: the field whose value filters the options; EntityRef: the one picking dfk_entities. */
    control_field?: string;
  };
  /** Classes for the inputs, e.g. "btn btn-default" for radio buttons styled as buttons. */
  input_style?: string | null;
  help_pre?: string | null;
  help_post?: string | null;
  serialize?: number | null;
  afform_default?: unknown;
  /** Search filters: the operator a value is sent with, e.g. {title: {CONTAINS: "x"}}. */
  search_operator?: string | null;
  /** Search filters: the user picks the operator from `operators` (operator => label). */
  expose_operator?: boolean;
  operators?: Record<string, string>;
  /** Search filters: a low and a high value ({">=": …, "<=": …}). */
  search_range?: boolean;
  is_date?: boolean | number;
  fk_entity?: string | null;
  /** A dynamic foreign key: the entity for each value of input_attrs.control_field. */
  dfk_entities?: Record<string, string> | null;
}

export interface FormDefinition {
  name: string;
  title: string | null;
  type: string;
  layout: LayoutNode[];
  /** Translations of the ts() texts in the form's and its blocks' layouts; PHP sends [] for none. */
  strings: Record<string, string> | [];
}

export type Values = Record<string, unknown>;
export interface EntityItem {
  fields: Values;
  /** Prefill sends null for a location block whose location type the contact lacks. */
  joins?: Record<string, (Values | null)[]>;
}
/** Afform submission values: entity name => items. */
export type FormData = Record<string, EntityItem[]>;

/** Where a field's value lives: an entity item, or one of its join records. */
export interface Scope {
  entity: string;
  index: number;
  join?: string;
  joinIndex?: number;
  /** Set inside an af-repeat of join records, where is_primary is exclusive. */
  repeated?: boolean;
}

/** Metadata the server merges into an af-field; a field without it renders as unsupported. */
export function isFieldDefn(value: unknown): value is FieldDefn {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    "data_type" in value &&
    typeof value.data_type === "string" &&
    "input_type" in value &&
    typeof value.input_type === "string" &&
    value.input_type !== ""
  );
}

export function isElement(node: LayoutNode): node is ElementNode {
  return "#tag" in node;
}
