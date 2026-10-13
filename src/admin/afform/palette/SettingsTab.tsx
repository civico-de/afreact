import { useQuery } from "@tanstack/react-query";
import { useId, useRef } from "react";
import { api4 } from "../../../api/civi";
import { EntityTags, useTags } from "../../widgets/EntityTags";
import { IconPicker } from "../../widgets/IconPicker";
import { Picker, type PickerOption } from "../../widgets/Picker";
import { RichTextInput, type RichTextElement } from "../canvas/Content";
import { FormTokenSelect } from "../canvas/TokenSelect";
import { useEditor } from "../context";
import { FieldValue } from "../FieldValue";
import type { AfformDefinition } from "../meta";
import { retitle } from "../model";
import { formTokens } from "../tokens";
import {
  DebouncedInput,
  DebouncedTextarea,
  HelpLink,
  PaletteSection,
  useDebounced,
} from "./common";
import {
  hasPlacementEntities,
  placementEntities,
  placementRequiresRoute,
  unreadableFilters,
  withPlacement,
} from "./lists";

const ROUTE_PATTERN = "^civicrm\\/[\\-0-9a-zA-Z\\/_]+$";
const REDIRECT_PATTERN = "^((http|https):\\/\\/|\\/|civicrm\\/)[\\-0-9a-zA-Z\\/_.]\\S+$";

const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : typeof value === "string" && value ? [value] : [];

const numberOrNull = (value: string) => (value === "" ? null : Number(value));

interface MenuItem {
  id: number;
  name: string;
  label: string;
  parent_id: number | null;
  icon: string | null;
}

/** loadNavigationMenu(): the menu's items but Home and the form's own, each named by its path. */
function useNavigationOptions(enabled: boolean, ownName: string | undefined) {
  return useQuery({
    queryKey: ["afreactNavigation", ownName ?? null],
    enabled,
    staleTime: Infinity,
    queryFn: async (): Promise<PickerOption[]> => {
      const where: unknown[][] = [
        ["domain_id", "=", "current_domain"],
        ["name", "!=", "Home"],
      ];
      if (ownName) where.push(["name", "!=", ownName]);
      const items = await api4<MenuItem>("Navigation", "get", {
        select: ["name", "label", "parent_id", "icon"],
        where,
        orderBy: { weight: "ASC" },
      });
      const tree = (parent: number | null, path: string): PickerOption[] =>
        items
          .filter((item) => item.parent_id === parent)
          .flatMap((item) => {
            const label = path ? `${path} › ${item.label}` : item.label;
            return [{ id: item.name, label, icon: item.icon }, ...tree(item.id, label)];
          });
      return tree(null, "");
    },
  });
}

/** The settings label of an Afform field, as core reads it from the field's spec. */
function useFieldTitle() {
  const editor = useEditor();
  return (name: string) => {
    const spec = editor.meta.admin.afform_fields[name];
    const title = spec?.title;
    return typeof title === "string" ? title : (spec?.label ?? name);
  };
}

