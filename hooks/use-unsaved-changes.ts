"use client";
import { useEffect, useId } from "react";
import { useUnsavedChangesContext } from "./unsaved-changes-context";

/**
 * Guards against losing unsaved form edits. While `dirty` is true:
 *  - a `beforeunload` handler prompts the browser's native "leave site?" dialog
 *    on tab close / refresh,
 *  - the editor is registered with the shell-level UnsavedChangesProvider so
 *    in-app navigation it can't otherwise intercept (sidebar links, logo, sign
 *    out, the Homepage hub's tab switch) prompts before discarding, and
 *  - `confirmDiscard()` asks for confirmation before an explicit in-app action
 *    (a Cancel / Back button or any direct `router.push`): wrap the handler as
 *    `if (confirmDiscard()) router.push(...)`.
 *
 * Returns `{ confirmDiscard }`, a no-op (returns true) when not dirty.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const ctx = useUnsavedChangesContext();
  const id = useId();

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Mirror dirty state into the shell-level registry so the sidebar/tab guards
  // can prompt before navigating away. Unregister on unmount or when clean.
  useEffect(() => {
    ctx?.register(id, dirty);
    return () => ctx?.unregister(id);
  }, [ctx, id, dirty]);

  const confirmDiscard = (): boolean =>
    !dirty ||
    window.confirm("You have unsaved changes. Discard them and leave this page?");

  return { confirmDiscard };
}
