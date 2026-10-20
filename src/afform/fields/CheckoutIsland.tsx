import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  angularOf,
  asError,
  bootstrapIsland,
  call,
  destroyIsland,
  islandModule,
  loadAngular,
} from "../../angular/island";
import { useDebugFacts } from "../../debug/debug";
import { FormContext, type FormState } from "../Layout";
import type { Values } from "../types";
import {
  contributionValue,
  type CheckoutIslands,
  type CheckoutOption,
  type CheckoutSettings,
} from "./CheckoutBlock";

interface CheckoutIslandProps {
  optionKey: string;
  template: string;
  settings: CheckoutSettings;
  islands: CheckoutIslands;
  /** The details as React holds them, which the option's own fields change too. */
  params: Values;
  /** The contribution's record on the form, and its af-entity's fixed data. */
  values: Values;
  entityData: Values | undefined;
  onChange: (params: Values) => void;
  disabled: boolean;
  /** Told when the island starts loading, is up, or failed. */
  onPhase: (phase: "loading" | "ready" | "failed") => void;
}

const isRecord = (value: unknown): value is Values =>
  typeof value === "object" && value !== null && !Array.isArray(value);

interface Live {
  props: CheckoutIslandProps;
  form: FormState | null;
}

/** afForm's controller as far as checkout templates use it: the submit and the form's validity. */
function formController(live: { current: Live }) {
  const form = () => {
    const island = live.current.form?.island?.current;
    if (!island) throw new Error("The checkout block is not in a form.");
    return island;
  };
  return {
    submit: () => {
      form().submit();
    },
    ngForm: {
      get $valid() {
        return form().valid();
      },
      get $invalid() {
        return !form().valid();
      },
    },
  };
}

/** afCheckoutBlock's controller as an option's template reads it, live from React. */
function blockController(
  live: { current: Live },
  form: ReturnType<typeof formController>,
  exported: (json: string) => void,
) {
  const params: Values = {};
  const block = {
    checkout_params: params,
    /** The afForm controller afCheckoutBlock requires into itself. */
    afForm: form,
    getContributionValue: (key: string): unknown => {
      const { values, entityData } = live.current.props;
      return contributionValue(key, values, entityData);
    },
    getCheckoutOptionKey: () => block.getContributionValue("checkout_option"),
    getCheckoutOption: (): CheckoutOption => {
      const key = block.getCheckoutOptionKey();
      const options = live.current.props.settings.checkoutOptions;
      return (typeof key === "string" ? options[key] : undefined) ?? {};
    },
    getCheckoutIsTestMode: () => live.current.props.settings.testMode,
    getCheckoutOptionLabel: () => block.getCheckoutOption().label ?? null,
    getCheckoutOptionDescription: () => block.getCheckoutOption().description ?? null,
    getCheckoutOptionTemplate: () => block.getCheckoutOption().template ?? null,
    getCheckoutOptionFields: () => block.getCheckoutOption().fields ?? null,
    /** Hands the details to the form at once, as a processor does right before afForm.submit(). */
    exportParamValues: () => {
      if (!block.getCheckoutOptionKey()) return;
      exported(String(call(angularOf(), "toJson", block.checkout_params)));
    },
  };
  return block;
}

/**
 * Tells the form's submit check about Angular's own validators (ng-pattern, a select's unknown
 * option), which the browser's constraint validation does not see.
 */
function modelValidity(ng: unknown, module: string) {
  const link = (scope: unknown, element: unknown, _attrs: unknown, model: unknown) => {
    const control: unknown = Reflect.get(Object(element), 0);
    if (!(control instanceof HTMLElement) || !("setCustomValidity" in control)) return;
    const reason = () => {
      if (Reflect.get(Object(model), "$invalid") !== true) return "";
      const error: unknown = Reflect.get(Object(model), "$error");
      return Reflect.get(Object(error), "required") === true
        ? ts("This field is required.")
        : ts("Please enter a valid value.");
    };
    call(scope, "$watch", reason, (message: string) => {
      call(control, "setCustomValidity", message);
    });
  };
  call(call(ng, "module", module), "directive", "ngModel", () => ({
    restrict: "A",
    require: "ngModel",
    link,
  }));
}

/**
 * A checkout option's Angular template, booted on its own element with stand-ins for the
 * controllers it requires; a change of option mounts a fresh island with empty details.
 */
