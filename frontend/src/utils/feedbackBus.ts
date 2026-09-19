import type { ApiErrorInfo } from "./apiError";

export interface FeedbackMessage {
  id: number;
  severity: "error" | "warning" | "info" | "success";
  title: string;
  reasons: string[];
  advice?: string;
  reference?: string;
  technical?: string;
}

type Listener = (message: FeedbackMessage) => void;

let nextId = 1;
const listeners = new Set<Listener>();
const recent = new Map<string, number>();

/** Canal entre le code hors React (le client HTTP) et l'affichage des messages :
 * l'intercepteur d'axios n'a pas accès aux hooks, il publie ici. */
export const feedbackBus = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  publish(message: Omit<FeedbackMessage, "id">) {
    // Une même erreur qui se répète en rafale (dix requêtes qui échouent
    // ensemble faute de réseau) ne doit s'afficher qu'une fois.
    const key = `${message.severity}|${message.title}|${message.reasons.join("|")}`;
    const now = Date.now();
    if (now - (recent.get(key) ?? 0) < 4000) return;
    recent.set(key, now);
    const full = { ...message, id: nextId++ };
    listeners.forEach((listener) => listener(full));
  },
  publishApiError(info: ApiErrorInfo) {
    feedbackBus.publish({
      severity: info.kind === "throttled" || info.kind === "validation" || info.kind === "conflict" ? "warning" : "error",
      title: info.title,
      reasons: info.reasons,
      advice: info.advice,
      reference: info.reference,
      technical: info.technical,
    });
  },
};