function Navigation() {
  const editor = useEditor();
  const id = useId();
  const afform = editor.afform;
  const navigation = afform.navigation;
  const menu = useNavigationOptions(!!navigation, afform.name);
  const set = (update: (afform: AfformDefinition) => AfformDefinition) => {
    editor.change(update);
  };
  return (
    <div className="form-group">
      <div className="form-inline">
        <label className={afform.server_route ? undefined : "disabled"}>
          <input
            type="checkbox"
            checked={!!afform.server_route && !!navigation}
            disabled={!afform.server_route}
            onChange={() => {
              set((current) => ({
                ...current,
                navigation: current.navigation
                  ? null
                  : { parent: null, label: current.title, weight: 0 },
              }));
            }}
          />{" "}
          {ts("Add to Navigation Menu")}
        </label>
        {navigation && (
          <div className="form-group">
            <DebouncedInput
              className="form-control"
              // deviation:menu-item-title-label
              aria-label={ts("Menu item title")}
              placeholder={ts("Title")}
              required
              value={navigation.label}
              onCommit={(label) => {
                set((current) =>
                  current.navigation
                    ? { ...current, navigation: { ...current.navigation, label } }
                    : current,
                );
              }}
            />{" "}
            {menu.data ? (
              <Picker
                id={`${id}-parent`}
                label={ts("Parent menu item")}
                hiddenLabel
                placeholder={ts("Top Level")}
                options={menu.data}
                value={navigation.parent ? [navigation.parent] : []}
                single
                clearable
                onChange={([parent]) => {
                  set((current) =>
                    current.navigation
                      ? {
                          ...current,
                          navigation: {
                            ...current.navigation,
                            parent: parent === undefined ? null : String(parent),
                          },
                        }
                      : current,
                  );
                }}
              />
            ) : menu.error ? (
              <span className="crm-error" role="alert">
                {menu.error.message}
              </span>
            ) : (
              <input
                className="form-control loading"
                disabled
                aria-label={ts("Loading menu items")}
                placeholder={ts("Loading menu items")}
              />
            )}{" "}
            <label htmlFor={`${id}-weight`}>{ts("Order")}</label>{" "}
            <input
              className="form-control"
              id={`${id}-weight`}
              type="number"
              placeholder={ts("Order")}
              min={0}
              step={1}
              required
              value={navigation.weight}
              onChange={(event) => {
                const weight = Number(event.target.value);
                set((current) =>
                  current.navigation
                    ? { ...current, navigation: { ...current.navigation, weight } }
                    : current,
                );
              }}
            />
          </div>
        )}
      </div>
      {!afform.server_route && <p className="help-block disabled">{ts("Requires a page route")}</p>}
    </div>
  );
}

/** The page route: "civicrm/" offered on focus, kept only once something follows it. */
function ServerRoute({ required }: { required: boolean }) {
  const editor = useEditor();
  const id = useId();
  const route = useDebounced(text(editor.afform.server_route), (value) => {
    editor.change((afform) => ({ ...afform, server_route: value }));
  });
  const invalid = route.value !== "" && !new RegExp(ROUTE_PATTERN).test(route.value);
  const title = useFieldTitle()("server_route");
  return (
    <div className={`form-group${invalid ? " has-error" : ""}`}>
      <label htmlFor={id}>
        {title} <HelpLink id="server_route" title={title} />
      </label>
      <input
        id={id}
        className="form-control"
        pattern={ROUTE_PATTERN}
        title={ts('Path must begin with "civicrm/"')}
        placeholder={ts("None")}
        required={required}
        aria-invalid={invalid || undefined}
        value={route.value}
        onFocus={() => {
          if (!route.value) route.show("civicrm/");
        }}
        onChange={(event) => {
          route.onChange(event.target.value);
        }}
        onBlur={() => {
          route.onBlur(route.value === "civicrm/" ? "" : undefined);
        }}
      />
    </div>
  );
}

