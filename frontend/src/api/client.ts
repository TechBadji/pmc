import axios from "axios";
import { getPeerDirection } from "@/app/peerState";
import { describeApiError } from "@/utils/apiError";
import { feedbackBus } from "@/utils/feedbackBus";

declare module "axios" {
  interface AxiosRequestConfig {
    /** L'appelant affiche lui-même l'erreur (message propre à son écran) :
     * l'intercepteur ne publie alors aucune notification. */
    silent?: boolean;
    /** Titre de la notification, quand la route seule ne dit pas ce que l'utilisateur tentait. */
    errorTitle?: string;
  }
}

export const SESSION_EXPIRED_KEY = "idpmc_session_expired";

const ACCESS_KEY = "idpmc_access";
const REFRESH_KEY = "idpmc_refresh";
export const LAST_EMAIL_KEY = "idpmc_last_email";

/** "Se souvenir de moi" : jetons dans localStorage (persistent, survit à la
 * fermeture du navigateur) si coché, sinon sessionStorage (effacé à la
 * fermeture de l'onglet/navigateur). */
function activeStorage(): Storage {
  return localStorage.getItem(ACCESS_KEY) ? localStorage : sessionStorage;
}

export const tokenStorage = {
  get access() {
    return localStorage.getItem(ACCESS_KEY) ?? sessionStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY) ?? sessionStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh?: string, rememberMe?: boolean) {
    const backend =
      rememberMe === undefined ? activeStorage() : rememberMe ? localStorage : sessionStorage;
    const other = backend === localStorage ? sessionStorage : localStorage;
    other.removeItem(ACCESS_KEY);
    other.removeItem(REFRESH_KEY);
    backend.setItem(ACCESS_KEY, access);
    if (refresh) backend.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    sessionStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
  },
};

export const apiClient = axios.create({ baseURL: "/api" });

apiClient.interceptors.request.use((config) => {
  const token = tokenStorage.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Un directeur qui consulte la direction d'un pair : lecture seule, côté serveur aussi.
  const peer = getPeerDirection();
  if (peer !== null && (config.method ?? "get").toLowerCase() === "get" && !config.url?.includes("/auth/")) {
    config.params = { ...config.params, peer_direction: peer };
  }
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refresh = tokenStorage.refresh;
  if (!refresh) return null;
  try {
    const { data } = await axios.post("/api/auth/refresh/", { refresh });
    tokenStorage.set(data.access, data.refresh);
    return data.access as string;
  } catch {
    tokenStorage.clear();
    return null;
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    // Un 401 sur /auth/login/ n'est pas une session expirée mais un refus
    // d'identifiants : le rafraîchir puis rediriger vers /login rechargerait la
    // page et effacerait le message d'erreur avant que l'utilisateur le lise.
    // On laisse donc l'appelant traiter ces deux routes lui-même.
    const url: string = original?.url ?? "";
    const isAuthEntryPoint = url.includes("/auth/login/") || url.includes("/auth/refresh/");
    if (error.response?.status === 401 && !original._retry && !isAuthEntryPoint) {
      original._retry = true;
      refreshing = refreshing ?? refreshAccessToken();
      const newToken = await refreshing;
      refreshing = null;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(original);
      }
      sessionStorage.setItem(SESSION_EXPIRED_KEY, "1");
      window.location.assign("/login");
      return Promise.reject(error);
    }
    // Toute erreur qui remonte ici est expliquée à l'utilisateur, sauf si
    // l'écran appelant l'a annoncé (`silent`), pour le refus d'identifiants —
    // traité dans la page de connexion — et une requête annulée exprès.
    const isAuthRoute = url.includes("/auth/login/") || url.includes("/auth/refresh/") || url.includes("/auth/forgot-password/");
    if (!original?.silent && !isAuthRoute && !axios.isCancel(error) && error.response?.status !== 401) {
      feedbackBus.publishApiError(describeApiError(error, original?.errorTitle));
    }
    return Promise.reject(error);
  }
);
