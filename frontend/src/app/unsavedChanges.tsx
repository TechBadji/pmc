import { createContext, useContext, useEffect, useRef } from "react";

/** Garde "modifications non enregistrées".
 *
 * React Router n'est monté ici qu'en `BrowserRouter` (et non en data router) :
 * `useBlocker` n'est donc pas disponible. La navigation interne passe toute par
 * les entrées de menu d'AppLayout, qui interrogent cette garde avant de laisser
 * partir — la page en cours d'édition se contente de s'y déclarer. */
export interface UnsavedGuard {
  dirty: boolean;
  save?: () => Promise<void>;
}

interface UnsavedChangesContextValue {
  register: (guard: UnsavedGuard | null) => void;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

export const UnsavedChangesProvider = UnsavedChangesContext.Provider;

/** Déclare l'état d'édition de la page courante, et prévient aussi lors d'une
 * fermeture d'onglet ou d'un rechargement (que l'application ne contrôle pas). */
export function useUnsavedChanges(dirty: boolean, save?: () => Promise<void>) {
  const ctx = useContext(UnsavedChangesContext);
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    ctx?.register({ dirty, save: () => saveRef.current?.() ?? Promise.resolve() });
    return () => ctx?.register(null);
  }, [ctx, dirty]);

  useEffect(() => {
    if (!dirty) return;
    function warn(e: BeforeUnloadEvent) {
      // Le texte est imposé par le navigateur : seul `preventDefault` compte.
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}
