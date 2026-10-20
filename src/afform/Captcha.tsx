import { useContext, useEffect, useRef, useState } from "react";
import { FormContext } from "./Layout";
import { CAPTCHA_NOTES, captchaSiteKey, type CaptchaNotes } from "./support";
import type { ElementNode } from "./types";
import { Unsupported } from "./Unsupported";

interface WidgetOptions {
  sitekey: string;
  theme: string;
  callback: (response: string) => void;
  "expired-callback": () => void;
}

/** What the elements use of Google's reCAPTCHA v2 API and Cloudflare's Turnstile API, which match. */
interface CaptchaApi<Id> {
  render: (container: HTMLElement, options: WidgetOptions) => Id;
  reset: (widget: Id) => void;
}

interface Grecaptcha extends CaptchaApi<number> {
  ready: (callback: () => void) => void;
}

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
    turnstile?: CaptchaApi<string>;
  }
}

const RECAPTCHA_API = "https://www.google.com/recaptcha/api.js?render=explicit";
const TURNSTILE_API = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Renders a widget into its box and returns what resets it. */
type RenderWidget = (box: HTMLElement, options: WidgetOptions) => () => void;

function renderer<Id>(api: CaptchaApi<Id>): RenderWidget {
  return (box, options) => {
    const id = api.render(box, options);
    return () => {
      api.reset(id);
    };
  };
}

/** A provider's script, once per page and not where the page has it; React renders the widget itself. */
function scriptLoader<Api>(
  src: string,
  current: () => Api | undefined,
  ready: (api: Api) => Promise<Api>,
): () => Promise<Api> {
  let loading: Promise<Api> | null = null;
  return () => {
    const present = current();
    if (present) return ready(present);
    loading ??= new Promise<Api>((resolve, reject) => {
      const fail = () => {
        loading = null;
        reject(new Error(ts("Could not load %1.", { 1: src })));
      };
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.addEventListener("load", () => {
        const api = current();
        if (api) resolve(ready(api));
        else fail();
      });
      script.addEventListener("error", fail);
      document.head.append(script);
    });
    return loading;
  };
}

const loadRecaptcha = scriptLoader(
  RECAPTCHA_API,
  () => window.grecaptcha,
  (api) =>
    new Promise((resolve) => {
      api.ready(() => {
        resolve(api);
      });
    }),
);
// Turnstile's explicit mode renders as soon as its script ran.
const loadTurnstile = scriptLoader(
  TURNSTILE_API,
  () => window.turnstile,
  (api) => Promise.resolve(api),
);

const recaptchaWidget = () => loadRecaptcha().then(renderer);
const turnstileWidget = () => loadTurnstile().then(renderer);

/** crm-recaptcha2: Google's checkbox. */
export function Recaptcha2({ node }: { node: ElementNode }) {
  return <Captcha node={node} notes={CAPTCHA_NOTES.recaptcha} load={recaptchaWidget} />;
}

/** crm-turnstile: Cloudflare's checkbox, from formprotection. */
export function Turnstile({ node }: { node: ElementNode }) {
  return <Captcha node={node} notes={CAPTCHA_NOTES.turnstile} load={turnstileWidget} />;
}

/**
 * A captcha widget, whose response goes with the submission (AfreactForm's submit()).
 * After a failed submission the used response is void, so the widget starts over.
 */
function Captcha({
  node,
  notes,
  load,
}: {
  node: ElementNode;
  notes: CaptchaNotes;
  load: () => Promise<RenderWidget>;
}) {
  const captcha = useContext(FormContext)?.captcha;
  if (!captcha) return <Unsupported what={notes.outside} />;
  const sitekey = captchaSiteKey(node);
  // deviation:captcha-without-key-noted
  if (!sitekey) return <Unsupported what={notes.keyless} />;
  return (
    <Widget
      className={node["#tag"]}
      load={load}
      respond={captcha.respond}
      failures={captcha.failures}
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
  className: string;
  load: () => Promise<RenderWidget>;
  respond: (response: string | null) => void;
  failures: number;
  sitekey: string;
  theme: string;
}

function Widget({ className, load, respond, failures, sitekey, theme }: WidgetProps) {
  const box = useRef<HTMLDivElement>(null);
  const reset = useRef<(() => void) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    load().then(
      (render) => {
        if (!live || !box.current) return;
        reset.current = render(box.current, {
          sitekey,
          theme,
          callback: respond,
          "expired-callback": () => {
            respond(null);
          },
        });
      },
      (failure: unknown) => {
        if (live) setError(failure instanceof Error ? failure.message : String(failure));
      },
    );
    return () => {
      live = false;
      reset.current = null;
      respond(null);
    };
  }, [load, respond, sitekey, theme]);

  useEffect(() => {
    // deviation:recaptcha-response-once
    if (failures && reset.current) {
      reset.current();
      respond(null);
    }
  }, [failures, respond]);

  return (
    <div className={className}>
      {error && (
        <p className="alert alert-danger" role="alert">
          {error}
        </p>
      )}
      <div ref={box} />
    </div>
  );
}