function Placement() {
  const editor = useEditor();
  const id = useId();
  const afform = editor.afform;
  const title = useFieldTitle();
  const requires = placementRequiresRoute(editor.meta, afform);
  const unreadable = afform.type === "search" ? unreadableFilters(afform, editor.meta) : [];
  const filters =
    afform.placement_filters && !Array.isArray(afform.placement_filters)
      ? afform.placement_filters
      : {};
  return (
    <PaletteSection
      name="settings-placement"
      title={ts("Placement Options")}
      summary={afform.server_route ?? undefined}
    >
      <ServerRoute required={!!requires} />
      {!!afform.server_route && (
        <div className="form-group">
          <label>
            {ts("Frontend or backend?")}{" "}
            <HelpLink id="server_route_is_public" title={ts("Frontend or backend?")} />
            <div className="crm-form-toggle-container">
              <input
                type="checkbox"
                className="crm-form-toggle"
                checked={!!afform.is_public}
                onChange={(event) => {
                  const isPublic = event.target.checked;
                  editor.change((current) => ({ ...current, is_public: isPublic }));
                }}
              />
              <span className="crm-form-toggle-text crm-form-toggle-text-off">{ts("Backend")}</span>
              <span className="crm-form-toggle-text crm-form-toggle-text-on">{ts("Frontend")}</span>
            </div>
          </label>
        </div>
      )}
      <Navigation />
      {(!!afform.navigation || hasPlacementEntities(editor.meta, afform)) && (
        <div className="form-group">
          <div className="form-inline">
            <span className="afreact-palette-label">{title("icon")}</span>{" "}
            <IconPicker
              label={title("icon")}
              required
              value={text(afform.icon)}
              onChange={(icon) => {
                editor.change((current) => ({ ...current, icon }));
              }}
            />
          </div>
        </div>
      )}
      <div className="form-group">
        <label htmlFor={`${id}-placement`}>
          {title("placement")} <HelpLink id="placement" title={title("placement")} />
        </label>
        <Picker
          id={`${id}-placement`}
          label={title("placement")}
          externalLabel
          placeholder={ts("None")}
          options={editor.meta.admin.afform_placement.map((item) => ({
            id: item.id,
            label: item.text,
            icon: item.icon,
          }))}
          value={afform.placement ?? []}
          disabled={unreadable.length > 0}
          onChange={(placement) => {
            editor.change((current) => withPlacement(current, editor.meta, placement.map(String)));
          }}
        />
        {unreadable.length > 0 && (
          <p className="text-warning">
            <i className="crm-i fa-exclamation-triangle" role="img" aria-hidden="true" />
            {ts(
              "The placement cannot change while the filters of %1 cannot be read. Correct them in the Markup tab.",
              { 1: unreadable.map((display) => display.key).join(", ") },
            )}
          </p>
        )}
        {!afform.server_route && requires && (
          <p className="text-warning">
            <i className="crm-i fa-exclamation-triangle" role="img" aria-hidden="true" />
            {ts("%1 placement requires a page route.", { 1: requires })}
          </p>
        )}
      </div>
      {(afform.placement ?? []).length > 0 && (
        <div className="form-group">
          {Array.isArray(afform.placement_filters) && (
            <p className="text-warning">
              <i className="crm-i fa-exclamation-triangle" role="img" aria-hidden="true" />{" "}
              {ts(
                "The stored placement filters are a list, which the placements ignore. They are saved as they are until a filter is chosen here.",
              )}
            </p>
          )}
          {/* deviation:placement-rows-with-filter */}
          {placementEntities(editor.meta, afform).map(({ key, filter }) =>
            filter ? (
              <div className="form-inline" key={key}>
                <label htmlFor={`${id}-filter-${filter.name}`}>{filter.label}</label>{" "}
                <Picker
                  id={`${id}-filter-${filter.name}`}
                  label={filter.label}
                  externalLabel
                  placeholder={ts("Any")}
                  options={filter.options.map((option) => ({
                    id: option.id,
                    label: option.text,
                  }))}
                  value={list(filters[filter.name])}
                  onChange={(values) => {
                    editor.change((current) => ({
                      ...current,
                      placement_filters: {
                        ...(current.placement_filters && !Array.isArray(current.placement_filters)
                          ? current.placement_filters
                          : {}),
                        [filter.name]: values.map(String),
                      },
                    }));
                  }}
                />
              </div>
            ) : null,
          )}
          <div className="form-inline">
            <label htmlFor={`${id}-weight`}>
              {title("placement_weight")}{" "}
              <HelpLink id="placement_weight" title={title("placement_weight")} />
            </label>{" "}
            <input
              className="form-control six"
              type="number"
              id={`${id}-weight`}
              placeholder={ts("Auto")}
              value={text(afform.placement_weight)}
              onChange={(event) => {
                const weight = numberOrNull(event.target.value);
                editor.change((current) => ({ ...current, placement_weight: weight }));
              }}
            />
          </div>
        </div>
      )}
    </PaletteSection>
  );
}

