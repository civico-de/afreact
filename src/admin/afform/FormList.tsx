import { AfreactForm } from "../../afform/AfreactForm";

/** afAdminList.html: FormBuilder's listing, itself the Afform afAdminFormList. */
export function FormList() {
  return (
    <div className="afadmin-list">
      <h1>{ts("FormBuilder")}</h1>
      <AfreactForm name="afAdminFormList" />
    </div>
  );
}
