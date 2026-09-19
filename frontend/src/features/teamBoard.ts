import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import type { Paginated, TeamBoard } from "@/api/types";
import { describeApiError } from "@/utils/apiError";
import { feedbackBus } from "@/utils/feedbackBus";
import { isRealDate, useIssues, type Rule } from "@/utils/validation";

/** Listes de texte de la carte, telles que le serveur les borne (30 lignes de 500 caractères). */
const TEXT_LISTS = [
  "people_strengths",
  "people_weaknesses",
  "business_strengths",
  "business_weaknesses",
  "catalysts",
  "nourishers",
  "inhibitors",
  "toxins",
  "values",
  "counter_values",
  "achievements",
  "failures_lessons",
  "objectives",
  "priorities_cohesion",
  "priorities_business",
] as const;
const SERIES = ["targets_vs_actuals", "objectives_plan"] as const;
const MAX_LINES = 30;
const MAX_LINE_LENGTH = 500;

/** Une ligne de série sans année ni valeur est un ajout resté vide : on ne l'envoie pas. */
function withoutEmptyRows(rows: TeamBoard["targets_vs_actuals"]) {
  return rows.filter((r) => r.year.trim() !== "" || r.target !== null || r.actual !== null);
}

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
  const { t } = useTranslation();
  const { issues, check, clear: clearIssues } = useIssues();

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
      clearIssues();
      setCurrentId(id);
      const found = boards.find((b) => b.id === id) ?? null;
      setDraft(found ?? (teamId === "" ? null : emptyBoard(teamId, today())));
      setDirty(false);
    },
    [boards, teamId, clearIssues]
  );

  /** Nouvelle entrée : même équipe, date du jour, listes vides. */
  const startNew = useCallback(
    (date: string) => {
      if (teamId === "") return;
      clearIssues();
      setCurrentId("");
      setDraft(emptyBoard(teamId, date));
      setDirty(true);
    },
    [teamId, clearIssues]
  );

  const patch = useCallback(
    (values: Partial<TeamBoard>) => {
      setDraft((prev) => (prev ? { ...prev, ...values } : prev));
      setDirty(true);
      clearIssues();
    },
    [clearIssues]
  );

  /** Ce que le serveur refuserait, dit avant la requête. Renvoie `false` si la saisie est enregistrable. */
  const validate = useCallback(
    (board: TeamBoard): boolean => {
      const rules: Rule[] = [
        [!isRealDate(board.date), t("validation.teamBoard.dateInvalid", { date: board.date })],
        [isRealDate(board.date) && board.date > today(), t("validation.teamBoard.dateFuture", { date: board.date })],
        [
          board.id === 0 && boards.some((b) => b.date === board.date),
          t("validation.teamBoard.dateDuplicate", { date: board.date }),
        ],
      ];
      for (const name of TEXT_LISTS) {
        const list = (board[name] ?? []) as string[];
        const label = t(`validation.teamBoard.lists.${name}`);
        rules.push([list.length > MAX_LINES, t("validation.teamBoard.listTooLong", { list: label, count: list.length, max: MAX_LINES })]);
        list.forEach((line, i) => {
          rules.push([
            line.length > MAX_LINE_LENGTH,
            t("validation.teamBoard.lineTooLong", { list: label, n: i + 1, count: line.length, max: MAX_LINE_LENGTH }),
          ]);
        });
      }
      for (const name of SERIES) {
        const label = t(`validation.teamBoard.series.${name}`);
        const seen = new Set<string>();
        withoutEmptyRows(board[name] ?? []).forEach((row, i) => {
          const year = row.year.trim();
          rules.push([
            !/^\d{4}$/.test(year),
            t("validation.teamBoard.yearInvalid", { series: label, n: i + 1, year }),
          ]);
          rules.push([seen.has(year), t("validation.teamBoard.yearDuplicate", { series: label, year })]);
          seen.add(year);
          for (const key of ["target", "actual"] as const) {
            const v = row[key];
            rules.push([
              v !== null && (typeof v !== "number" || !Number.isFinite(v)),
              t("validation.teamBoard.valueNotNumber", { series: label, year, field: t(`validation.teamBoard.${key}`) }),
            ]);
          }
        });
      }
      return check(rules);
    },
    [boards, check, t]
  );

  const save = useCallback(async (): Promise<boolean> => {
    if (!draft || teamId === "") return false;
    if (!validate(draft)) return false;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...draft,
        team: teamId,
        targets_vs_actuals: withoutEmptyRows(draft.targets_vs_actuals),
        objectives_plan: withoutEmptyRows(draft.objectives_plan),
      };
      // `silent` : le doublon de date est expliqué par l'écran ; les autres refus le sont ci-dessous.
      const saved = draft.id
        ? await apiClient.patch<TeamBoard>(`/team-boards/${draft.id}/`, payload, { silent: true })
        : await apiClient.post<TeamBoard>("/team-boards/", payload, { silent: true });
      setDirty(false);
      setCurrentId(saved.data.id);
      setDraft(saved.data);
      try {
        const r = await apiClient.get<Paginated<TeamBoard>>("/team-boards/", {
          params: { team: teamId, page_size: 200 },
        });
        setBoards(r.data.results);
      } catch {
        // La saisie est enregistrée : seule la liste des dates n'a pas pu être relue.
      }
      return true;
    } catch (err: any) {
      // Une date déjà utilisée est le cas courant : on le dit en clair. Les autres refus 400 sont
      // expliqués par la notification habituelle, faute de quoi ils ressembleraient à un doublon.
      const data = err?.response?.data;
      const isDuplicate = err?.response?.status === 400 && Boolean(data?.non_field_errors);
      if (isDuplicate) {
        setError("duplicate");
      } else {
        feedbackBus.publishApiError(describeApiError(err));
        setError("save");
      }
      return false;
    } finally {
      setSaving(false);
    }
  }, [draft, teamId, validate]);

  const dates = useMemo(() => boards.map((b) => ({ id: b.id, date: b.date })), [boards]);

  return { boards, dates, currentId, select, startNew, draft, patch, save, saving, dirty, error, issues, clearIssues, reload: load };
}
