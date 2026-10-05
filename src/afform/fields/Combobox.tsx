import { useCombobox } from "downshift";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { AutocompleteItem, SearchContext, SearchPage } from "./autocomplete";

/**
 * An ARIA 1.2 combobox over `<Entity>.autocomplete`, in the markup and classes of
 * $.fn.crmAutocomplete's select2 widget so the theme styles it. A lazy chunk: it imports
 * nothing of the entry, so callers hand it the search and the item text.
 */

/** select2's quietMillis in $.fn.crmAutocomplete. */
export const SEARCH_DELAY_MS = 250;

export interface ComboboxProps {
  id: string;
  /** Names the listbox; the input is named by the field's <label>. */
  label: string | undefined;
  placeholder: string | undefined;
  describedBy: string | undefined;
  className: string | undefined;
  disabled: boolean;
  required: boolean;
  multiple: boolean;
  /** Without autoOpen select2 waits for one character before it searches. */
  minLength: number;
  /** The records of the current value, in its order. */
  selected: AutocompleteItem[];
  /** True while the records of the current value load. */
  resolving: boolean;
  itemText: (item: AutocompleteItem) => string;
  /** Rejects with an Error carrying the server's message. */
  load: (input: string, context: SearchContext) => Promise<SearchPage>;
  onSelect: (item: AutocompleteItem) => void;
  onRemove: (item: AutocompleteItem) => void;
}

