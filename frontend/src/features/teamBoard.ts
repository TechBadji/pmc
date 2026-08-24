import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/api/client";
import type { Paginated, TeamBoard } from "@/api/types";

/** Saisie vierge : toutes les listes existent, seule la date change. */
function emptyBoard(team: number, date: string): TeamBoard {
  return {
    id: 0,
    team,
    team_name: "",
    date,
    people_strengths: [],
    people_weaknesses: [],
    business_strengths: [],
    business_weaknesses: [],
    catalysts: [],
    nourishers: [],
    inhibitors: [],
    toxins: [],
    vision_missions: "",
    values: [],
    counter_values: [],
    achievements: [],
    failures_lessons: [],
    objectives: [],
    priorities_cohesion: [],
    priorities_business: [],
    targets_vs_actuals: [],
    objectives_plan: [],
  };
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Carte d'une équipe : la liste de ses saisies, celle qui est affichée, et son
 * enregistrement. Les trois planches d'équipe (forces/faiblesses, dynamique
 * relationnelle, Team Performance ID) partagent la même saisie datée — ce
 * crochet évite d'en réécrire le chargement dans chacune.
 */
export function useTeamBoard(teamId: number | "") {
  const [boards, setBoards] = useState<TeamBoard[]>([]);
  const [currentId, setCurrentId] = useState<number | "">("");
  const [draft, setDraft] = useState<TeamBoard | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (teamId === "") {
      setBoards([]);
      setDraft(null);
      return;
    }
    apiClient
      .get<Paginated<TeamBoard>>("/team-boards/", { params: { team: teamId, page_size: 200 } })
      .then((r) => {
        setBoards(r.data.results);
        // La saisie la plus récente est celle qu'on veut voir en arrivant.
        const latest = r.data.results[0] ?? null;
        setCurrentId(latest ? latest.id : "");
        setDraft(latest ?? emptyBoard(teamId, today()));
        setDirty(false);
      })
      .catch(() => setError("load"));
  }, [teamId]);

  useEffect(load, [load]);

  const select = useCallback(
    (id: number | "") => {
      setCurrentId(id);
      const found = boards.find((b) => b.id === id) ?? null;
      setDraft(found ?? (teamId === "" ? null : emptyBoard(teamId, today())));
      setDirty(false);
    },
    [boards, teamId]
  );

  /** Nouvelle entrée : même équipe, date du jour, listes vides. */
  const startNew = useCallback(
    (date: string) => {
      if (teamId === "") return;
      setCurrentId("");
      setDraft(emptyBoard(teamId, date));
      setDirty(true);
    },
    [teamId]
  );

  const patch = useCallback((values: Partial<TeamBoard>) => {
    setDraft((prev) => (prev ? { ...prev, ...values } : prev));
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (!draft || teamId === "") return;
    setSaving(true);
    setError(null);
    try {
      const payload = { ...draft, team: teamId };
      const saved = draft.id
        ? await apiClient.patch<TeamBoard>(`/team-boards/${draft.id}/`, payload)
        : await apiClient.post<TeamBoard>("/team-boards/", payload);
      setDirty(false);
      setCurrentId(saved.data.id);
      setDraft(saved.data);
      const r = await apiClient.get<Paginated<TeamBoard>>("/team-boards/", {
        params: { team: teamId, page_size: 200 },
      });
      setBoards(r.data.results);
    } catch (err: any) {
      // Une date déjà utilisée est le cas courant : on le dit en clair.
      setError(err?.response?.status === 400 ? "duplicate" : "save");
    } finally {
      setSaving(false);
    }
  }, [draft, teamId]);

  const dates = useMemo(() => boards.map((b) => ({ id: b.id, date: b.date })), [boards]);

  return { boards, dates, currentId, select, startNew, draft, patch, save, saving, dirty, error, reload: load };
}
