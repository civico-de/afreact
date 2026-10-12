import { useEffect, useRef, type RefObject } from "react";
import { replacePageTitle } from "../afform/pageTitle";

/** The page's own heading, by the places replacePageTitle() writes, in that order. */
const HEADINGS = [".crm-page-title-wrapper>h1", "h1.crm-page-title", "h1:not(.crm-container h1)"];

const pageHeading = () =>
  HEADINGS.map((selector) => document.querySelector(selector)).find((found) => found !== null);

/** Shows `heading` as the page's title while set and gives the page its own back when it is not. */
export function usePageHeading(host: RefObject<Element | null>, heading: string | undefined) {
  const shown = useRef<{ element: Element; original: string; current: string } | null>(null);
  useEffect(() => {
    const element = host.current;
    const state = shown.current;
    if (!heading || !element) {
      if (state) replacePageTitle(state.element, state.current, state.original);
      shown.current = null;
      return;
    }
    const original = state?.original ?? pageHeading()?.textContent.trim() ?? "";
    replacePageTitle(element, state?.current ?? original, heading);
    shown.current = { element, original, current: heading };
  }, [host, heading]);
  useEffect(
    () => () => {
      const state = shown.current;
      if (state) replacePageTitle(state.element, state.current, state.original);
      shown.current = null;
    },
    [],
  );
}
