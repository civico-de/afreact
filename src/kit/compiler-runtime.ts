// @types/react leaves the runtime's one export out on purpose; consumers' compiled code calls it.
declare module "react/compiler-runtime" {
  export function c(size: number): unknown[];
}

export { c } from "react/compiler-runtime";
