"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from "react";

/**
 * Shell-level registry of editors with unsaved changes. Editors register their
 * dirty state (via useUnsavedChangesGuard); the admin shell consults
 * confirmNavigation() before in-app navigation the App Router can't otherwise
 * intercept — sidebar <Link> clicks, the logo, "Back to site", sign-out, and the
 * Homepage hub's tab switch. This closes the gap where those paths would silently
 * discard unsaved edits (beforeunload only covers hard tab close / refresh).
 *
 * Backed by a ref (not state) so registering/clearing dirty never re-renders the
 * whole admin — the value is only read at navigation time.
 */
type UnsavedChangesContextValue = {
  register: (id: string, dirty: boolean) => void;
  unregister: (id: string) => void;
  isDirty: () => boolean;
  /** Returns true if it's safe to navigate (nothing dirty, or the user confirms). */
  confirmNavigation: () => boolean;
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(
  null
);

export function UnsavedChangesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const dirtyIds = useRef<Set<string>>(new Set());

  const register = useCallback((id: string, dirty: boolean) => {
    if (dirty) dirtyIds.current.add(id);
    else dirtyIds.current.delete(id);
  }, []);

  const unregister = useCallback((id: string) => {
    dirtyIds.current.delete(id);
  }, []);

  const isDirty = useCallback(() => dirtyIds.current.size > 0, []);

  const confirmNavigation = useCallback(() => {
    if (dirtyIds.current.size === 0) return true;
    return window.confirm(
      "You have unsaved changes. Discard them and leave this page?"
    );
  }, []);

  const value = useMemo(
    () => ({ register, unregister, isDirty, confirmNavigation }),
    [register, unregister, isDirty, confirmNavigation]
  );

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
    </UnsavedChangesContext.Provider>
  );
}

/** Null when rendered outside the provider (callers degrade gracefully). */
export function useUnsavedChangesContext(): UnsavedChangesContextValue | null {
  return useContext(UnsavedChangesContext);
}
