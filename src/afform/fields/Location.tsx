import { useState } from "react";

interface LocationProps {
  id: string;
  labelId: string;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
  describedBy: string | undefined;
  required: boolean;
}

/** The value of the Address proximity filter (AddressGetSpecProvider). */
interface LocationValue {
  distance: number | null;
  distance_unit: string;
  address: string;
}

function isLocation(value: unknown): value is LocationValue {
  return typeof value === "object" && value !== null && "address" in value;
}

/**
 * afLocationInput: distance, unit and address, written to the model once all three are set and
 * null before. The address counts on leaving its input, as in core.
 * deviation:location-inputs-labelled
 */
export function Location({
  id,
  labelId,
  value,
  onChange,
  disabled,
  describedBy,
  required,
}: LocationProps) {
  const unit = window.CRM.vars?.afreact?.distanceUnit;
  const [values, setValues] = useState<LocationValue>(() =>
    isLocation(value) ? value : { distance: null, distance_unit: unit ?? "", address: "" },
  );
  const [address, setAddress] = useState(values.address);
  const [shown, setShown] = useState(value);
  // A value set from outside replaces what is shown; an emptied one keeps it, as $render does.
  if (shown !== value) {
    setShown(value);
    if (isLocation(value)) {
      setValues(value);
      setAddress(value.address);
    }
  }
  if (!unit) {
    return (
      <span className="crm-error" role="alert">
        {ts("The page provides no default distance unit.")}
      </span>
    );
  }
  const update = (change: Partial<LocationValue>) => {
    const next = { ...values, ...change };
    setValues(next);
    const complete = next.address && next.distance_unit && next.distance !== null;
    onChange(complete ? next : null);
  };
  return (
    <div className="form-inline" role="group" aria-labelledby={labelId}>
      <input
        id={id}
        className="form-control"
        type="number"
        placeholder={ts("Distance")}
        aria-label={ts("Distance")}
        aria-describedby={describedBy}
        disabled={disabled}
        // deviation:required-rich-text-location
        required={required}
        value={values.distance ?? ""}
        onChange={(event) => {
          update({ distance: event.target.value === "" ? null : Number(event.target.value) });
        }}
      />{" "}
      <select
        className="form-control crm-auto-width"
        aria-label={ts("Distance unit")}
        disabled={disabled}
        value={values.distance_unit}
        onChange={(event) => {
          update({ distance_unit: event.target.value });
        }}
      >
        <option value="km">{ts("Km")}</option>
        <option value="miles">{ts("Miles")}</option>
      </select>{" "}
      <input
        className="form-control"
        placeholder={ts("Street, City, State, Country")}
        aria-label={ts("Address")}
        disabled={disabled}
        required={required}
        value={address}
        onChange={(event) => {
          setAddress(event.target.value);
        }}
        onBlur={() => {
          if (address !== values.address) update({ address });
        }}
      />
    </div>
  );
}