interface Results {
  term: string;
  items: AutocompleteItem[];
  more: boolean;
  context: SearchContext | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

const NO_RESULTS: Results = {
  term: "",
  items: [],
  more: false,
  context: null,
  loading: false,
  loadingMore: false,
  error: null,
};

const classes = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

function failure(error: unknown): string {
  return error instanceof Error ? error.message : JSON.stringify(error);
}

/** CRM.utils.formatSelect2Result. */
function ResultRow({ item, text }: { item: AutocompleteItem; text: string }) {
  return (
    <div className="crm-select2-row">
      {item.image !== undefined ? (
        <div className="crm-select2-image">
          <img src={item.image} alt="" />
        </div>
      ) : (
        item.icon_class && (
          <div className="crm-select2-icon">
            <div className={`crm-icon ${item.icon_class}-icon`} />
          </div>
        )
      )}
      <div>
        <div className={classes("crm-select2-row-label", item.label_class)}>
          <ItemMarks item={item} icon />
          {text}
        </div>
        <div className="crm-select2-row-description">
          {(item.description ?? []).map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

function ItemMarks({ item, icon }: { item: AutocompleteItem; icon: boolean }): ReactNode {
  return (
    <>
      {item.color && (
        <>
          <span className="crm-select-item-color" style={{ backgroundColor: item.color }} />{" "}
        </>
      )}
      {icon && item.icon && (
        <>
          <i className={`crm-i ${item.icon}`} role="img" aria-hidden="true" />{" "}
        </>
      )}
    </>
  );
}

export function Combobox(props: ComboboxProps) {
  const { id, multiple, selected, itemText, disabled } = props;
  // null while the input shows the value rather than what the user typed.
  const [query, setQuery] = useState<string | null>(null);
  const [results, setResults] = useState<Results>(NO_RESULTS);
  const input = useRef<HTMLInputElement>(null);
  const chosen = new Set(selected.map((item) => String(item.id)));
  // select2 hides chosen records from a multi-select's results.
  const items = multiple
    ? results.items.filter((item) => !chosen.has(String(item.id)))
    : results.items;
  const single = multiple ? undefined : selected[0];
  const term = query ?? "";
  const load = useEffectEvent(props.load);

  const combobox = useCombobox<AutocompleteItem>({
    items,
    itemToString: (item) => (item ? itemText(item) : ""),
    selectedItem: null,
    inputValue: query ?? (single ? itemText(single) : ""),
    inputId: id,
    menuId: `${id}-listbox`,
    getItemId: (index) => `${id}-option-${String(index)}`,
    defaultHighlightedIndex: 0,
    stateReducer: (state, { type, changes }) =>
      // Leaving the field keeps the value; select2 selects nothing on blur.
      type === useCombobox.stateChangeTypes.InputBlur
        ? { ...changes, selectedItem: state.selectedItem }
        : changes,
    onStateChange: ({ type, selectedItem, inputValue }) => {
      const types = useCombobox.stateChangeTypes;
      if (type === types.InputChange) setQuery(inputValue ?? "");
      else if (selectedItem && (type === types.ItemClick || type === types.InputKeyDownEnter)) {
        props.onSelect(selectedItem);
        setQuery(null);
      } else if (type === types.InputBlur || type === types.InputKeyDownEscape) setQuery(null);
    },
    onHighlightedIndexChange: ({ highlightedIndex }) => {
      if (highlightedIndex === items.length - 1) loadMore();
    },
  });
  const { isOpen, highlightedIndex } = combobox;
  const searching = isOpen && term.length >= props.minLength;

  useEffect(() => {
    if (!searching) return undefined;
    let current = true;
    const timer = setTimeout(() => {
      setResults({ ...NO_RESULTS, term, loading: true });
      load(term, { searchField: null, searchFields: [], previousIds: [] }).then(
        (page) => {
          if (current) setResults({ ...NO_RESULTS, term, ...page });
        },
        (error: unknown) => {
          if (current) setResults({ ...NO_RESULTS, term, error: failure(error) });
        },
      );
    }, SEARCH_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [searching, term]);

  function loadMore() {
    const { context, more, loadingMore, term: searched } = results;
    if (!more || loadingMore || !context) return;
    setResults({ ...results, loadingMore: true });
    const update = (change: (previous: Results) => Results) => {
      setResults((previous) => (previous.term === searched ? change(previous) : previous));
    };
    props.load(searched, context).then(
      (page) => {
        update((previous) => ({
          ...previous,
          ...page,
          items: [...previous.items, ...page.items],
          loadingMore: false,
        }));
      },
      (error: unknown) => {
        update((previous) => ({
          ...previous,
          loadingMore: false,
          more: false,
          error: failure(error),
        }));
      },
    );
  }

  const fresh = results.term === term && !results.loading;
  const message = ((): [string, string] | null => {
    if (!isOpen) return null;
    if (!searching) return ["select2-no-results", ts("Enter search term or id...")];
    if (!fresh) return ["select2-searching", ts("Searching...")];
    if (results.error) return ["select2-ajax-error", results.error];
    if (!items.length) return ["select2-no-results", ts("None found.")];
    if (results.loadingMore) return ["select2-more-results", ts("Loading...")];
    return null;
  })();
  const count = items.length === 1 ? ts("1 result") : ts("%1 results", { 1: items.length });
  const announcement = message?.[1] ?? (isOpen ? count : "");

  const hasValue = selected.length > 0;
  const invalid = props.required && !hasValue && !props.resolving;
  useEffect(() => {
    input.current?.setCustomValidity(invalid ? ts("Please select a value.") : "");
  }, [invalid]);

  const removeLast = (event: KeyboardEvent<HTMLInputElement>) => {
    const last = selected.at(-1);
    if (multiple && event.key === "Backspace" && term === "" && last) props.onRemove(last);
  };
  const remove = (item: AutocompleteItem) => (event: KeyboardEvent | MouseEvent) => {
    if ("key" in event && event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    props.onRemove(item);
    input.current?.focus();
  };

  return (
    <div
      className={classes(
        "select2-container select2-container-multi form-control crm-ajax-select afreact-combobox",
        props.className,
        isOpen && "select2-dropdown-open select2-container-active",
        disabled && "select2-container-disabled",
        (props.resolving || (searching && !fresh)) && "loading",
        invalid && "ng-invalid",
      )}
    >
      <ul className="select2-choices">
        {multiple &&
          selected.map((item) => (
            <li key={String(item.id)} className="select2-search-choice">
              <div>
                <ItemMarks item={item} icon={false} />
                {itemText(item)}
              </div>
              {!disabled && (
                <a
                  role="button"
                  tabIndex={0}
                  className="select2-search-choice-close"
                  aria-label={ts("Remove %1", { 1: itemText(item) })}
                  onClick={remove(item)}
                  onKeyDown={remove(item)}
                />
              )}
            </li>
          ))}
        <li className="select2-search-field">
          <input
            {...combobox.getInputProps({
              ref: input,
              type: "text",
              className: classes("select2-input", !hasValue && "select2-default"),
              placeholder: hasValue ? undefined : props.placeholder,
              disabled,
              "aria-labelledby": undefined,
              "aria-describedby": props.describedBy,
              "aria-required": props.required,
              "aria-busy": props.resolving,
              onKeyDown: removeLast,
              onFocus: (event) => {
                if (single) event.currentTarget.select();
              },
            })}
          />
        </li>
      </ul>
      <div
        className={classes(
          "select2-drop select2-drop-active crm-container",
          multiple && "select2-drop-multi",
          !isOpen && "select2-display-none",
        )}
        hidden={!isOpen}
      >
        <ul
          {...combobox.getMenuProps({
            className: "select2-results",
            "aria-labelledby": undefined,
            "aria-label": props.label ?? props.placeholder,
            onScroll: (event) => {
              const list = event.currentTarget;
              if (list.scrollTop + list.clientHeight >= list.scrollHeight - 1) loadMore();
            },
          })}
        >
          {isOpen &&
            fresh &&
            items.map((item, index) => (
              <li
                key={String(item.id)}
                className={classes(
                  "select2-results-dept-0 select2-result select2-result-selectable",
                  highlightedIndex === index && "select2-highlighted",
                )}
                {...combobox.getItemProps({ item, index })}
              >
                <div className="select2-result-label">
                  <ResultRow item={item} text={itemText(item)} />
                </div>
              </li>
            ))}
        </ul>
        {message && (
          <ul className="select2-results">
            <li className={message[0]}>{message[1]}</li>
          </ul>
        )}
      </div>
      <div className="sr-only" role="status">
        {announcement}
      </div>
    </div>
  );
}
