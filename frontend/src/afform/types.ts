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
    rows?: number;
    cols?: number;
  };
  /** Classes for the inputs, e.g. "btn btn-default" for radio buttons styled as buttons. */
  input_style?: string | null;
  help_pre?: string | null;
  help_post?: string | null;
  serialize?: number | null;
  afform_default?: unknown;
}

export interface FormDefinition {
  name: string;
  title: string | null;
  type: string;
  layout: LayoutNode[];
}

export type Values = Record<string, unknown>;
export interface EntityItem {
  fields: Values;
  joins?: Record<string, Values[]>;
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

export function isElement(node: LayoutNode): node is ElementNode {
  return "#tag" in node;
}
