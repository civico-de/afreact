/** A classic script, run in the order of the calls before it: each file may build on those. */
export function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.addEventListener("load", () => {
      resolve();
    });
    script.addEventListener("error", () => {
      reject(new Error(ts("Could not load %1.", { 1: src })));
    });
    document.head.append(script);
  });
}

/** A stylesheet the page does not have yet, under a relative or an absolute URL. */
export function addStylesheet(href: string): void {
  const url = new URL(href, document.baseURI).href;
  const present = [...document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]")];
  if (present.some((link) => link.href === url)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.append(link);
}