export default function CheckoutIsland(props: CheckoutIslandProps) {
  const { optionKey, template, islands } = props;
  const { label, module } = islands.options[optionKey] ?? { label: optionKey, module: null };
  useDebugFacts({ [ts("Angular islands")]: [module ? `${template} (${module})` : template] });
  const host = useRef<HTMLFieldSetElement>(null);
  const [state, setState] = useState<"loading" | "ready" | Error>("loading");
  const form = useContext(FormContext);
  const live = useRef<Live>({ props, form });
  const rootScope = useRef<unknown>(null);
  const receive = useRef<((params: Values) => void) | null>(null);

  useLayoutEffect(() => {
    live.current = { props, form };
  });

  const { onPhase } = props;
  useLayoutEffect(() => {
    onPhase(state === "loading" || state === "ready" ? state : "failed");
  }, [onPhase, state]);

  // Runs before the setup below, so a fresh island skips the details of the option before it.
  useLayoutEffect(() => {
    receive.current?.(props.params);
  });

  // Teardown runs before React removes the form, so a template's $onDestroy still finds af-form.
  useLayoutEffect(() => {
    const parent = host.current;
    if (!parent) throw new Error("The island's host element is not mounted.");
    const root = document.createElement("div");
    parent.replaceChildren(root);
    let disposed = false;
    let ng: unknown;
    // The details as last handed to React, so a digest that changed nothing sends nothing.
    let forwarded = "{}";
    const forward = (json: string) => {
      if (json === forwarded) return;
      forwarded = json;
      const params: unknown = JSON.parse(json);
      live.current.props.onChange(isRecord(params) ? params : {});
    };
    const afForm = formController(live);
    const block = blockController(live, afForm, (json) => {
      flushSync(() => {
        forwarded = "";
        forward(json);
      });
    });
    // React's changes go into the template's object in place, as core's fields share it.
    receive.current = (params) => {
      const json = JSON.stringify(params);
      if (json === forwarded) return;
      forwarded = json;
      const own = block.checkout_params;
      for (const key of Object.keys(own)) Reflect.deleteProperty(own, key);
      Object.assign(own, JSON.parse(json));
    };
    const settle = (next: "ready" | Error) => {
      if (!disposed) setState(next);
    };
    const fail = (error: unknown) => {
      settle(asError(error));
    };
    loadAngular(islands.assets)
      .then(() => {
        if (disposed) return;
        ng = angularOf();
        call(
          call(call(ng, "element", root), "data", "$afCheckoutBlockController", block),
          "data",
          "$afFormController",
          afForm,
        );
        // A dotted name no extension module takes, as redefining a module replaces it.
        const name = islandModule(ng, "afreact.checkoutHost", islands.modules);
        modelValidity(ng, name);
        const bundleUrl = islands.assets.settings.angular.bundleUrl;
        const injector = bootstrapIsland(ng, root, name, bundleUrl);
        rootScope.current = call(injector, "get", "$rootScope");
        const scope = call(rootScope.current, "$new");
        // What afCheckoutBlock's template gives the partial it includes.
        Object.assign(Object(scope), {
          $ctrl: block,
          ts: call(window.CRM, "ts", "civi_contribute"),
          template,
        });
        call(scope, "$on", "$includeContentLoaded", () => {
          settle("ready");
        });
        call(scope, "$on", "$includeContentError", () => {
          fail(new Error(`The template ${template} did not load.`));
        });
        const include = document.createElement("div");
        include.setAttribute("ng-include", "template");
        root.append(include);
        call(call(call(injector, "get", "$compile"), "call", null, include), "call", null, scope);
        const params = () => block.checkout_params;
        call(
          scope,
          "$watch",
          params,
          (value: unknown) => {
            forward(String(call(ng, "toJson", value)));
          },
          true,
        );
        call(scope, "$apply");
      })
      .catch(fail);
    return () => {
      disposed = true;
      receive.current = null;
      if (ng === undefined) root.remove();
      else destroyIsland(ng, rootScope.current, root);
      rootScope.current = null;
    };
  }, [islands, template]);

  // A React change, such as the amount or another field's validity, reaches the template.
  useEffect(() => {
    if (rootScope.current) call(rootScope.current, "$applyAsync");
  });

  return (
    <>
      {state === "loading" && <p role="status">{ts("Loading…")}</p>}
      {state instanceof Error && (
        <p className="crm-error" role="alert">
          {ts("%1 could not load: %2", { 1: label, 2: state.message })}
        </p>
      )}
      {/* deviation:closed-form-locked */}
      {/* The fieldset disables every control the template renders, as React's own checkout fields. */}
      <fieldset
        ref={host}
        className="afreact-checkout-island"
        disabled={props.disabled}
        role="none"
      />
    </>
  );
}
