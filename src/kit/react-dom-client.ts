// @types/react-dom leaves out the client build's version.
declare module "react-dom/client" {
  export const version: string;
}

export { createRoot, hydrateRoot, version } from "react-dom/client";
