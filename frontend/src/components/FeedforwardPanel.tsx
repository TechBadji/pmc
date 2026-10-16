import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
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
type Colleague = { id: number; full_name: string; position: string; avatar: string | null };
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
  // Tous les collègues de l'entreprise, pour le Round 1 : on peut s'adresser à n'importe lequel.
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
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
  // Lecture des contributions reçues : une fiche repliable par collègue, ou
  // les réponses de tous réunies sous chaque rubrique. Rien n'est déplié
  // d'office : dix contributions tiennent ainsi sur un écran.
  const [receivedView, setReceivedView] = useState<"colleague" | "section">("colleague");
  const [open, setOpen] = useState<string[]>([]);
  const toggleOpen = (id: string) => setOpen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Rapports PDF, pour le dirigeant : synthèse de l'organisation ou Round 1 d'une personne.
  const isLeader = user?.role === "COMPANY_ADMIN";
  const [reportOpen, setReportOpen] = useState(false);
  const [reportScope, setReportScope] = useState<"global" | "individual">("global");
  const [reportSubject, setReportSubject] = useState<number | "">("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportDone, setReportDone] = useState<string | null>(null);

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
      apiClient.get<Colleague[]>("/users/colleagues/"),
    ])
      .then(([c, u, all]) => {
        const sorted = [...c.data.results].sort((a, b) => b.start_date.localeCompare(a.start_date));
        setCampaigns(sorted);
        setPeople(u.data.results);
        setColleagues(
          all.data.filter((p) => p.id !== user?.id).sort((a, b) => a.full_name.localeCompare(b.full_name, undefined, { sensitivity: "base" }))
        );
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
  useEffect(() => {
    setOpen([]);
  }, [campaignId, viewedId, receivedView]);

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
        {t(`feedforward.${round}.${key}.hint`, { company, defaultValue: "" })}
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
  const subject = colleagues.find((p) => p.id === subjectId) ?? null;
  // Toute l'entreprise, dirigeant compris, pour le rapport individuel.
  const reportPeople = useMemo(() => {
    const all = [...colleagues];
    if (user) all.push({ id: user.id, full_name: user.full_name || user.email, position: user.position ?? "", avatar: user.avatar ?? null });
    return all.sort((a, b) => a.full_name.localeCompare(b.full_name, undefined, { sensitivity: "base" }));
  }, [colleagues, user]);

  function openReport() {
    setReportError(null);
    setReportDone(null);
    if (reportSubject === "" && viewedId !== "" && viewedId !== user?.id) setReportSubject(viewedId);
    setReportOpen(true);
  }

  async function generateReport() {
    setReportError(null);
    if (campaignId === "") {
      setReportError(t("feedforward.report.pickCampaign"));
      return;
    }
    if (reportScope === "individual" && reportSubject === "") {
      setReportError(t("feedforward.report.pickPerson"));
      return;
    }
    setReportBusy(true);
    try {
      const r = await apiClient.get("/feedback-360/report/", {
        params: { campaign: campaignId, scope: reportScope, ...(reportScope === "individual" ? { subject: reportSubject } : {}) },
        responseType: "blob",
        silent: true,
      });
      const header = String(r.headers["content-disposition"] ?? "");
      const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
      const plain = /filename="([^"]+)"/i.exec(header)?.[1];
      const filename = encoded ? decodeURIComponent(encoded) : plain ?? "rapport-360-feedforward.pdf";
      const url = window.URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setReportDone(filename);
      setReportOpen(false);
    } catch (err: any) {
      // La réponse d'erreur arrive elle aussi sous forme de fichier : on la relit pour en donner le motif.
      let detail = "";
      try {
        const body = JSON.parse(await (err?.response?.data as Blob).text());
        detail = Object.values(body).flat().join(" ");
      } catch {
        detail = "";
      }
      setReportError(detail || t("feedforward.report.failed"));
    } finally {
      setReportBusy(false);
    }
  }

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
      <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
        <TextField select size="small" label={t("feedforward.campaign")} value={campaignId} onChange={(e) => setCampaignId(Number(e.target.value))} sx={{ width: 280 }}>
          {campaigns.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
        {isLeader && (
          <Button variant="contained" startIcon={<PictureAsPdfOutlinedIcon />} onClick={openReport} disabled={campaignId === ""}>
            {t("feedforward.report.open")}
          </Button>
        )}
      </Stack>
      {reportDone && (
        <Alert severity="success" onClose={() => setReportDone(null)}>
          {t("feedforward.report.done", { file: reportDone })}
        </Alert>
      )}
      <Dialog open={reportOpen} onClose={() => !reportBusy && setReportOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 800 }}>{t("feedforward.report.title")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              {t("feedforward.report.intro", { campaign: campaign?.name ?? "" })}
            </Typography>
            <RadioGroup value={reportScope} onChange={(e) => setReportScope(e.target.value as "global" | "individual")}>
              <FormControlLabel
                value="global"
                control={<Radio />}
                label={
                  <Box sx={{ py: 0.5 }}>
                    <Typography fontWeight={700}>{t("feedforward.report.global")}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t("feedforward.report.globalHint")}
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel
                value="individual"
                control={<Radio />}
                label={
                  <Box sx={{ py: 0.5 }}>
                    <Typography fontWeight={700}>{t("feedforward.report.individual")}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t("feedforward.report.individualHint")}
                    </Typography>
                  </Box>
                }
              />
            </RadioGroup>
            {reportScope === "individual" && (
              <TextField select size="small" label={t("feedforward.person")} value={reportSubject} onChange={(e) => setReportSubject(Number(e.target.value))}>
                {reportPeople.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.full_name}
                    {p.position ? ` — ${p.position}` : ""}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {reportError && <Alert severity="error">{reportError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setReportOpen(false)} disabled={reportBusy}>
            {t("feedforward.report.cancel")}
          </Button>
          <Button
            variant="contained"
            onClick={generateReport}
            disabled={reportBusy}
            startIcon={reportBusy ? <CircularProgress size={16} color="inherit" /> : <PictureAsPdfOutlinedIcon />}
          >
            {t(reportBusy ? "feedforward.report.busy" : "feedforward.report.generate")}
          </Button>
        </DialogActions>
      </Dialog>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
        <Tab label={t("feedforward.tabGive")} sx={{ textTransform: "none", fontWeight: 700 }} />
        <Tab label={t("feedforward.tabReceived")} sx={{ textTransform: "none", fontWeight: 700 }} />
        <Tab label={t("feedforward.tabRound2")} sx={{ textTransform: "none", fontWeight: 700 }} />
      </Tabs>
      {closed && <Alert severity="info">{t("feedforward.closed")}</Alert>}

      {tab === 0 && (
        <Stack spacing={2.5}>
          {roundTitle("feedforward.round1Title")}
          <TextField select size="small" label={t("feedforward.colleague")} value={subjectId} onChange={(e) => setSubjectId(Number(e.target.value))} sx={{ width: 360 }}>
            {colleagues.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.full_name}
              </MenuItem>
            ))}
          </TextField>
          {subjectId === "" ? (
            <Alert severity="info">{t("feedforward.pickColleague")}</Alert>
          ) : (
            <>
              {subject && (
                <Paper variant="outlined" sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", borderLeft: "4px solid", borderLeftColor: BLUE }}>
                  <Avatar src={subject.avatar ?? undefined} sx={{ width: 44, height: 44 }}>
                    {subject.full_name.charAt(0).toUpperCase()}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 180 }}>
                    <Typography fontWeight={800}>{subject.full_name}</Typography>
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
          {received && received.round1.length > 0 && (() => {
            const rows = received.round1;
            const ids =
              receivedView === "colleague"
                ? rows.map((c) => `c${c.author}`)
                : ROUND1.filter((b) => rows.some((c) => b.fields.some((f) => c.answers[f]))).map((b) => `s${b.key}`);
            const allOpen = ids.length > 0 && ids.every((id) => open.includes(id));
            const author = (c: (typeof rows)[number], size: number) => (
              <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
                <Avatar src={c.author_avatar ?? undefined} sx={{ width: size, height: size, fontSize: size / 2.4 }}>
                  {c.author_name.charAt(0).toUpperCase()}
                </Avatar>
                <Typography fontWeight={800} sx={{ lineHeight: 1.2 }}>
                  {c.author_name}
                  <Typography component="span" variant="body2" color="text.secondary">
                    {c.author_position ? ` · ${c.author_position}` : ""}
                  </Typography>
                </Typography>
              </Stack>
            );
            return (
              <>
                <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
                  <ToggleButtonGroup size="small" exclusive color="primary" value={receivedView} onChange={(_, v) => v && setReceivedView(v)}>
                    <ToggleButton value="colleague" sx={{ fontWeight: 700, textTransform: "none" }}>
                      {t("feedforward.byColleague")}
                    </ToggleButton>
                    <ToggleButton value="section" sx={{ fontWeight: 700, textTransform: "none" }}>
                      {t("feedforward.bySection")}
                    </ToggleButton>
                  </ToggleButtonGroup>
                  <Button size="small" onClick={() => setOpen(allOpen ? [] : ids)}>
                    {t(allOpen ? "feedforward.collapseAll" : "feedforward.expandAll")}
                  </Button>
                </Stack>
                <Box>
                  {receivedView === "colleague"
                    ? rows.map((c) => (
                        <Accordion key={c.author} disableGutters variant="outlined" expanded={open.includes(`c${c.author}`)} onChange={() => toggleOpen(`c${c.author}`)} sx={{ "&:not(:first-of-type)": { borderTop: 0 } }}>
                          <AccordionSummary expandIcon={<ExpandMoreIcon />}>{author(c, 36)}</AccordionSummary>
                          <AccordionDetails sx={{ borderTop: "1px solid", borderColor: "divider", pt: 2 }}>{guide("r1", ROUND1, c.answers)}</AccordionDetails>
                        </Accordion>
                      ))
                    : ROUND1.filter((b) => ids.includes(`s${b.key}`)).map((b) => {
                        const answered = rows.filter((c) => b.fields.some((f) => c.answers[f]));
                        return (
                          <Accordion key={b.key} disableGutters variant="outlined" expanded={open.includes(`s${b.key}`)} onChange={() => toggleOpen(`s${b.key}`)} sx={{ "&:not(:first-of-type)": { borderTop: 0 } }}>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ width: "100%", pr: 1 }}>
                                <Typography fontWeight={800} sx={{ color: b.color }}>
                                  {t(`feedforward.r1.${b.key}.title`, { company })}
                                </Typography>
                                <Chip size="small" label={answered.length} />
                              </Stack>
                            </AccordionSummary>
                            <AccordionDetails sx={{ borderTop: "1px solid", borderColor: "divider", pt: 1.5 }}>
                              <Typography fontWeight={700} variant="body2" sx={{ mb: 1.5 }}>
                                {t(`feedforward.r1.${b.key}.question`, { company })}
                              </Typography>
                              <Stack spacing={1.5} divider={<Box sx={{ borderTop: "1px dashed", borderColor: "divider" }} />}>
                                {answered.map((c) => (
                                  <Stack key={c.author} spacing={0.5}>
                                    {author(c, 26)}
                                    {b.fields
                                      .filter((f) => c.answers[f])
                                      .map((f) => (
                                        <Box key={f} sx={{ pl: 4.75 }}>
                                          {b.fields.length > 1 && (
                                            <Typography variant="caption" fontWeight={800} color="text.secondary" display="block">
                                              {t(`feedforward.r1.${f}.title`)}
                                            </Typography>
                                          )}
                                          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                                            {c.answers[f]}
                                          </Typography>
                                        </Box>
                                      ))}
                                  </Stack>
                                ))}
                              </Stack>
                            </AccordionDetails>
                          </Accordion>
                        );
                      })}
                </Box>
              </>
            );
          })()}
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
