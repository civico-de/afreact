import { useContext, useEffect, useRef, useState } from "react";
import { FormContext } from "./Layout";
import { captchaSiteKey, RECAPTCHA_OUTSIDE_FORM_NOTE, RECAPTCHA_WITHOUT_KEY_NOTE } from "./support";
import type { ElementNode } from "./types";
import { Unsupported } from "./Unsupported";

/** The part of Google's reCAPTCHA v2 API the element uses. */
interface Grecaptcha {
  ready: (callback: () => void) => void;
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme: string;
      callback: (response: string) => void;
      "expired-callback": () => void;
    },
  ) => number;
  reset: (widget: number) => void;
}

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
  }
}

export const RECAPTCHA_API = "https://www.google.com/recaptcha/api.js?render=explicit";

let loading: Promise<Grecaptcha> | null = null;

/** Google's script, once per page and not where the page has it; React renders the widget itself. */
function loadRecaptcha(): Promise<Grecaptcha> {
  const present = window.grecaptcha;
  if (present)
    return new Promise((resolve) => {
      present.ready(() => {
        resolve(present);
      });
    });
  loading ??= new Promise<Grecaptcha>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = RECAPTCHA_API;
    script.async = true;
    script.addEventListener("load", () => {
      const api = window.grecaptcha;
      if (api)
        api.ready(() => {
          resolve(api);
        });
      else {
        loading = null;
        reject(new Error(ts("Could not load %1.", { 1: RECAPTCHA_API })));
      }
    });
    script.addEventListener("error", () => {
      loading = null;
      reject(new Error(ts("Could not load %1.", { 1: RECAPTCHA_API })));
    });
    document.head.append(script);
  });
  return loading;
}

/**
 * crm-recaptcha2: Google's checkbox, whose response goes with the submission (AfreactForm's submit()).
 * After a failed submission the used response is void, so the checkbox starts over.
 */
export function Recaptcha2({ node }: { node: ElementNode }) {
  const recaptcha = useContext(FormContext)?.recaptcha;
  if (!recaptcha) return <Unsupported what={RECAPTCHA_OUTSIDE_FORM_NOTE} />;
  const sitekey = captchaSiteKey(node);
  // deviation:captcha-without-key-noted
  if (!sitekey) return <Unsupported what={RECAPTCHA_WITHOUT_KEY_NOTE} />;
  return (
    <Widget
      respond={recaptcha.respond}
      failures={recaptcha.failures}
      sitekey={sitekey}
      theme={
        typeof node.recaptchatheme === "string" && node.recaptchatheme
          ? node.recaptchatheme
          : "light"
      }
    />
  );
}

interface WidgetProps {
  respond: (response: string | null) => void;
  failures: number;
  sitekey: string;
  theme: string;
}

function Widget({ respond, failures, sitekey, theme }: WidgetProps) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<{ api: Grecaptcha; id: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadRecaptcha().then(
      (api) => {
        if (!live || !box.current) return;
        const id = api.render(box.current, {
          sitekey,
          theme,
          callback: respond,
          "expired-callback": () => {
            respond(null);
          },
        });
        widget.current = { api, id };
      },
      (failure: unknown) => {
        if (live) setError(failure instanceof Error ? failure.message : String(failure));
      },
    );
    return () => {
      live = false;
      widget.current = null;
      respond(null);
    };
  }, [respond, sitekey, theme]);

  useEffect(() => {
    // deviation:recaptcha-response-once
    if (failures && widget.current) {
      widget.current.api.reset(widget.current.id);
      respond(null);
    }
  }, [failures, respond]);

  return (
    <div className="crm-recaptcha2">
      {error && (
        <p className="alert alert-danger" role="alert">
          {error}
        </p>
      )}
      <div ref={box} />
    </div>
  );
}
