import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import axios from "axios";
import { apiClient, LAST_EMAIL_KEY, tokenStorage } from "@/api/client";
import type { Me } from "@/api/types";

interface AuthState {
  user: Me | null;
  status: "idle" | "loading" | "authenticated" | "error";
  /** Code d'erreur de la dernière tentative de connexion (traduit à l'affichage). */
  error: LoginErrorCode | null;
}

const initialState: AuthState = {
  user: null,
  status: "idle",
  error: null,
};

/**
 * Code d'erreur de connexion, traduit à l'affichage : `invalid_credentials`
 * ne dit jamais lequel des deux champs est fautif (pas d'énumération de
 * comptes), `network` distingue la panne réseau/serveur d'un refus.
 */
export type LoginErrorCode = "invalid_credentials" | "network";

export const login = createAsyncThunk<
  Me,
  { email: string; password: string; rememberMe: boolean },
  { rejectValue: LoginErrorCode }
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
    const me = await apiClient.get<Me>("/auth/me/");
    return me.data;
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    // 400/401 = identifiants refusés ; tout le reste (pas de réponse, 5xx) est
    // une panne, que l'utilisateur ne peut pas corriger en retapant son mot de passe.
    return rejectWithValue(
      status === 400 || status === 401 ? "invalid_credentials" : "network"
    );
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
      })
      .addCase(login.fulfilled, (state, action: PayloadAction<Me>) => {
        state.status = "authenticated";
        state.user = action.payload;
      })
      .addCase(login.rejected, (state, action) => {
        state.status = "error";
        state.error = action.payload ?? "network";
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
