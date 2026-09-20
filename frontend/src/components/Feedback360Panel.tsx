import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import type { EvaluationCampaign, Feedback360, FeedbackGroup, FeedbackKind, Paginated, UserRecord } from "@/api/types";

const RELATIONS = ["SELF", "MANAGER", "REPORT", "PEER"] as const;
const MIN_GROUP = 2;
const TEXT_KEYS = ["text_a", "text_b", "text_c"] as const;

/** 360° Feedback (regard sur le passé, compétences notées) et 360° Forward
 * (conseils pour l'avenir : commencer / arrêter / continuer). Les avis reçus
 * sont agrégés par relation et anonymes ; on peut aussi en donner un. */
export default function Feedback360Panel({ kind }: { kind: FeedbackKind }) {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const isFeedback = kind === "FEEDBACK";
  const [tab, setTab] = useState(0);
  const [campaigns, setCampaigns] = useState<EvaluationCampaign[]>([]);
  const [campaignId, setCampaignId] = useState<number | "">("");
  const [people, setPeople] = useState<UserRecord[]>([]);
  const [loadError, setLoadError] = useState(false);

  // --- avis reçus
  const [viewedId, setViewedId] = useState<number | "">(user?.id ?? "");
  const [groups, setGroups] = useState<FeedbackGroup[]>([]);
  // --- avis donné
  const [mine, setMine] = useState<Feedback360[]>([]);
  const [subjectId, setSubjectId] = useState<number | "">("");
  const [scores, setScores] = useState<(number | null)[]>(Array(6).fill(null));
  const [texts, setTexts] = useState<[string, string, string]>(["", "", ""]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);

  const campaign = campaigns.find((c) => c.id === campaignId) ?? null;
  const canPickViewed = user?.role === "COMPANY_ADMIN" || user?.role === "MANAGER";

  useEffect(() => {
    Promise.all([
      apiClient.get<Paginated<EvaluationCampaign>>("/evaluation-campaigns/", { params: { page_size: 200 } }),
      apiClient.get<Paginated<UserRecord>>("/users/", { params: { page_size: 500 } }),
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
    if (campaignId === "" || viewedId === "") return;
    apiClient
      .get<{ groups: FeedbackGroup[] }>("/feedback-360/received/", { params: { campaign: campaignId, kind, subject: viewedId } })
      .then((r) => setGroups(r.data.groups))
      .catch(() => setLoadError(true));
  }, [campaignId, viewedId, kind]);

  useEffect(() => {
    if (campaignId === "") return;
    apiClient
      .get<Paginated<Feedback360>>("/feedback-360/", { params: { campaign: campaignId, kind, page_size: 500 } })
      .then((r) => setMine(r.data.results))
      .catch(() => setLoadError(true));
  }, [campaignId, kind]);

  const existing = useMemo(() => mine.find((f) => f.subject === subjectId) ?? null, [mine, subjectId]);
  useEffect(() => {
    setScores(existing && isFeedback ? [...existing.scores] : Array(6).fill(null));
    setTexts(existing ? [existing.text_a, existing.text_b, existing.text_c] : ["", "", ""]);
    setSaved(false);
    setShowMissing(false);
    setError(null);
  }, [existing, subjectId, isFeedback]);

  const missing = scores.filter((s) => s === null).length;
  const readOnly = !!campaign?.is_closed;

  async function handleSave() {
    setError(null);
    if (campaignId === "" || subjectId === "") {
      setError(t("feedback360.pickPerson"));
      return;
    }
    if (isFeedback && missing > 0) {
      setShowMissing(true);
      return;
    }
    setSaving(true);
    try {
      const body = { campaign: campaignId, subject: subjectId, kind, scores: isFeedback ? scores : [], text_a: texts[0], text_b: texts[1], text_c: texts[2] };
      const r = existing
        ? await apiClient.put<Feedback360>(`/feedback-360/${existing.id}/`, body)
        : await apiClient.post<Feedback360>("/feedback-360/", body);
      setMine((prev) => [r.data, ...prev.filter((x) => x.id !== r.data.id)]);
      setSaved(true);
      if (subjectId === viewedId) setViewedId(viewedId);
    } catch (err: any) {
      const d = err?.response?.data;
      const detail = d && typeof d === "object" ? Object.values(d).flat().join(" ") : "";
      setError(detail || t("feedback360.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const textLabels = isFeedback ? ["strengths", "improvements"] : ["start", "stop", "continue"];
  const nameOf = (p: UserRecord) => p.full_name || p.email;

  return (
    <Stack spacing={2.5}>
      <Typography variant="body2" color="text.secondary">
        {t(isFeedback ? "feedback360.feedbackSubtitle" : "feedback360.forwardSubtitle")}
      </Typography>
      {loadError && <Alert severity="error">{t("feedback360.loadFailed")}</Alert>}
      <TextField select size="small" label={t("feedback360.campaign")} value={campaignId} onChange={(e) => setCampaignId(Number(e.target.value))} sx={{ width: 280 }}>
        {campaigns.map((c) => (
          <MenuItem key={c.id} value={c.id}>
            {c.name}
          </MenuItem>
        ))}
      </TextField>

      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab label={t("feedback360.tabReceived")} />
        <Tab label={t("feedback360.tabGive")} />
      </Tabs>

      {tab === 0 && (
        <Stack spacing={2}>
          {canPickViewed && (
            <TextField select size="small" label={t("feedback360.person")} value={viewedId} onChange={(e) => setViewedId(Number(e.target.value))} sx={{ width: 320 }}>
              {user && <MenuItem value={user.id}>{t("feedback360.me")}</MenuItem>}
              {people.filter((p) => p.id !== user?.id).map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {nameOf(p)}
                </MenuItem>
              ))}
            </TextField>
          )}
          {groups.length === 0 && !loadError && <Alert severity="info">{t("feedback360.noneReceived")}</Alert>}

          {isFeedback && groups.length > 0 && (
            <Paper variant="outlined" sx={{ overflow: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "primary.main" }}>
                    <TableCell sx={{ color: "#fff", fontWeight: 700 }}>{t("feedback360.competency")}</TableCell>
                    {RELATIONS.map((rel) => {
                      const g = groups.find((x) => x.relation === rel);
                      return g ? (
                        <TableCell key={rel} align="center" sx={{ color: "#fff", fontWeight: 700 }}>
                          {t(`feedback360.relation.${rel}`)}
                          <Typography variant="caption" display="block" sx={{ opacity: 0.85 }}>
                            {t("feedback360.count", { n: g.count })}
                          </Typography>
                        </TableCell>
                      ) : null;
                    })}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <TableRow key={i}>
                      <TableCell>{t(`feedback360.competencies.${i}`)}</TableCell>
                      {RELATIONS.map((rel) => {
                        const g = groups.find((x) => x.relation === rel);
                        if (!g) return null;
                        return (
                          <TableCell key={rel} align="center" sx={{ fontWeight: 700 }}>
                            {g.published && g.averages ? g.averages[i].toFixed(1).replace(".", ",") : "—"}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}

          {groups.map((g) => (
            <Paper key={g.relation} variant="outlined" sx={{ p: 2 }}>
              <Typography fontWeight={800} sx={{ mb: 1 }}>
                {t(`feedback360.relation.${g.relation}`)} — {t("feedback360.count", { n: g.count })}
              </Typography>
              {!g.published ? (
                <Alert severity="info">{t("feedback360.hidden", { min: MIN_GROUP, n: g.count })}</Alert>
              ) : (
                <Stack spacing={1}>
                  {(g.comments ?? []).map((c, i) => (
                    <Box key={i} sx={{ pl: 1.5, borderLeft: "3px solid", borderColor: "divider" }}>
                      {TEXT_KEYS.slice(0, textLabels.length).map((k, j) =>
                        c[k] ? (
                          <Typography key={k} variant="body2">
                            <strong>{t(`feedback360.${textLabels[j]}`)} :</strong> {c[k]}
                          </Typography>
                        ) : null
                      )}
                    </Box>
                  ))}
                </Stack>
              )}
            </Paper>
          ))}
        </Stack>
      )}

      {tab === 1 && (
        <Stack spacing={2} maxWidth={860}>
          <TextField select size="small" label={t("feedback360.person")} value={subjectId} onChange={(e) => setSubjectId(Number(e.target.value))} sx={{ width: 320 }}>
            {user && <MenuItem value={user.id}>{t("feedback360.me")}</MenuItem>}
            {people.filter((p) => p.id !== user?.id).map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {nameOf(p)}
              </MenuItem>
            ))}
          </TextField>
          {subjectId === "" && <Alert severity="info">{t("feedback360.pickPerson")}</Alert>}
          {readOnly && <Alert severity="info">{t("feedback360.closed")}</Alert>}
          {existing && <Alert severity="info">{t("feedback360.existing")}</Alert>}

          {subjectId !== "" && (
            <>
              {isFeedback && (
                <Paper variant="outlined">
                  <Typography fontWeight={700} sx={{ px: 2, pt: 1.5 }}>
                    {t("feedback360.rate")}
                  </Typography>
                  <Stack>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <Stack
                        key={i}
                        direction={{ xs: "column", sm: "row" }}
                        justifyContent="space-between"
                        alignItems={{ sm: "center" }}
                        sx={{ px: 2, py: 0.5, bgcolor: showMissing && scores[i] === null ? "rgba(178,63,63,0.08)" : undefined }}
                      >
                        <Typography variant="body2">{t(`feedback360.competencies.${i}`)}</Typography>
                        <RadioGroup
                          row
                          value={scores[i] ?? ""}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setScores((prev) => prev.map((x, j) => (j === i ? v : x)));
                            setSaved(false);
                          }}
                        >
                          {[1, 2, 3, 4, 5].map((v) => (
                            <FormControlLabel key={v} value={v} disabled={readOnly} control={<Radio size="small" />} label={v} labelPlacement="bottom" sx={{ mx: 0.25 }} />
                          ))}
                        </RadioGroup>
                      </Stack>
                    ))}
                  </Stack>
                </Paper>
              )}
              {textLabels.map((label, i) => (
                <TextField
                  key={label}
                  label={t(`feedback360.${label}`)}
                  multiline
                  minRows={2}
                  value={texts[i]}
                  disabled={readOnly}
                  inputProps={{ maxLength: 1000 }}
                  onChange={(e) => {
                    setTexts((prev) => prev.map((x, j) => (j === i ? e.target.value : x)) as [string, string, string]);
                    setSaved(false);
                  }}
                />
              ))}
              {showMissing && missing > 0 && <Alert severity="warning">{t("feedback360.incomplete", { count: missing })}</Alert>}
              {error && <Alert severity="error">{error}</Alert>}
              {saved && <Alert severity="success">{t("feedback360.saved")}</Alert>}
              {!readOnly && (
                <Stack direction="row" justifyContent="flex-end">
                  <Button variant="contained" onClick={handleSave} disabled={saving}>
                    {existing ? t("feedback360.update") : t("feedback360.save")}
                  </Button>
                </Stack>
              )}
            </>
          )}
        </Stack>
      )}
    </Stack>
  );
}