function Checkbox({
  name,
  checked,
  onChange,
  help = true,
}: {
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  help?: boolean;
}) {
  const title = useFieldTitle()(name);
  return (
    <div className="form-group">
      <label>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => {
            onChange(event.target.checked);
          }}
        />{" "}
        {title}
      </label>{" "}
      {help && <HelpLink id={name} title={title} />}
    </div>
  );
}

function Submissions() {
  const editor = useEditor();
  const id = useId();
  const afform = editor.afform;
  const title = useFieldTitle();
  const message = useRef<RichTextElement | null>(null);
  const set = (values: Partial<AfformDefinition>) => {
    editor.change((current) => ({ ...current, ...values }));
  };
  const confirmation = editor.meta.admin.afform_fields.confirmation_type?.options ?? [];
  return (
    <PaletteSection
      name="settings-submissions"
      title={ts("Submissions")}
      summary={afform.submit_enabled === false ? ts("Closed") : ts("Open")}
    >
      <p className="form-inline" role="radiogroup" aria-label={ts("Submissions")}>
        <label className="radio">
          <input
            className="crm-form-radio"
            type="radio"
            name={`${id}-submit-enabled`}
            checked={afform.submit_enabled === true}
            onChange={() => {
              set({ submit_enabled: true });
            }}
          />{" "}
          {ts("Open")}
        </label>{" "}
        <label className="radio">
          <input
            className="crm-form-radio"
            type="radio"
            name={`${id}-submit-enabled`}
            checked={afform.submit_enabled === false}
            onChange={() => {
              set({ submit_enabled: false });
            }}
          />{" "}
          {ts("Closed")}
        </label>
      </p>
      {!!afform.submit_enabled && (
        <div>
          <Checkbox
            name="autosave_draft"
            checked={!!afform.autosave_draft}
            onChange={(checked) => {
              set({ autosave_draft: checked });
            }}
          />
          <Checkbox
            name="create_submission"
            checked={!!afform.create_submission}
            onChange={(checked) => {
              set({ create_submission: checked });
            }}
          />
          {!!afform.create_submission && (
            <div className="crm-flex-box">
              <div className="form-group">
                <label htmlFor={`${id}-limit`}>{ts("Max Submissions (total)")}</label>
                <input
                  className="form-control eight"
                  type="number"
                  min={1}
                  step={1}
                  id={`${id}-limit`}
                  placeholder={ts("Unlimited")}
                  value={text(afform.submit_limit)}
                  onChange={(event) => {
                    set({ submit_limit: numberOrNull(event.target.value) });
                  }}
                />
              </div>
              <div className="form-group">
                <label htmlFor={`${id}-limit-user`}>{ts("Max Submissions (per user)")}</label>
                <input
                  className="form-control eight"
                  type="number"
                  min={1}
                  step={1}
                  id={`${id}-limit-user`}
                  placeholder={ts("Unlimited")}
                  value={text(afform.submit_limit_per_user)}
                  onChange={(event) => {
                    set({ submit_limit_per_user: numberOrNull(event.target.value) });
                  }}
                />
              </div>
            </div>
          )}
          <Checkbox
            name="manual_processing"
            checked={!!afform.manual_processing}
            onChange={(checked) => {
              set(
                checked
                  ? { manual_processing: true, create_submission: true }
                  : { manual_processing: null },
              );
            }}
          />
          {!!afform.manual_processing && (
            <div className="form-group">
              <Checkbox
                name="allow_verification_by_email"
                checked={!!afform.allow_verification_by_email}
                onChange={(checked) => {
                  set(
                    checked
                      ? {
                          allow_verification_by_email: true,
                          create_submission: true,
                          manual_processing: true,
                        }
                      : { allow_verification_by_email: null },
                  );
                }}
              />
              {!!afform.allow_verification_by_email && (
                <div className="form-inline">
                  <label htmlFor={`${id}-template`}>
                    {title("email_confirmation_template_id")}
                  </label>{" "}
                  <FieldValue
                    id={`${id}-template`}
                    field={{
                      name: "email_confirmation_template_id",
                      label: title("email_confirmation_template_id"),
                      input_type: "EntityRef",
                      data_type: "Integer",
                      fk_entity: "MessageTemplate",
                    }}
                    value={afform.email_confirmation_template_id ?? null}
                    onChange={(value) => {
                      set({ email_confirmation_template_id: value ?? null });
                    }}
                  />
                </div>
              )}
            </div>
          )}
          <div className="form-group">
            <span className="afreact-palette-label" id={`${id}-confirmation`}>
              {title("confirmation_type")}{" "}
              <HelpLink id="confirmation_type" title={title("confirmation_type")} />
            </span>
            <p className="form-inline" role="radiogroup" aria-labelledby={`${id}-confirmation`}>
              {confirmation.map((option) => (
                <label className="radio" key={option.id}>
                  <input
                    className="crm-form-radio"
                    type="radio"
                    name={`${id}-confirmation-type`}
                    checked={afform.confirmation_type === option.id}
                    onChange={() => {
                      set({ confirmation_type: option.id });
                    }}
                  />{" "}
                  {option.label}{" "}
                </label>
              ))}
            </p>
          </div>
          {afform.confirmation_type === "redirect_to_url" && <Redirect />}
        </div>
      )}
      {afform.confirmation_type === "show_confirmation_message" && (
        <div className="form-group">
          <span className="afreact-palette-label">{title("confirmation_message")}</span>
          <RichTextInput
            value={text(afform.confirmation_message)}
            tokens={() => formTokens(editor, true)}
            elementRef={message}
            onChange={(value) => {
              set({ confirmation_message: value });
            }}
          />
          <p className="help-block">
            {ts("This message wil be displayed when the form is submitted.")}
          </p>
        </div>
      )}
    </PaletteSection>
  );
}

