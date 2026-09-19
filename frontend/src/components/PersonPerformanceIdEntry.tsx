import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import type { Paginated, PerformanceProfile } from "@/api/types";
import { useUnsavedChanges } from "@/app/unsavedChanges";
import ValidationSummary from "@/components/feedback/ValidationSummary";
import { isBlank, useIssues, type Rule } from "@/utils/validation";

/** La fiche Performance ID en version « à remplir » : uniquement ce que la personne
 * saisit elle-même. Aucun indice calculé (HSI, SSI, Altitude, objectifs), aucun
 * pourcentage de performance et aucun graphique — ceux-là viennent des évaluations. */

type ListKey =
  | "qualifications"
  | "professional_achievements"
  | "personal_achievements"
  | "professional_role_models"
  | "role_models_in_life"
  | "motivates"
  | "dislikes"
  | "personality_traits"
  | "hobbies"
  | "brings_to_team"
  | "brings_to_manager"
  | "expects_from_team"
  | "expects_from_manager"
  | "dev_priorities"
  | "dev_professional_perspectives"
  | "dev_actions_support"
  | "dev_risks_obstacles";

type TextKey = "vision_aspirations" | "personal_projects";

interface EntryForm extends Record<ListKey, string[]>, Record<TextKey, string> {
  gender: string;
  contract_type: string;
  bono_hat: string;
  previous_positions: string[];
  previous_position_dates: string[];
}

/** Nombre de lignes de chaque liste : identique à la fiche complète. */
const LIST_ROWS: Record<ListKey, number> = {
  qualifications: 5,
  professional_achievements: 5,
  personal_achievements: 5,
  professional_role_models: 4,
  role_models_in_life: 4,
  motivates: 4,
  dislikes: 4,
  personality_traits: 3,
  hobbies: 2,
  brings_to_team: 4,
  brings_to_manager: 4,
  expects_from_team: 3,
  expects_from_manager: 3,
  dev_priorities: 4,
  dev_professional_perspectives: 4,
  dev_actions_support: 3,
  dev_risks_obstacles: 3,
};

const SECTIONS: { key: string; lists: ListKey[]; texts?: TextKey[]; professional?: boolean; hat?: boolean }[] = [
  { key: "professional", lists: ["qualifications"], professional: true },
  { key: "achievements", lists: ["professional_achievements", "personal_achievements"] },
  { key: "vision", lists: [], texts: ["vision_aspirations", "personal_projects"] },
  {
    key: "personality",
    lists: ["professional_role_models", "role_models_in_life", "motivates", "dislikes", "personality_traits", "hobbies"],
    hat: true,
  },
  { key: "contribution", lists: ["brings_to_team", "brings_to_manager", "expects_from_team", "expects_from_manager"] },
  {
    key: "development",
    lists: ["dev_priorities", "dev_professional_perspectives", "dev_actions_support", "dev_risks_obstacles"],
  },
];

const ITEM_MAX = 300;
const TEXT_MAX = 2000;
const GENDERS = ["Femme", "Homme", "Autre"];
const CONTRACTS = ["CDI", "CDD", "Intérim", "Stage", "Alternance", "Consultant"];
const HATS = ["Blanc", "Rouge", "Noir", "Jaune", "Vert", "Bleu"];

function padTo(values: string[] | undefined, rows: number): string[] {
  const out = [...(values ?? [])].slice(0, rows);
  while (out.length < rows) out.push("");
  return out;
}

function emptyForm(): EntryForm {
  const form = { gender: "", contract_type: "", bono_hat: "", vision_aspirations: "", personal_projects: "" } as EntryForm;
  (Object.keys(LIST_ROWS) as ListKey[]).forEach((key) => {
    form[key] = padTo([], LIST_ROWS[key]);
  });
  form.previous_positions = padTo([], 2);
  form.previous_position_dates = padTo([], 2);
  return form;
}

function fromProfile(profile: PerformanceProfile | undefined): EntryForm {
  const form = emptyForm();
  if (!profile) return form;
  form.gender = profile.gender ?? "";
  form.contract_type = profile.contract_type ?? "";
  form.bono_hat = profile.bono_hat ?? "";
  form.vision_aspirations = profile.vision_aspirations ?? "";
  form.personal_projects = profile.personal_projects ?? "";
  (Object.keys(LIST_ROWS) as ListKey[]).forEach((key) => {
    form[key] = padTo(profile[key], LIST_ROWS[key]);
  });
  form.previous_positions = padTo(profile.previous_positions, 2);
  form.previous_position_dates = padTo(profile.previous_position_dates, 2);
  return form;
}

