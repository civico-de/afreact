import { useEffect, useEffectEvent, useRef, useState } from "react";
import { errorMessage } from "../../api/civi";
import { adminVars } from "../vars";

interface MonacoEditor {
  getValue: () => string;
  setValue: (value: string) => void;
  updateOptions: (options: Record<string, unknown>) => void;
  onDidChangeModelContent: (listener: () => void) => { dispose: () => void };
  dispose: () => void;
}

interface MonacoApi {
  editor: { create: (element: HTMLElement, options: Record<string, unknown>) => MonacoEditor };
}

type AmdRequire = ((
  modules: string[],
  loaded: () => void,
  failed: (error: unknown) => void,
) => void) & {
  config: (options: { paths: Record<string, string> }) => void;
};

declare global {
  interface Window {
    /** The AMD loader Monaco ships (`vs/loader.js`), as core's crmMonaco module loads it. */
    require?: AmdRequire;
    monaco?: MonacoApi;
  }
}

let loading: Promise<MonacoApi> | null = null;

const loadScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => {
      resolve();
    };
    script.onerror = () => {
      reject(new Error(`Could not load ${src}.`));
    };
    document.head.append(script);
  });

/** crmMonaco: the editor from core's bower_components, loaded once on first use. */
function loadMonaco(): Promise<MonacoApi> {
  loading ??= (async () => {
    const vs = adminVars().monaco?.paths.vs;
    if (!vs) throw new Error("The Monaco editor settings are not loaded.");
    if (!window.require) await loadScript(`${vs}/loader.js`);
    const amd = window.require;
    if (!amd) throw new Error("The Monaco loader did not start.");
    amd.config({ paths: { vs } });
    await new Promise<void>((resolve, reject) => {
      amd(["vs/editor/editor.main"], resolve, reject);
    });
    if (!window.monaco) throw new Error("The Monaco editor did not load.");
    return window.monaco;
  })();
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

/** crm-monaco: HTML in Monaco, 70% of the window high, read-only unless `editable`. */
export function Monaco({
  value,
  editable,
  label,
  onChange,
}: {
  value: string;
  editable: boolean;
  label: string;
  onChange: (value: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<MonacoEditor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = useEffectEvent(() => ({ value, readOnly: !editable }));
  const changed = useEffectEvent((text: string) => {
    onChange(text);
  });

  useEffect(() => {
    let live = true;
    let listener: { dispose: () => void } | null = null;
    loadMonaco().then(
      (monaco) => {
        if (!live || !host.current) return;
        const created = monaco.editor.create(host.current, {
          ...current(),
          language: "html",
          theme: "vs",
          ariaLabel: label,
          minimap: { enabled: false },
          automaticLayout: true,
        });
        listener = created.onDidChangeModelContent(() => {
          changed(created.getValue());
        });
        editor.current = created;
      },
      (failure: unknown) => {
        if (live) setError(errorMessage(failure));
      },
    );
    return () => {
      live = false;
      listener?.dispose();
      editor.current?.dispose();
      editor.current = null;
    };
  }, [label]);

  useEffect(() => {
    if (editor.current && editor.current.getValue() !== value) editor.current.setValue(value);
  }, [value]);

  useEffect(() => {
    editor.current?.updateOptions({ readOnly: !editable });
  }, [editable]);

  if (error)
    return (
      <p className="crm-error" role="alert">
        {error}
      </p>
    );
  return (
    <div
      ref={host}
      className="crm-monaco-container"
      style={{ height: Math.round(0.7 * window.innerHeight) }}
    />
  );
}
