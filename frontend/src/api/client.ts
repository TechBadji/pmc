import axios from "axios";

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
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      refreshing = refreshing ?? refreshAccessToken();
      const newToken = await refreshing;
      refreshing = null;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(original);
      }
      window.location.assign("/login");
    }
    return Promise.reject(error);
  }
);
