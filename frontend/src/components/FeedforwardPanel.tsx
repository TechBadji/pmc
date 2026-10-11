import { Alert, Avatar, Box, Button, Chip, MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import type { EvaluationCampaign, Feedback360, FeedforwardReceived, Paginated, UserRecord } from "@/api/types";

// Couleurs du guide papier : bleu, vert d'eau et orange du logo ID-PMC.
const BLUE = "#2E7FC1";
const TEAL = "#17A89E";
const ORANGE = "#F28C28";
const MAX = 2000;

type Answers = Record<string, string>;
/** Une rubrique du guide : sa couleur de titre et ses champs. Une rubrique à
 * plusieurs champs (leviers d'impact, engagement) porte un chapeau commun. */
type Block = { key: string; color: string; fields: string[]; table?: boolean };

const ROUND1: Block[] = [
  { key: "human_qualities", color: BLUE, fields: ["human_qualities"] },
  { key: "professional_contribution", color: BLUE, fields: ["professional_contribution"] },
  { key: "achievements", color: BLUE, fields: ["achievements"] },
  { key: "impact", color: TEAL, fields: ["impact_leadership", "impact_skills"] },
  { key: "potential", color: TEAL, fields: ["potential"] },
  { key: "commitmentBlock", color: ORANGE, fields: ["commitment", "commitment_first_action", "commitment_from", "commitment_how"], table: true },
];
const ROUND2: Block[] = [
  { key: "touched", color: TEAL, fields: ["touched"] },
  { key: "strengths", color: TEAL, fields: ["strengths"] },
  { key: "priorities", color: TEAL, fields: ["priorities"] },
  { key: "commitment_90_days", color: ORANGE, fields: ["commitment_90_days"] },
  { key: "support", color: ORANGE, fields: ["support"] },
];

/** 360° Feedforward, d'après le guide ID-PMC : au Round 1 chacun dit à un
 * collègue ce qu'il voit en lui et s'engage à ses côtés ; au Round 2 le
 * bénéficiaire note ce qu'il retient et décide. Les contributions sont
 * signées : elles s'adressent à la personne. */
export default function FeedforwardPanel() {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const company = user?.company_name ?? "";
  const [tab, setTab] = useState(0);
  const [campaigns, setCampaigns] = useState<EvaluationCampaign[]>([]);
  const [campaignId, setCampaignId] = useState<number | "">("");
  const [people, setPeople] = useState<UserRecord[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [mine, setMine] = useState<Feedback360[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  // --- Round 1 donné
  const [subjectId, setSubjectId] = useState<number | "">("");
  const [given, setGiven] = useState<Answers>({});
  // --- Round 1 reçu et Round 2 : la personne consultée (soi par défaut)
  const [viewedId, setViewedId] = useState<number | "">(user?.id ?? "");
  const [received, setReceived] = useState<FeedforwardReceived | null>(null);
  const [decided, setDecided] = useState<Answers>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const campaign = campaigns.find((c) => c.id === campaignId) ?? null;
  const closed = !!campaign?.is_closed;
  const canPickViewed = user?.role === "COMPANY_ADMIN" || user?.role === "MANAGER";
  const viewingSelf = viewedId === user?.id;
  const nameOf = (p: UserRecord) => p.full_name || p.email;
  const others = people.filter((p) => p.id !== user?.id);

  useEffect(() => {
    Promise.all([
      apiClient.get<Paginated<EvaluationCampaign>>("/evaluation-campaigns/", { params: { page_size: 200 } }),
      // Le guide se remplit entre membres de l'équipe managériale : un
      // directeur y retrouve ses pairs et le CEO, pas seulement son équipe.
      apiClient.get<Paginated<UserRecord>>("/users/", { params: { page_size: 500, leadership: 1 } }),
    ])
      .then(([c, u]) => {
        const sorted = [...c.data.results].sort((a, b) => b.start_date.localeCompare(a.start_date));
        setCampaigns(sorted);
        setPeople(u.data.results);
        setCampaignId((sorted.find((x) => !x.is_closed) ?? sorted[0])?.id ?? "");
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    if (campaignId === "") return;
    apiClient
      .get<Paginated<Feedback360>>("/feedback-360/", { params: { campaign: campaignId, kind: "FORWARD", page_size: 500 } })
      .then((r) => setMine(r.data.results))
      .catch(() => setLoadError(true));
  }, [campaignId]);

  useEffect(() => {
    if (campaignId === "" || viewedId === "") return;
    apiClient
      .get<FeedforwardReceived>("/feedback-360/received/", { params: { campaign: campaignId, kind: "FORWARD", subject: viewedId } })
      .then((r) => setReceived(r.data))
      .catch(() => setLoadError(true));
  }, [campaignId, viewedId, reloadKey]);

  const existingGiven = useMemo(() => mine.find((f) => f.subject === subjectId) ?? null, [mine, subjectId]);
  const existingOwn = useMemo(() => mine.find((f) => f.subject === user?.id) ?? null, [mine, user?.id]);
  // Un avis d'avant le guide existe sans réponse : il se complète, mais ne compte pas comme rempli.
  const filled = (f: Feedback360 | null) => !!f && Object.keys(f.answers ?? {}).length > 0;

  useEffect(() => {
    setGiven({ ...(existingGiven?.answers ?? {}) });
    setSaved(false);
    setError(null);
  }, [existingGiven, subjectId]);
  useEffect(() => {
    setDecided({ ...(existingOwn?.answers ?? {}) });
  }, [existingOwn]);
  useEffect(() => {
    setSaved(false);
    setError(null);
  }, [tab, campaignId]);

  async function save(subject: number, answers: Answers, existing: Feedback360 | null) {
    setError(null);
    setSaved(false);
    if (campaignId === "") return;
    if (!Object.values(answers).some((v) => v.trim())) {
      setError(t("feedforward.empty"));
      return;
    }
    setSaving(true);
    try {
      const body = { campaign: campaignId, subject, kind: "FORWARD", answers };
      const r = existing
        ? await apiClient.put<Feedback360>(`/feedback-360/${existing.id}/`, body)
        : await apiClient.post<Feedback360>("/feedback-360/", body);
      setMine((prev) => [r.data, ...prev.filter((x) => x.id !== r.data.id)]);
      setSaved(true);
      setReloadKey((k) => k + 1);
    } catch (err: any) {
      const d = err?.response?.data;
      const detail = d && typeof d === "object" ? Object.values(d).flat().join(" ") : "";
      setError(detail || t("feedforward.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const heading = (round: "r1" | "r2", key: string, color: string) => (
    <Box>
      <Typography fontWeight={800} sx={{ color, fontSize: 17 }}>
        {t(`feedforward.${round}.${key}.title`, { company })}
      </Typography>
      <Typography fontWeight={700} sx={{ mt: 0.5 }}>
        {t(`feedforward.${round}.${key}.question`, { company, defaultValue: "" })}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
        {t(`feedforward.${round}.${key}.hint`, { defaultValue: "" })}
      </Typography>
    </Box>
  );

  /** Le guide en saisie (`onChange` fourni) ou en lecture : mêmes rubriques,
   * mêmes intitulés. En lecture, une rubrique sans réponse n'est pas montrée. */
  const guide = (round: "r1" | "r2", blocks: Block[], answers: Answers, onChange?: (key: string, value: string) => void) => {
    const input = (key: string, rows: number) =>
      onChange ? (
        <TextField
          multiline
          fullWidth
          minRows={rows}
          size="small"
          value={answers[key] ?? ""}
          inputProps={{ maxLength: MAX, "aria-label": t(`feedforward.${round}.${key}.title`, { company }) }}
          onChange={(e) => onChange(key, e.target.value)}
        />
      ) : (
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
          {answers[key]}
        </Typography>
      );
    return (
      <Stack spacing={3}>
        {blocks
          .filter((b) => onChange || b.fields.some((f) => answers[f]))
          .map((b) => (
            <Stack key={b.key} spacing={1.25}>
              {heading(round, b.key, b.color)}
              {b.fields.length === 1 ? (
                input(b.fields[0], 3)
              ) : b.table ? (
                <Paper variant="outlined" sx={{ overflow: "hidden" }}>
                  {b.fields
                    .filter((f) => onChange || answers[f])
                    .map((f, i) => (
                      <Stack key={f} direction={{ xs: "column", sm: "row" }} sx={{ borderTop: i ? "1px solid" : undefined, borderColor: "divider" }}>
                        <Box sx={{ width: { sm: 230 }, flexShrink: 0, px: 1.5, py: 1.25, bgcolor: "action.hover" }}>
                          <Typography fontWeight={800} variant="body2">
                            {t(`feedforward.${round}.${f}.title`)}
                          </Typography>
                        </Box>
                        <Box sx={{ flex: 1, p: 1 }}>{input(f, 2)}</Box>
                      </Stack>
                    ))}
                </Paper>
              ) : (
                b.fields
                  .filter((f) => onChange || answers[f])
                  .map((f) => (
                    <Stack key={f} spacing={0.75} sx={{ pl: { sm: 2 } }}>
                      <Box>
                        <Typography fontWeight={800} variant="body2">
                          {t(`feedforward.${round}.${f}.title`)}
                        </Typography>
                        <Typography variant="body2">{t(`feedforward.${round}.${f}.question`)}</Typography>
                      </Box>
                      {input(f, 2)}
                    </Stack>
                  ))
              )}
            </Stack>
          ))}
      </Stack>
    );
  };

  const roundTitle = (key: string) => (
    <Typography variant="h6" fontWeight={800}>
      {t(key)}
    </Typography>
  );
  const personPicker = (label: string, value: number | "", onPick: (id: number) => void, withMe: boolean): ReactNode => (
    <TextField select size="small" label={label} value={value} onChange={(e) => onPick(Number(e.target.value))} sx={{ width: 320 }}>
      {withMe && user && <MenuItem value={user.id}>{t("feedforward.me")}</MenuItem>}
      {others.map((p) => (
        <MenuItem key={p.id} value={p.id}>
          {nameOf(p)}
        </MenuItem>
      ))}
    </TextField>
  );
  const feedback = (savedKey: string) => (
    <>
      {error && <Alert severity="error">{error}</Alert>}
      {saved && <Alert severity="success">{t(savedKey)}</Alert>}
    </>
  );
  const subject = others.find((p) => p.id === subjectId) ?? null;

  return (
    <Stack spacing={2.5} maxWidth={920}>
      <Box>
        <Typography variant="h6" fontWeight={800} align="center" sx={{ color: BLUE }}>
          {t("feedforward.team", { company })}
        </Typography>
        <Typography align="center" sx={{ color: TEAL, fontStyle: "italic" }}>
          {t("feedforward.tagline")}
        </Typography>
      </Box>

      {loadError && <Alert severity="error">{t("feedforward.loadFailed")}</Alert>}
      <TextField select size="small" label={t("feedforward.campaign")} value={campaignId} onChange={(e) => setCampaignId(Number(e.target.value))} sx={{ width: 280 }}>
        {campaigns.map((c) => (
          <MenuItem key={c.id} value={c.id}>
            {c.name}
          </MenuItem>
        ))}
      </TextField>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
        <Tab label={t("feedforward.tabGive")} sx={{ textTransform: "none", fontWeight: 700 }} />
        <Tab label={t("feedforward.tabReceived")} sx={{ textTransform: "none", fontWeight: 700 }} />
        <Tab label={t("feedforward.tabRound2")} sx={{ textTransform: "none", fontWeight: 700 }} />
      </Tabs>
      {closed && <Alert severity="info">{t("feedforward.closed")}</Alert>}

      {tab === 0 && (
        <Stack spacing={2.5}>
          {roundTitle("feedforward.round1Title")}
          {personPicker(t("feedforward.colleague"), subjectId, setSubjectId, false)}
          {subjectId === "" ? (
            <Alert severity="info">{t("feedforward.pickColleague")}</Alert>
          ) : (
            <>
              {subject && (
                <Paper variant="outlined" sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", borderLeft: "4px solid", borderLeftColor: BLUE }}>
                  <Avatar src={subject.avatar ?? undefined} sx={{ width: 44, height: 44 }}>
                    {nameOf(subject).charAt(0).toUpperCase()}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 180 }}>
                    <Typography fontWeight={800}>{nameOf(subject)}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {subject.position}
                    </Typography>
                  </Box>
                  <Chip size="small" variant="outlined" color={filled(existingGiven) ? "info" : "default"} label={t(filled(existingGiven) ? "feedforward.statusGiven" : "feedforward.statusNew")} />
                </Paper>
              )}
              {filled(existingGiven) && !closed && <Alert severity="info">{t("feedforward.existing")}</Alert>}
              {guide("r1", ROUND1, given, closed ? undefined : (key, value) => {
                setGiven((prev) => ({ ...prev, [key]: value }));
                setSaved(false);
              })}
              {!closed && (
                <>
                  <Typography variant="caption" color="text.secondary">
                    {t("feedforward.signed")}
                  </Typography>
                  {feedback("feedforward.savedRound1")}
                  <Stack direction="row" justifyContent="flex-end">
                    <Button variant="contained" disabled={saving} onClick={() => save(subjectId, given, existingGiven)}>
                      {t(filled(existingGiven) ? "feedforward.update" : "feedforward.save")}
                    </Button>
                  </Stack>
                </>
              )}
            </>
          )}
        </Stack>
      )}

      {tab !== 0 && canPickViewed && personPicker(t("feedforward.person"), viewedId, setViewedId, true)}

      {tab === 1 && (
        <Stack spacing={2.5}>
          {roundTitle("feedforward.round1Title")}
          {received && received.round1.length === 0 && <Alert severity="info">{t("feedforward.noneReceived")}</Alert>}
          {received && received.round1.length > 0 && (
            <Typography variant="body2" color="text.secondary">
              {t("feedforward.count", { count: received.round1.length })}
            </Typography>
          )}
          {received?.round1.map((c) => (
            <Paper key={c.author} variant="outlined" sx={{ overflow: "hidden" }}>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ px: 2, py: 1.25, bgcolor: "action.hover", borderBottom: "1px solid", borderColor: "divider" }}>
                <Avatar src={c.author_avatar ?? undefined} sx={{ width: 40, height: 40 }}>
                  {c.author_name.charAt(0).toUpperCase()}
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {t("feedforward.from")}
                  </Typography>
                  <Typography fontWeight={800} sx={{ lineHeight: 1.2 }}>
                    {c.author_name}
                    {c.author_position ? ` · ${c.author_position}` : ""}
                  </Typography>
                </Box>
              </Stack>
              <Box sx={{ p: 2 }}>{guide("r1", ROUND1, c.answers)}</Box>
            </Paper>
          ))}
        </Stack>
      )}

      {tab === 2 && (
        <Stack spacing={2.5}>
          {roundTitle("feedforward.round2Title")}
          <Typography variant="body2">{t("feedforward.round2Intro")}</Typography>
          {viewingSelf ? (
            <>
              {guide("r2", ROUND2, decided, closed ? undefined : (key, value) => {
                setDecided((prev) => ({ ...prev, [key]: value }));
                setSaved(false);
              })}
              {closed && !filled(existingOwn) && <Alert severity="info">{t("feedforward.noRound2")}</Alert>}
              {!closed && (
                <>
                  {feedback("feedforward.savedRound2")}
                  <Stack direction="row" justifyContent="flex-end">
                    <Button variant="contained" disabled={saving || !user} onClick={() => user && save(user.id, decided, existingOwn)}>
                      {t(filled(existingOwn) ? "feedforward.update" : "feedforward.save")}
                    </Button>
                  </Stack>
                </>
              )}
            </>
          ) : (
            <>
              <Alert severity="info">{t("feedforward.readOnlyOther")}</Alert>
              {received?.round2 ? guide("r2", ROUND2, received.round2) : <Alert severity="info">{t("feedforward.noRound2")}</Alert>}
            </>
          )}
        </Stack>
      )}
    </Stack>
  );
}