function Redirect() {
  const editor = useEditor();
  const id = useId();
  const title = useFieldTitle()("redirect");
  const redirect = useDebounced(text(editor.afform.redirect), (value) => {
    editor.change((afform) => ({ ...afform, redirect: value }));
  });
  const invalid = redirect.value !== "" && !new RegExp(REDIRECT_PATTERN).test(redirect.value);
  return (
    <div className={`form-group${invalid ? " has-error" : ""}`}>
      <label htmlFor={id}>{title}</label>
      <div className="input-group">
        <input
          id={id}
          className="form-control"
          pattern={REDIRECT_PATTERN}
          title={ts(
            "Post-Submit Page must be either an absolute url, a relative url or a path starting with CiviCRM",
          )}
          aria-invalid={invalid || undefined}
          value={redirect.value}
          onChange={(event) => {
            redirect.onChange(event.target.value);
          }}
          onBlur={() => {
            redirect.onBlur();
          }}
        />
        <span className="input-group-addon">
          <FormTokenSelect
            value={text(editor.afform.redirect)}
            onChange={(value) => {
              editor.change((afform) => ({ ...afform, redirect: value }));
            }}
          />
        </span>
      </div>
      <p className="help-block">
        {ts(
          "Enter a URL or path that the form should redirect to following a successful submission.",
        )}
      </p>
    </div>
  );
}