/** Les cases vides du bas ne sont pas envoyées : la fiche complète les recrée. */
function trimTail(values: string[]): string[] {
  const out = values.map((v) => v.trim());
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

export interface EntryPerson {
  id: number;
  full_name?: string;
  email?: string;
  position?: string;
  department_name?: string | null;
  avatar?: string | null;
}

function ListField({
  label,
  values,
  onChange,
  disabled,
  error,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
  error?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Stack spacing={0.75}>
      <Typography variant="subtitle2" fontWeight={700}>
        {label}
      </Typography>
      {values.map((value, index) => (
        <TextField
          key={index}
          size="small"
          value={value}
          disabled={disabled}
          error={error}
          placeholder={t("performanceEntry.itemPlaceholder", { n: index + 1 })}
          inputProps={{ maxLength: ITEM_MAX, "aria-label": `${label} ${index + 1}` }}
          helperText={value.length > ITEM_MAX - 50 ? t("performanceEntry.counter", { count: value.length, max: ITEM_MAX }) : undefined}
          onChange={(e) => onChange(values.map((v, i) => (i === index ? e.target.value : v)))}
        />
      ))}
    </Stack>
  );
}

export default function PersonPerformanceIdEntry({
  person,
  canEdit = true,
}: {
  person: EntryPerson;
  canEdit?: boolean;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<EntryForm>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const { issues, check, clear } = useIssues();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    setDirty(false);
    setSavedAt(null);
    clear();
    apiClient
      .get<Paginated<PerformanceProfile>>("/performance-profiles/", { params: { user: person.id } })
      .then((r) => {
        if (!cancelled) setForm(fromProfile(r.data.results[0]));
      })
      .catch(() => {
        if (!cancelled) {
          setForm(emptyForm());
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person.id, reloadKey]);

  const patch = useCallback(
    (next: Partial<EntryForm>) => {
      setForm((prev) => ({ ...prev, ...next }));
      setDirty(true);
      setSavedAt(null);
      clear();
    },
    [clear]
  );

  const fieldLabel = (key: string) => t(`performanceEntry.fields.${key}`);

  const filledSections = useMemo(() => {
    const has = (values: string[]) => values.some((v) => v.trim() !== "");
    const checks = [
      !isBlank(form.gender) || !isBlank(form.contract_type) || has(form.qualifications) || has(form.previous_positions),
      has(form.professional_achievements) || has(form.personal_achievements),
      !isBlank(form.vision_aspirations) || !isBlank(form.personal_projects),
      ["professional_role_models", "role_models_in_life", "motivates", "dislikes", "personality_traits", "hobbies"].some((k) =>
        has(form[k as ListKey])
      ) || !isBlank(form.bono_hat),
      ["brings_to_team", "brings_to_manager", "expects_from_team", "expects_from_manager"].some((k) => has(form[k as ListKey])),
      ["dev_priorities", "dev_professional_perspectives", "dev_actions_support", "dev_risks_obstacles"].some((k) =>
        has(form[k as ListKey])
      ),
    ];
    return checks.filter(Boolean).length;
  }, [form]);
  const percent = Math.round((filledSections / SECTIONS.length) * 100);

  async function handleSave() {
    if (!canEdit || saving) return;
    const thisYear = new Date().getFullYear();
    const rules: Rule[] = [];
    const everything = [
      ...(Object.keys(LIST_ROWS) as ListKey[]).flatMap((k) => form[k]),
      ...form.previous_positions,
      form.vision_aspirations,
      form.personal_projects,
      form.gender,
      form.contract_type,
      form.bono_hat,
    ];
    rules.push([everything.every((v) => v.trim() === ""), t("performanceEntry.validation.nothingToSave")]);

    const listsToCheck: [string, string[]][] = [
      ...(Object.keys(LIST_ROWS) as ListKey[]).map((k) => [k, form[k]] as [string, string[]]),
      ["previous_positions", form.previous_positions],
    ];
    for (const [key, values] of listsToCheck) {
      const seen = new Set<string>();
      for (const raw of values) {
        const value = raw.trim();
        if (!value) continue;
        const norm = value.toLowerCase();
        rules.push([seen.has(norm), t("performanceEntry.validation.duplicate", { value, field: fieldLabel(key) }), key]);
        seen.add(norm);
        rules.push([value.length > ITEM_MAX, t("performanceEntry.validation.tooLong", { field: fieldLabel(key), max: ITEM_MAX }), key]);
      }
    }
    (["vision_aspirations", "personal_projects"] as TextKey[]).forEach((key) => {
      rules.push([
        form[key].length > TEXT_MAX,
        t("performanceEntry.validation.textTooLong", { field: fieldLabel(key), max: TEXT_MAX, count: form[key].length }),
        key,
      ]);
    });
    form.previous_position_dates.forEach((raw, index) => {
      const value = raw.trim();
      if (!value) return;
      const match = /^(\d{4})(-(0[1-9]|1[0-2]))?$/.exec(value);
      const year = match ? Number(match[1]) : NaN;
      rules.push([!match || year < 1950 || year > thisYear, t("performanceEntry.validation.sinceInvalid", { value }), "previous_position_dates"]);
      rules.push([isBlank(form.previous_positions[index]), t("performanceEntry.validation.sinceWithoutPosition"), "previous_position_dates"]);
    });
    if (!check(rules)) return;

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        user: person.id,
        gender: form.gender.trim(),
        contract_type: form.contract_type.trim(),
        bono_hat: form.bono_hat.trim(),
        vision_aspirations: form.vision_aspirations.trim(),
        personal_projects: form.personal_projects.trim(),
        previous_positions: trimTail(form.previous_positions),
        previous_position_dates: form.previous_position_dates.map((v) => v.trim()).slice(0, 2),
      };
      (Object.keys(LIST_ROWS) as ListKey[]).forEach((key) => {
        body[key] = trimTail(form[key]);
      });
      await apiClient.put("/performance-profiles/save-for-user/", body);
      setDirty(false);
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch {
      // Le motif est donné par la notification ; la fiche reste marquée « non enregistrée ».
    } finally {
      setSaving(false);
    }
  }

  useUnsavedChanges(dirty, handleSave);

  const disabled = !canEdit || loading || loadFailed;
  const name = person.full_name || person.email || "";
  const hasIssue = (field: string) => issues.some((i) => i.field === field);

  return (
    <Stack spacing={2}>
      <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider" }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
          <Avatar src={person.avatar ?? undefined} sx={{ width: 64, height: 64 }}>
            {name.charAt(0).toUpperCase()}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" fontWeight={700} noWrap>
              {name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {[person.position, person.department_name].filter(Boolean).join(" — ")}
            </Typography>
          </Box>
          <Box sx={{ minWidth: 220 }}>
            <Typography variant="body2" fontWeight={700}>
              {t("performanceEntry.completion", { percent })}
            </Typography>
            <LinearProgress variant="determinate" value={percent} sx={{ height: 8, borderRadius: 4, my: 0.5 }} />
            <Typography variant="caption" color="text.secondary">
              {t("performanceEntry.completionHint", { filled: filledSections, total: SECTIONS.length })}
            </Typography>
          </Box>
        </Stack>
      </Paper>

      {loading && (
        <Stack alignItems="center" sx={{ py: 3 }}>
          <CircularProgress size={26} />
        </Stack>
      )}
      {loadFailed && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => setReloadKey((k) => k + 1)}>
              {t("performanceEntry.retry")}
            </Button>
          }
        >
          {t("performanceEntry.loadFailed")}
        </Alert>
      )}

      {SECTIONS.map((section) => (
        <Paper key={section.key} elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider" }}>
          <Typography variant="subtitle1" fontWeight={800} color="primary.main" sx={{ mb: 1.5 }}>
            {t(`performanceEntry.sections.${section.key}`)}
          </Typography>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" } }}>
            {section.professional && (
              <>
                <TextField
                  select
                  size="small"
                  label={fieldLabel("gender")}
                  value={form.gender}
                  disabled={disabled}
                  onChange={(e) => patch({ gender: e.target.value })}
                >
                  <MenuItem value="">—</MenuItem>
                  {(GENDERS.includes(form.gender) || !form.gender ? GENDERS : [...GENDERS, form.gender]).map((g) => (
                    <MenuItem key={g} value={g}>
                      {GENDERS.includes(g) ? t(`performanceEntry.genders.${g}`) : g}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  size="small"
                  label={fieldLabel("contract_type")}
                  value={form.contract_type}
                  disabled={disabled}
                  onChange={(e) => patch({ contract_type: e.target.value })}
                >
                  <MenuItem value="">—</MenuItem>
                  {(CONTRACTS.includes(form.contract_type) || !form.contract_type ? CONTRACTS : [...CONTRACTS, form.contract_type]).map(
                    (c) => (
                      <MenuItem key={c} value={c}>
                        {CONTRACTS.includes(c) ? t(`performanceEntry.contracts.${c}`) : c}
                      </MenuItem>
                    )
                  )}
                </TextField>
                <Stack spacing={0.75}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    {fieldLabel("previous_positions")}
                  </Typography>
                  {[0, 1].map((i) => (
                    <Stack key={i} direction="row" spacing={1}>
                      <TextField
                        size="small"
                        sx={{ width: 120 }}
                        label={t("performanceEntry.since")}
                        placeholder="2019"
                        value={form.previous_position_dates[i]}
                        disabled={disabled}
                        error={hasIssue("previous_position_dates")}
                        inputProps={{ maxLength: 7 }}
                        onChange={(e) => {
                          const next = [...form.previous_position_dates];
                          next[i] = e.target.value;
                          patch({ previous_position_dates: next });
                        }}
                      />
                      <TextField
                        size="small"
                        fullWidth
                        placeholder={t("performanceEntry.itemPlaceholder", { n: i + 1 })}
                        value={form.previous_positions[i]}
                        disabled={disabled}
                        inputProps={{ maxLength: ITEM_MAX, "aria-label": `${fieldLabel("previous_positions")} ${i + 1}` }}
                        onChange={(e) => {
                          const next = [...form.previous_positions];
                          next[i] = e.target.value;
                          patch({ previous_positions: next });
                        }}
                      />
                    </Stack>
                  ))}
                  <Typography variant="caption" color="text.secondary">
                    {t("performanceEntry.sinceHelp")}
                  </Typography>
                </Stack>
              </>
            )}
            {section.lists.map((key) => (
              <ListField
                key={key}
                label={fieldLabel(key)}
                values={form[key]}
                disabled={disabled}
                error={hasIssue(key)}
                onChange={(next) => patch({ [key]: next } as Partial<EntryForm>)}
              />
            ))}
            {section.texts?.map((key) => (
              <TextField
                key={key}
                multiline
                minRows={5}
                label={fieldLabel(key)}
                value={form[key]}
                disabled={disabled}
                error={hasIssue(key)}
                inputProps={{ maxLength: TEXT_MAX + 200 }}
                helperText={t("performanceEntry.counter", { count: form[key].length, max: TEXT_MAX })}
                onChange={(e) => patch({ [key]: e.target.value } as Partial<EntryForm>)}
              />
            ))}
            {section.hat && (
              <TextField
                select
                size="small"
                label={fieldLabel("bono_hat")}
                value={form.bono_hat}
                disabled={disabled}
                helperText={t("performanceEntry.hatHelp")}
                onChange={(e) => patch({ bono_hat: e.target.value })}
              >
                <MenuItem value="">—</MenuItem>
                {(HATS.includes(form.bono_hat) || !form.bono_hat ? HATS : [...HATS, form.bono_hat]).map((h) => (
                  <MenuItem key={h} value={h}>
                    {HATS.includes(h) ? t(`performanceEntry.hats.${h}`) : h}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Box>
        </Paper>
      ))}

      <Stack
        spacing={1}
        sx={{ position: "sticky", bottom: 0, bgcolor: "background.default", py: 1, zIndex: 2 }}
        className="pmc-no-print"
      >
        <ValidationSummary issues={issues} onClose={clear} />
        <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="flex-end">
          {dirty && (
            <Typography sx={{ fontSize: 13, color: "warning.main", fontWeight: 700 }}>{t("performanceEntry.unsaved")}</Typography>
          )}
          {!dirty && savedAt && (
            <Typography sx={{ fontSize: 13, color: "success.main", fontWeight: 700 }}>
              {t("performanceEntry.savedAt", { time: savedAt })}
            </Typography>
          )}
          <Button variant="contained" onClick={handleSave} disabled={!canEdit || saving || loading || loadFailed || !dirty}>
            {saving ? <CircularProgress size={18} color="inherit" /> : t("performanceEntry.save")}
          </Button>
        </Stack>
      </Stack>
    </Stack>
  );
}

/** Version « saisie » depuis l'écran Performance ID du CEO ou du manager :
 * on choisit la personne, et sa fiche s'ouvre à remplir. */
export function PerformanceEntryWithPicker({
  selectable,
  canEditFor,
}: {
  selectable: (EntryPerson & { role?: string })[];
  canEditFor?: (person: EntryPerson) => boolean;
}) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<number | "">("");
  const person = selectable.find((p) => p.id === selectedId) ?? null;
  return (
    <Stack spacing={2}>
      <Alert severity="info" className="pmc-no-print">
        {t("performanceEntry.viewIntro")}
      </Alert>
      <TextField
        select
        size="small"
        label={t("performanceEntry.selectPerson")}
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value === "" ? "" : Number(e.target.value))}
        sx={{ width: 300 }}
      >
        {selectable.map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {p.full_name || p.email}
            {p.department_name ? ` — ${p.department_name}` : ""}
          </MenuItem>
        ))}
      </TextField>
      {person ? (
        <PersonPerformanceIdEntry key={person.id} person={person} canEdit={canEditFor ? canEditFor(person) : true} />
      ) : (
        <Alert severity="info">{t("performanceEntry.pickPerson")}</Alert>
      )}
    </Stack>
  );
}
