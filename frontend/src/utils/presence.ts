import { apiClient } from "@/api/client";

const INSTANCE_KEY = "idpmc_instance";
/** Rythme du signal de présence : le serveur tient une instance pour fermée après trois minutes de silence. */
export const PRESENCE_PING_MS = 60_000;

/** Identifiant de cet onglet : tiré au hasard à sa première ouverture, gardé
 * le temps de l'onglet (un rechargement ne compte pas pour une nouvelle instance). */
export function presenceInstance(): string {
  try {
    let id = sessionStorage.getItem(INSTANCE_KEY);
    if (!id) {
      const bytes = crypto.getRandomValues(new Uint8Array(12));
      id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      sessionStorage.setItem(INSTANCE_KEY, id);
    }
    return id;
  } catch {
    return "instance-sans-stockage";
  }
}

/** Signale que cet onglet est ouvert et connecté. Silencieux : un échec passager n'a rien à annoncer. */
export function pingPresence() {
  return apiClient.post("/presence/", { instance: presenceInstance() }, { silent: true }).catch(() => undefined);
}

/** Retire cet onglet des connexions en cours, à la déconnexion. */
export function leavePresence() {
  return apiClient.delete("/presence/", { data: { instance: presenceInstance() }, silent: true }).catch(() => undefined);
}