/** The form's tags, stored by name, picked and made by id. */
function Tags() {
  const editor = useEditor();
  const tags = useTags("Afform");
  const names = list(editor.afform.tags);
  const all = tags.data ?? [];
  const ids = all.filter((tag) => names.includes(tag.name)).map((tag) => tag.id);
  const title = useFieldTitle()("tags");
  return (
    <div className="form-group">
      <span className="afreact-palette-label">
        {title} <HelpLink id="tags" title={title} />
      </span>
      <div>
        <EntityTags
          size="sm"
          entityTable="Afform"
          tagIds={ids}
          onChange={(next) => {
            const picked = all
              .filter((tag) => next.includes(tag.id))
              .map((tag) => tag.name)
              .sort();
            editor.change((afform) => ({ ...afform, tags: picked }));
          }}
        />
      </div>
    </div>
  );
}

/** config-form: the form's own settings. */
export function SettingsTab() {
  const editor = useEditor();
  const id = useId();
  const afform = editor.afform;
  const title = useFieldTitle();
  const locales = editor.meta.admin.locales;
  const operators = editor.meta.admin.afform_fields.permission_operator?.options ?? [];
  return (
    <form
      className="afreact-palette-sections"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      {/* Outside the sections: saving waits for it. */}
      <div className="form-group">
        <label htmlFor={`${id}-title`}>
          {title("title")} <span className="crm-marker">*</span>{" "}
          <HelpLink id="title" title={title("title")} />
        </label>
        <DebouncedInput
          id={`${id}-title`}
          className="form-control"
          required
          title={ts("Required")}
          value={afform.title}
          onCommit={(value) => {
            editor.change((current) => retitle(current, value));
          }}
        />
      </div>
      <PaletteSection name="settings-general" title={ts("General")}>
        {/* deviation:locale-setting-label */}
        {locales.length > 0 && (
          <div className="form-group">
            <label htmlFor={`${id}-locale`}>
              {title("locale")} <span className="crm-marker">*</span>
            </label>{" "}
            <HelpLink id="afform_locale" title={title("locale")} />
            <Picker
              id={`${id}-locale`}
              label={title("locale")}
              externalLabel
              placeholder=""
              options={locales.map((locale) => ({ id: locale.id, label: locale.text }))}
              value={list(afform.locale).slice(0, 1)}
              single
              onChange={([locale]) => {
                editor.change((current) => ({
                  ...current,
                  locale: locale === undefined ? [] : [String(locale)],
                }));
              }}
            />
          </div>
        )}
        <div className="form-group">
          <label htmlFor={`${id}-description`}>
            {title("description")} <HelpLink id="description" title={title("description")} />
          </label>
          <DebouncedTextarea
            id={`${id}-description`}
            className="form-control"
            rows={1}
            value={text(afform.description)}
            onCommit={(value) => {
              editor.change((current) => ({ ...current, description: value }));
            }}
          />
        </div>
        {afform.type !== "block" && (
          <div className="form-group">
            <label htmlFor={`${id}-permission`}>
              {title("permission")} <HelpLink id="permission" title={title("permission")} />
            </label>
            <div className="form-inline afreact-permission-row">
              <Picker
                id={`${id}-permission`}
                label={title("permission")}
                externalLabel
                placeholder=""
                options={editor.meta.gui.permissions.flatMap((group) =>
                  group.children.map((permission) => ({
                    id: permission.id,
                    label: permission.text,
                    description: permission.description ?? undefined,
                    group: group.text,
                  })),
                )}
                value={list(afform.permission)}
                onChange={(permission) => {
                  editor.change((current) => ({ ...current, permission: permission.map(String) }));
                }}
              />{" "}
              <label className="sr-only" htmlFor={`${id}-operator`}>
                {title("permission_operator")}
              </label>
              <select
                id={`${id}-operator`}
                className="form-control"
                value={text(afform.permission_operator)}
                onChange={(event) => {
                  const operator = event.target.value;
                  editor.change((current) => ({ ...current, permission_operator: operator }));
                }}
              >
                {operators.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <Tags />
      </PaletteSection>
      {afform.type !== "block" && <Placement />}
      {afform.type === "form" && <Submissions />}
    </form>
  );
}
