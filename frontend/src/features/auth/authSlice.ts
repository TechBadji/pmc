import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import axios from "axios";
import { apiClient, LAST_EMAIL_KEY, tokenStorage } from "@/api/client";
import type { Me } from "@/api/types";

interface AuthState {
  user: Me | null;
  status: "idle" | "loading" | "authenticated" | "error";
  /** Code d'erreur de la dernière tentative de connexion (traduit à l'affichage). */
  error: LoginErrorCode | null;
  /** Précisions du refus (attente imposée, message du serveur) pour l'expliquer en clair. */
  errorInfo: LoginFailure | null;
}

const initialState: AuthState = {
  user: null,
  status: "idle",
  error: null,
  errorInfo: null,
};

/**
 * Code d'erreur de connexion, traduit à l'affichage : `invalid_credentials`
 * ne dit jamais lequel des deux champs est fautif (pas d'énumération de
 * comptes), `network` distingue la panne réseau/serveur d'un refus.
 */
export type LoginErrorCode =
  | "invalid_credentials"
  | "account_blocked"
  | "rejected"
  | "throttled"
  | "network"
  | "timeout"
  | "unavailable"
  | "server";

export interface LoginFailure {
  code: LoginErrorCode;
  /** Secondes à attendre avant de réessayer (trop de tentatives). */
  retryAfter?: number;
  /** Motif donné par le serveur quand le compte est refusé pour une autre raison qu'un mauvais mot de passe. */
  detail?: string;
}

function readLoginFailure(err: unknown): LoginFailure {
  if (!axios.isAxiosError(err) || !err.response) {
    const timeout = axios.isAxiosError(err) && (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT");
    return { code: timeout ? "timeout" : "network" };
  }
  const { status, data } = err.response;
  const body = (data ?? {}) as Record<string, unknown>;
  // Compte bloqué par un administrateur : surtout pas « identifiants
  // incorrects », qui pousserait l'utilisateur à réinitialiser son mot de passe.
  if (body.code === "account_blocked" || status === 403) return { code: "account_blocked" };
  if (status === 429) {
    return { code: "throttled", retryAfter: typeof body.retry_after === "number" ? body.retry_after : undefined };
  }
  if (status === 400) {
    // Le serveur refuse aussi un compte dont l'entreprise est suspendue, avec son propre motif.
    const reason = Array.isArray(body.non_field_errors) ? body.non_field_errors[0] : undefined;
    if (typeof reason === "string") return { code: "rejected", detail: reason };
    return { code: "invalid_credentials" };
  }
  if (status === 401) return { code: "invalid_credentials" };
  if (status === 502 || status === 503 || status === 504) return { code: "unavailable" };
  return { code: "server" };
}

export const login = createAsyncThunk<
  Me,
  { email: string; password: string; rememberMe: boolean },
  { rejectValue: LoginFailure }
>("auth/login", async (payload, { rejectWithValue }) => {
  const { email, password, rememberMe } = payload;
  try {
    const { data } = await apiClient.post("/auth/login/", { email, password });
    tokenStorage.set(data.access, data.refresh, rememberMe);
    if (rememberMe) {
      localStorage.setItem(LAST_EMAIL_KEY, email);
    } else {
      localStorage.removeItem(LAST_EMAIL_KEY);
    }
    const me = await apiClient.get<Me>("/auth/me/", { silent: true });
    return me.data;
  } catch (err) {
    // 400/401 = identifiants refusés ; tout le reste (pas de réponse, 5xx) est
    // une panne, que l'utilisateur ne peut pas corriger en retapant son mot de passe.
    return rejectWithValue(readLoginFailure(err));
  }
});

export const fetchMe = createAsyncThunk("auth/fetchMe", async () => {
  const { data } = await apiClient.get<Me>("/auth/me/");
  return data;
});

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    logout(state) {
      tokenStorage.clear();
      state.user = null;
      state.status = "idle";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.status = "loading";
        state.error = null;
        state.errorInfo = null;
      })
      .addCase(login.fulfilled, (state, action: PayloadAction<Me>) => {
        state.status = "authenticated";
        state.user = action.payload;
      })
      .addCase(login.rejected, (state, action) => {
        state.status = "error";
        state.error = action.payload?.code ?? "network";
        state.errorInfo = action.payload ?? { code: "network" };
      })
      .addCase(fetchMe.fulfilled, (state, action: PayloadAction<Me>) => {
        state.status = "authenticated";
        state.user = action.payload;
      })
      .addCase(fetchMe.rejected, (state) => {
        // Un échec transitoire (ex: juste après une sauvegarde de profil) ne
        // doit pas déconnecter un utilisateur déjà authentifié : on ne vide
        // `user` que si aucune session n'était encore chargée. Le statut
        // passe à "error" (pas "idle") pour qu'un premier chargement en échec
        // redirige vers /login au lieu de redéclencher fetchMe en boucle
        // (ProtectedRoute ne refait l'appel que si status === "idle").
        if (!state.user) {
          state.status = "error";
          state.user = null;
        }
      });
  },
});

export const { logout } = authSlice.actions;
export default authSlice.reducer;
