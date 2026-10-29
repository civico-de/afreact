import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { Dialog } from "./Dialog";

// deviation:dialog-return-focus
function Harness({ confirm = false, inMenu = false }: { confirm?: boolean; inMenu?: boolean }) {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(true);
  // showModal hides open popovers: the menu, and the item that opened the dialog, go after it opens.
  useEffect(() => {
    if (open) setMenuOpen(false);
  }, [open]);
  const opener = (
    <button
      type="button"
      onClick={() => {
        setOpen(true);
      }}
    >
      Open
    </button>
  );
  const close = () => {
    setOpen(false);
  };
  return (
    <>
      {inMenu && (
        <button type="button" popoverTarget="menu">
          Menu
        </button>
      )}
      {inMenu ? (
        <ul id="menu" popover="auto">
          {menuOpen && <li>{opener}</li>}
        </ul>
      ) : (
        opener
      )}
      {open &&
        (confirm ? (
          <ConfirmDialog title="Sure?" confirmLabel="Delete" onConfirm={close} onCancel={close}>
            Gone for good.
          </ConfirmDialog>
        ) : (
          <Dialog
            title="Edit"
            onClose={close}
            buttons={
              <button type="button" onClick={close}>
                Apply
              </button>
            }
          >
            Body
          </Dialog>
        ))}
    </>
  );
}

describe("dialog focus on close", () => {
  it.each([
    ["Dialog", false, "Cancel"],
    ["Dialog", false, "Apply"],
    ["ConfirmDialog", true, "Cancel"],
    ["ConfirmDialog", true, "Delete"],
  ])("%s returns focus to its opener after %s", async (_name, confirm, action) => {
    const user = userEvent.setup();
    render(<Harness confirm={confirm} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: action }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
  });

  it("focuses the menu's button when the opener left with its menu", async () => {
    const user = userEvent.setup();
    render(<Harness inMenu />);
    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Menu" })).toHaveFocus();
  });
});
