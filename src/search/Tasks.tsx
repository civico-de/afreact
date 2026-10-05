import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { api4, errorMessage } from "../api/civi";
import { Icon } from "./LinkContent";
import { onLinkClick } from "./links";
import { Menu } from "./Menu";
import {
  isSelected,
  NO_SELECTION,
  resultCount,
  selectPage,
  selectionState,
  toggleRow,
  type Selection,
} from "./selection";
import {
  actionTitle,
  allows,
  batchCall,
  batches,
  evaluateTaskExpression,
  inlineEditCall,
  parseTaskList,
  referencedTasks,
  taskData,
  taskRun,
  unsupportedTaskNotes,
  type ApiBatch,
  type Key,
  type SearchTask,
  type TaskList,
} from "./searchTasks";
import type { DisplaySettings, Link, Row, RunPage } from "./types";

interface TasksOptions {
  search: string;
  display: string;
  settings: DisplaySettings;
  /** The page on screen; undefined while a run loads. */
  page: RunPage | undefined;
  loading: boolean;
  rowCount: number | null;
  pageNumber: number;
  /** SearchDisplay.run parameters without `return`, as getApiParams() builds them. */
  runParams: Record<string, unknown>;
  /** The filters the selection belongs to; new filters drop it (onChangeFilters). */
  filtersKey: string;
  root: HTMLElement | null;
}

/** What Body needs for the checkbox of each row. */
export interface RowSelect {
  isSelected: (row: Row) => boolean;
  toggle: (row: Row, shift: boolean) => void;
  disabled: boolean;
  label: (row: Row) => string;
}

interface Running {
  task: SearchTask;
  apiBatch: ApiBatch;
  ids: Key[];
  isLink: boolean;
  returnTo: HTMLElement | null;
}

const TASKS = "getSearchTasks";

/**
 * Bulk actions of a table display (searchDisplayTasksTrait, crmSearchTasksMenu): the selection,
 * the actions menu or buttons, row task links, and the runs of the tasks.
 */
