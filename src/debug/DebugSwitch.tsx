import { useId, useState } from "react";
import { debugSwitchedOn, switchDebug } from "./debug";

/** The viewer's switch for the debug button on afreact's forms and builders, in this browser. */
export function DebugSwitch() {
  const id = useId();
  const [on, setOn] = useState(debugSwitchedOn);
  const [kept, setKept] = useState(true);
  return (
    <fieldset className="afreact-debug-switch">
      <legend>{ts("Debug mode")}</legend>
      <input
        id={id}
        type="checkbox"
        checked={on}
        onChange={(event) => {
          setKept(switchDebug(event.target.checked));
          setOn(debugSwitchedOn());
        }}
      />{" "}
      <label htmlFor={id}>
        {ts("Show a debug button on the forms and builders React renders, in this browser")}
      </label>
      <p role="status">
        {kept ? "" : ts("This browser does not keep the setting, so debug mode stays off here.")}
      </p>
    </fieldset>
  );
}
