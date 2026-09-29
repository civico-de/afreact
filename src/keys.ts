import type { KeyboardEvent } from "react";

/** Enter and Space trigger `action`, as on a button: for elements that carry role="button". */
export function onButtonKey(action: (event: KeyboardEvent) => void) {
  return (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    action(event);
  };
}