export function useTasks(options: TasksOptions) {
  const {
    search,
    display,
    settings,
    page,
    loading,
    rowCount,
    pageNumber,
    runParams,
    filtersKey,
    root,
  } = options;
  const client = useQueryClient();
  const actions = !!settings.actions;
  const buttons = settings.actions_display_mode === "buttons";
  const hasTaskLinks = !!page?.rows.some((row) =>
    row.columns.some((cell) => cell?.links?.some((link) => link.task)),
  );
  // Core loads the tasks when they show (buttons), on the first selection or opened menu, and
  // when rows link to a task.
  const [requested, setRequested] = useState(false);
  const queryKey = ["SearchDisplay", TASKS, search, display];
  const loadTasks = async (): Promise<TaskList> =>
    parseTaskList(await api4("SearchDisplay", TASKS, { savedSearch: search, display }));
  const list = useQuery({
    queryKey,
    queryFn: loadTasks,
    enabled: (actions && (buttons || requested)) || hasTaskLinks,
  });

  const [chosen, setChosen] = useState({ key: filtersKey, selection: NO_SELECTION });
  const selection = chosen.key === filtersKey ? chosen.selection : NO_SELECTION;
  const [loadingAll, setLoadingAll] = useState(false);
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState<Running | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const select = (next: Selection) => {
    setChosen({ key: filtersKey, selection: next });
    setMessage(
      rowCount === null
        ? ts("%1 selected", { 1: next.keys.length })
        : resultCount(rowCount, next.keys.length),
    );
    if (next.keys.length) setRequested(true);
  };
  const pageKeys = page?.rows.map((row) => row.key) ?? [];
  const ready = !loading && !!page?.rows.length;

  const selectAllPages = async () => {
    setLoadingAll(true);
    try {
      const ids = await api4<Key>("SearchDisplay", "run", { ...runParams, return: "id" });
      select({ keys: [...new Set(ids)], all: true });
    } catch (error) {
      setFailure(error);
    } finally {
      setLoadingAll(false);
    }
  };
  const toggleAll = () => {
    if (selection.keys.length) select(NO_SELECTION);
    else if (pageNumber === 1 && rowCount === pageKeys.length)
      select(selectPage(pageKeys, rowCount));
    else void selectAllPages();
  };

  /** refreshAfterTask(): selection cleared, this and every display of the form reloaded. */
  const refreshAfterTask = () => {
    setChosen({ key: filtersKey, selection: NO_SELECTION });
    if (root) window.CRM.$(root).trigger("crmPopupFormSuccess");
  };

  const notSupported = (what: string) => {
    const text = ts("Not supported by the React renderer: %1", { 1: what });
    window.CRM.alert(text, ts("Error"), "error");
    setMessage(text);
  };

  /** doTask(): a popup form, a new window, or the API batch dialog. */
  const doTask = (task: SearchTask, ids: Key[], isLink: boolean, returnTo: HTMLElement | null) => {
    const tasks = list.data ?? client.getQueryData<TaskList>(queryKey) ?? null;
    const run = taskRun(task);
    if (run.kind === "unsupported") {
      notSupported(`task ${task.name} (${run.reason})`);
      return;
    }
    if (run.kind === "batch") {
      setRunning({ task, apiBatch: run.apiBatch, ids, isLink, returnTo });
      return;
    }
    const data = taskData(task, ids, tasks, { search, display }, isLink);
    const path = String(evaluateTaskExpression(run.target.path, data));
    const query = run.target.query ? evaluateTaskExpression(run.target.query, data) : undefined;
    const post = run.target.data ? evaluateTaskExpression(run.target.data, data) : undefined;
    const mode = run.target.mode ?? "back";
    if (run.kind === "popup") {
      window.CRM.loadForm(window.CRM.url(path, queryOf(query), mode), { post }).on(
        "crmFormSuccess",
        refreshAfterTask,
      );
      return;
    }
    // A window cannot be posted to, so the data goes into the query beside it.
    window.open(window.CRM.url(path, { ...queryOf(query), ...queryOf(post) }, mode), "_blank");
  };

  /** A row's task link (onClickLink): its task on that row, once the tasks are loaded. */
  const onRowLink = (link: Link, key: Key, event: MouseEvent<HTMLAnchorElement>) => {
    onLinkClick(link, event);
    const name = link.task;
    if (!name) return;
    const opener = event.currentTarget;
    client
      .fetchQuery({ queryKey, queryFn: loadTasks })
      .then((tasks) => {
        const task = tasks.tasks.find((candidate) => candidate.name === name);
        if (!task) {
          notSupported(`task ${name} (not offered for this display)`);
          return;
        }
        doTask(task, [key], true, opener);
      })
      .catch(setFailure);
  };

  const tasks = list.data?.tasks;
  const entityInfo = list.data?.entityInfo;
  const count = selection.keys.length;
  const unsupported = new Set(
    (tasks ?? []).filter((task) => taskRun(task).kind === "unsupported").map((task) => task.name),
  );
  const usable = (task: SearchTask) => !unsupported.has(task.name) && !!allows(task.number, count);
  const titleOf = (task: SearchTask) =>
    unsupported.has(task.name)
      ? ts("Not supported by the React renderer: %1", { 1: `task ${task.name}` })
      : entityInfo
        ? actionTitle(task, count, entityInfo)
        : "";
  const runAction = (task: SearchTask, returnTo: HTMLElement | null) => {
    if (usable(task)) doTask(task, selection.keys, false, returnTo);
  };

  const state = selectionState(selection);
  const selectAllMenu = [
    ...(rowCount !== null && rowCount > pageKeys.length
      ? [{ link: { text: ts("All") }, run: () => void selectAllPages() }]
      : []),
    {
      link: {
        text: rowCount !== null && rowCount > pageKeys.length ? ts("This Page") : ts("All"),
      },
      run: () => {
        select(selectPage(pageKeys, rowCount));
      },
    },
    { link: { text: ts("None") }, run: () => select(NO_SELECTION) },
  ];

  /** crmSearchDisplayTaskHeader.html: select all or none, and the menu for all, page or none. */
  const header: ReactNode = actions && (
    <Menu
      buttonClass="btn btn-secondary-outline dropdown-toggle"
      label=""
      srLabel={ts("Select All rows or this pages rows")}
      links={selectAllMenu.map((item) => item.link)}
      alignRight={false}
      disabled={loading || !page?.rows.length}
      onLinkClick={(link) => selectAllMenu.find((item) => item.link === link)?.run()}
      prefix={
        <button
          type="button"
          className="btn btn-secondary-outline"
          role="checkbox"
          aria-checked={state === "all" ? true : state === "some" ? "mixed" : false}
          aria-label={ts("Select all")}
          title={count ? ts("Select none") : ts("Select all")}
          disabled={loading || !page?.rows.length || loadingAll}
          onClick={toggleAll}
        >
          <i
            className={`crm-i ${state === "all" ? "fa-check-square-o" : state === "some" ? "fa-minus-square-o" : "fa-square-o"}`}
            role="img"
            aria-hidden="true"
          />
        </button>
      }
    />
  );

  const taskLinks: Link[] = (tasks ?? []).map((task) => ({
    task: task.name,
    text: task.title,
    icon: task.icon,
    title: titleOf(task),
  }));
  const byName = (link: Link) => tasks?.find((task) => task.name === link.task);

  /** crmSearchTasks-menu.html and crmSearchTasks-buttons.html. */
  const menu: ReactNode =
    actions &&
    (buttons ? (
      <div className="btn-group">
        {(tasks ?? []).map((task) => (
          <button
            key={task.name}
            type="button"
            className={`btn btn-default crm-search-task-button${usable(task) ? "" : " disabled"}`}
            aria-disabled={usable(task) ? undefined : true}
            title={titleOf(task)}
            onClick={(event) => {
              runAction(task, event.currentTarget);
            }}
          >
            <Icon name={task.icon} /> {task.title}
          </button>
        ))}
      </div>
    ) : (
      <Menu
        buttonClass="btn dropdown-toggle btn-default crm-search-task-menu"
        buttonTitle={ts("Perform action on selected items.")}
        label={
          <>
            <Icon name="fa-pencil" /> {ts("Action")}{" "}
          </>
        }
        links={tasks ? taskLinks : [{ icon: "fa-spinner fa-spin", text: ts("Loading…") }]}
        alignRight={false}
        disabled={!ready || loadingAll}
        onOpen={() => {
          setRequested(true);
        }}
        itemClass={(link) => {
          const task = byName(link);
          return task && usable(task) ? undefined : "disabled";
        }}
        isDisabled={(link) => {
          const task = byName(link);
          return !task || !usable(task);
        }}
        onLinkClick={(link, event) => {
          const task = byName(link);
          const group = event.currentTarget.closest(".btn-group");
          if (task) runAction(task, group?.querySelector("button") ?? null);
        }}
      />
    ));

  const rowSelect: RowSelect | undefined = actions
    ? {
        isSelected: (row) => isSelected(selection, row.key),
        toggle: (row, shift) => {
          select(toggleRow(selection, pageKeys, row.key, shift, rowCount));
        },
        disabled: loadingAll,
        label: (row) => ts("Select %1", { 1: rowName(row) }),
      }
    : undefined;

  const referenced = referencedTasks(settings);
  const notes = tasks ? unsupportedTaskNotes(tasks, referenced) : [];

  const dialog: ReactNode = running && entityInfo && (
    <TaskDialog
      running={running}
      entity={entityInfo}
      runParams={runParams}
      onDone={(result) => {
        setRunning(null);
        if (result.ran) refreshAfterTask();
        if (result.message) setMessage(result.message);
        if (running.returnTo?.isConnected) running.returnTo.focus();
      }}
    />
  );

  return {
    /** For the header count and the pager. */
    selected: count,
    header,
    menu,
    rowSelect,
    onRowLink,
    notes,
    error: list.error ?? failure,
    /** The dialog of a running task and the live region for selection and task results. */
    overlay: (
      <>
        {dialog}
        <p role="status" className="sr-only">
          {message}
        </p>
      </>
    ),
  };
}

function queryOf(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

/** The first column's text names a row for its checkbox; its key where the column is empty. */
export function rowName(row: Row): string {
  const value = row.columns[0]?.val;
  const text = Array.isArray(value)
    ? value.join(", ")
    : typeof value === "object"
      ? ""
      : String(value ?? "");
  return text.trim() || String(row.key);
}

interface TaskDialogProps {
  running: Running;
  entity: TaskList["entityInfo"];
  runParams: Record<string, unknown>;
  /** `ran`: some batch may have changed data, so the table reloads. */
  onDone: (result: { ran: boolean; message: string }) => void;
}

/**
 * crmSearchTaskApiBatch.html with crmSearchBatchRunner: the confirmation, then batches of
 * BATCH_SIZE ids with a progress bar, then core's success or error message.
 */
function TaskDialog({ running, entity, runParams, onDone }: TaskDialogProps) {
  const { task, apiBatch, ids, isLink } = running;
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [progress, setProgress] = useState<{ percent: number; first: number; last: number } | null>(
    null,
  );
  const started = useRef(false);
  const entityTitle = (count: number) => (count === 1 ? entity.title : entity.title_plural);
  const message = (text: string | undefined, count: number) =>
    text ? ts(text, { 1: count, 2: entityTitle(count) }) : "";
  // A delete asks first even when a hook removed its question; the text is core's own.
  const confirmMsg =
    apiBatch.confirmMsg ||
    (apiBatch.action === "delete" ? "Are you sure you want to delete %1 %2?" : undefined);

  const start = async () => {
    if (started.current) return;
    started.current = true;
    const inline = isLink && apiBatch.action === "update" && ids.length === 1;
    const ranges = batches(ids);
    let fetched = 0;
    let ran = false;
    try {
      for (const [index, range] of ranges.entries()) {
        setProgress({ percent: Math.floor((100 * index) / ranges.length), ...range });
        const [callEntity, action, params] = inline
          ? inlineEditCall(apiBatch, runParams, ids[0] ?? "")
          : batchCall(apiBatch, entity, ids.slice(range.first, range.last));
        ran = true;
        const result = await api4(callEntity, action, params);
        if (result.countFetched === undefined)
          throw new Error(`${callEntity}.${action} answered without countFetched.`);
        fetched += result.countFetched;
      }
      setProgress({ percent: 100, first: 0, last: ids.length });
      let text: string;
      if (inline) {
        text = ts("Saved");
        window.CRM.status(text);
      } else {
        text = message(apiBatch.successMsg, fetched);
        if (text) window.CRM.alert(text, ts("%1 Complete", { 1: task.title }), "success");
        else text = ts("%1 Complete", { 1: task.title });
      }
      finish({ ran, message: text });
    } catch (error) {
      // Core shows its own message instead of the server's; React shows both.
      const text = [message(apiBatch.errorMsg, ids.length), errorMessage(error)]
        .filter(Boolean)
        .join(" ");
      window.CRM.alert(text, ts("Error"), "error");
      finish({ ran, message: text });
    }
  };

  const finish = (result: { ran: boolean; message: string }) => {
    dialog.current?.close();
    onDone(result);
  };

  // The dialog mounts once per task. Without a question to answer the run starts at once.
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
    if (!confirmMsg) void start();
  });

  return (
    <dialog
      ref={dialog}
      className="crm-search-task-dialog afreact-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape cancels the question, not a run in progress.
        if (started.current) event.preventDefault();
      }}
      onClose={() => {
        if (!started.current) onDone({ ran: false, message: "" });
      }}
    >
      <h2 id={titleId} className="afreact-dialog-title">
        {task.title}
      </h2>
      <div className="afreact-dialog-body">
        <p>{confirmMsg && <strong>{message(confirmMsg, ids.length)}</strong>}</p>
        <hr />
        {progress && (
          <div className="crm-search-task-progress">
            {apiBatch.runMsg && <h5>{message(apiBatch.runMsg, ids.length)}</h5>}
            <div className="progress">
              <div
                className="progress-bar progress-bar-striped active"
                role="progressbar"
                aria-label={task.title}
                aria-valuenow={progress.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                style={{ width: `${String(progress.percent)}%` }}
              >
                <span className="sr-only">{ts("%1% Complete", { 1: progress.percent })}</span>
              </div>
            </div>
            <p className="help-block">
              {ts("Processing records %1 - %2", { 1: 1 + progress.first, 2: progress.last })}
            </p>
          </div>
        )}
      </div>
      <div className="afreact-dialog-buttons">
        <button
          type="button"
          className="btn btn-default"
          disabled={!!progress}
          onClick={() => dialog.current?.close()}
        >
          <Icon name="fa-times" /> {ts("Cancel")}
        </button>
        {confirmMsg && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!!progress}
            onClick={() => void start()}
          >
            <Icon name={progress ? "fa-spin fa-spinner" : "fa-check"} /> {task.title}
          </button>
        )}
      </div>
    </dialog>
  );
}
