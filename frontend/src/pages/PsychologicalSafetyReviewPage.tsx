import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import type { Company, Department, EvaluationCampaign, Paginated, PsiReview, PsiVerdict } from "@/api/types";
import ValidationSummary from "@/components/feedback/ValidationSummary";
import PageHeader from "@/components/layout/PageHeader";
import { feedbackBus } from "@/utils/feedbackBus";
import {
  dimensionReading,
  fmtPsi,
  globalReading,
  GLOBAL_READING_COLORS,
  PSI_DIMENSIONS,
  READING_COLORS,
  suggestedVerdict,
  VERDICT_COLORS,
} from "@/utils/psychologicalSafety";
import { useIssues } from "@/utils/validation";

const VERDICTS: PsiVerdict[] = ["SAFE", "WATCH", "UNSAFE"];
const COMMENT_MAX = 2000;
type Reading = ReturnType<typeof globalReading>;

function VerdictChip({ verdict, label }: { verdict: PsiVerdict; label: string }) {
  return (
    <Chip
      size="small"
      label={label}
      sx={{ bgcolor: `${VERDICT_COLORS[verdict]}1f`, color: VERDICT_COLORS[verdict], fontWeight: 700 }}
    />
  );
}

/** Note d'une affirmation, en cinq pastilles : celle de la note est pleine. */
function ScorePills({ score }: { score: number }) {
  return (
    <Stack direction="row" spacing={0.5}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Box
          key={n}
          sx={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            border: "1px solid",
            borderColor: n === score ? "primary.main" : "divider",
            bgcolor: n === score ? "primary.main" : "transparent",
            color: n === score ? "primary.contrastText" : "text.disabled",
          }}
        >
          {n}
        </Box>
      ))}
    </Stack>
  );
}

/**
 * Lecture individuelle du Psychological Safety Index, réservée au super
 * administrateur : pour une entreprise et une campagne, les douze notes de
 * chaque collaborateur, la lecture que ces notes suggèrent, et l'appréciation
 * que le consultant porte sur la personne (safe, à surveiller, non safe).
 * L'entreprise n'a jamais accès à cet écran ni à ces données.
 */
export default function PsychologicalSafetyReviewPage() {
  const { t, i18n } = useTranslation();
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [companyId, setCompanyId] = useState<number | "">("");
  const [campaigns, setCampaigns] = useState<EvaluationCampaign[]>([]);
  const [campaignId, setCampaignId] = useState<number | "">("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [rows, setRows] = useState<PsiReview[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [teamFilter, setTeamFilter] = useState<number | "">("");
  const [readingFilter, setReadingFilter] = useState<Reading | "">("");
  const [verdictFilter, setVerdictFilter] = useState<PsiVerdict | "NONE" | "">("");
  const [search, setSearch] = useState("");
  const [sortByScore, setSortByScore] = useState<"asc" | "desc" | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [detail, setDetail] = useState<PsiReview | null>(null);
  const [draft, setDraft] = useState<{ verdict: PsiVerdict | ""; comment: string }>({ verdict: "", comment: "" });
  const { issues, check, clear } = useIssues();

  useEffect(() => {
    apiClient
      .get<Paginated<Company>>("/companies/", { params: { page_size: 500 } })
      .then((r) => {
        setCompanies(r.data.results);
        if (r.data.results.length) setCompanyId(r.data.results[0].id);
      })
      .catch(() => setCompanies([]));
  }, []);

  // Entreprise choisie : ses campagnes (la plus récente ouverte par défaut) et ses directions.
  useEffect(() => {
    if (companyId === "") return;
    setCampaigns([]);
    setCampaignId("");
    setDepartments([]);
    setTeamFilter("");
    setRows(null);
    apiClient
      .get<Paginated<EvaluationCampaign>>("/evaluation-campaigns/", { params: { company: companyId, page_size: 200 } })
      .then((r) => {
        const sorted = [...r.data.results].sort((a, b) => a.start_date.localeCompare(b.start_date));
        setCampaigns(sorted);
        if (sorted.length) setCampaignId(sorted[sorted.length - 1].id);
      })
      .catch(() => undefined);
    apiClient
      .get<Paginated<Department>>("/departments/", { params: { company: companyId, page_size: 500 } })
      .then((r) => setDepartments(r.data.results))
      .catch(() => undefined);
  }, [companyId]);

  useEffect(() => {
    if (companyId === "" || campaignId === "") return;
    setRows(null);
    setLoadError(false);
    apiClient
      .get<Paginated<PsiReview>>("/psychological-safety-review/", {
        params: { company: companyId, campaign: campaignId, page_size: 2000 },
        silent: true,
      })
      .then((r) => setRows(r.data.results))
      .catch(() => setLoadError(true));
  }, [companyId, campaignId]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = search.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (teamFilter === "" || r.team === teamFilter) &&
        (readingFilter === "" || globalReading(r.global_score) === readingFilter) &&
        (verdictFilter === "" || (verdictFilter === "NONE" ? !r.verdict : r.verdict === verdictFilter)) &&
        (!needle ||
          r.respondent_name.toLowerCase().includes(needle) ||
          (r.respondent_login || "").toLowerCase().includes(needle))
    );
    if (sortByScore) list.sort((a, b) => (sortByScore === "asc" ? 1 : -1) * (a.global_score - b.global_score));
    return list;
  }, [rows, teamFilter, readingFilter, verdictFilter, search, sortByScore]);

  const counts = useMemo(() => {
    const byVerdict: Record<PsiVerdict | "NONE", number> = { SAFE: 0, WATCH: 0, UNSAFE: 0, NONE: 0 };
    const byReading: Record<Reading, number> = { solid: 0, improvable: 0, fragile: 0 };
    (rows ?? []).forEach((r) => {
      byVerdict[r.verdict || "NONE"] += 1;
      byReading[globalReading(r.global_score)] += 1;
    });
    return { byVerdict, byReading };
  }, [rows]);

  const campaign = campaigns.find((c) => c.id === campaignId) ?? null;

  async function saveVerdict(row: PsiReview, verdict: PsiVerdict | "", comment: string) {
    const ok = check([[comment.length > COMMENT_MAX, t("psiReview.commentTooLong", { n: comment.length })]]);
    if (!ok) return false;
    setSavingId(row.id);
    try {
      const r = await apiClient.patch<PsiReview>(`/psychological-safety-review/${row.id}/`, {
        verdict,
        verdict_comment: comment,
      });
      setRows((prev) => (prev ? prev.map((x) => (x.id === row.id ? r.data : x)) : prev));
      feedbackBus.publish({ severity: "success", title: t("psiReview.saved", { name: row.respondent_name }), reasons: [] });
      return true;
    } catch {
      // le toast du client explique le refus
      return false;
    } finally {
      setSavingId(null);
    }
  }

  function openDetail(row: PsiReview) {
    clear();
    setDetail(row);
    setDraft({ verdict: row.verdict, comment: row.verdict_comment });
  }

  const verdictLabel = (v: PsiVerdict) => t(`psiReview.verdicts.${v}`);
  const dateFmt = (iso: string) => new Date(iso).toLocaleDateString(i18n.language === "en" ? "en-GB" : "fr-FR");

  return (
    <Stack spacing={2.5}>
      <PageHeader title={t("psiReview.title")} subtitle={t("psiReview.subtitle")} />

      <Alert severity="warning" icon={<LockOutlinedIcon />}>
        {t("psiReview.confidential")}
      </Alert>

      {companies !== null && companies.length === 0 && <Alert severity="info">{t("psiReview.noCompany")}</Alert>}

      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="center">
        <TextField
          select
          size="small"
          label={t("psiReview.company")}
          value={companyId}
          onChange={(e) => setCompanyId(Number(e.target.value))}
          sx={{ minWidth: 260 }}
        >
          {(companies ?? []).map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label={t("psiReview.campaign")}
          value={campaignId}
          onChange={(e) => setCampaignId(Number(e.target.value))}
          sx={{ minWidth: 200 }}
          disabled={!campaigns.length}
        >
          {[...campaigns].reverse().map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label={t("psiReview.direction")}
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value === "" ? "" : Number(e.target.value))}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">{t("psiReview.allDirections")}</MenuItem>
          {[...departments]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((d) => (
              <MenuItem key={d.id} value={d.id}>
                {d.name}
              </MenuItem>
            ))}
        </TextField>
        <TextField
          select
          size="small"
          label={t("psiReview.reading")}
          value={readingFilter}
          onChange={(e) => setReadingFilter(e.target.value as Reading | "")}
          sx={{ minWidth: 170 }}
        >
          <MenuItem value="">{t("psiReview.allReadings")}</MenuItem>
          {(["solid", "improvable", "fragile"] as Reading[]).map((r) => (
            <MenuItem key={r} value={r}>
              {t(`psiReview.readings.${r}`)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label={t("psiReview.verdict")}
          value={verdictFilter}
          onChange={(e) => setVerdictFilter(e.target.value as PsiVerdict | "NONE" | "")}
          sx={{ minWidth: 190 }}
        >
          <MenuItem value="">{t("psiReview.allVerdicts")}</MenuItem>
          {VERDICTS.map((v) => (
            <MenuItem key={v} value={v}>
              {verdictLabel(v)}
            </MenuItem>
          ))}
          <MenuItem value="NONE">{t("psiReview.noVerdict")}</MenuItem>
        </TextField>
        <TextField
          size="small"
          placeholder={t("psiReview.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 220 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlinedIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Stack>

      {companyId !== "" && campaigns.length === 0 && <Alert severity="info">{t("psiReview.noCampaign")}</Alert>}
      {loadError && <Alert severity="error">{t("psiReview.loadFailed")}</Alert>}
      {issues.length > 0 && !detail && <ValidationSummary issues={issues} onClose={clear} />}

      {rows && rows.length > 0 && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
          <Chip label={t("psiReview.respondents", { n: rows.length })} variant="outlined" />
          {VERDICTS.map((v) => (
            <VerdictChip key={v} verdict={v} label={`${verdictLabel(v)} : ${counts.byVerdict[v]}`} />
          ))}
          <Chip size="small" label={t("psiReview.toReview", { n: counts.byVerdict.NONE })} />
          <Box sx={{ width: 16 }} />
          {(["solid", "improvable", "fragile"] as Reading[]).map((r) => (
            <Typography key={r} variant="caption" sx={{ color: GLOBAL_READING_COLORS[r], fontWeight: 700 }}>
              {t(`psiReview.readings.${r}`)} : {counts.byReading[r]}
            </Typography>
          ))}
        </Stack>
      )}

      {rows && rows.length === 0 && <Alert severity="info">{t("psiReview.noData")}</Alert>}
      {rows && rows.length > 0 && filtered.length === 0 && <Alert severity="info">{t("psiReview.noMatch")}</Alert>}

      {filtered.length > 0 && (
        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: "70vh" }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>{t("psiReview.person")}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{t("psiReview.direction")}</TableCell>
                {PSI_DIMENSIONS.map((k) => (
                  <TableCell key={k} align="center" sx={{ fontWeight: 700 }}>
                    <Tooltip title={t(`psi.dimensionTitle.${k}`)}>
                      <span>{t(`psiReview.dimShort.${k}`)}</span>
                    </Tooltip>
                  </TableCell>
                ))}
                <TableCell align="center" sx={{ fontWeight: 700 }}>
                  <TableSortLabel
                    active={sortByScore !== null}
                    direction={sortByScore ?? "asc"}
                    onClick={() => setSortByScore((s) => (s === "asc" ? "desc" : s === "desc" ? null : "asc"))}
                  >
                    {t("psiReview.global")}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{t("psiReview.reading")}</TableCell>
                <TableCell sx={{ fontWeight: 700, minWidth: 170 }}>{t("psiReview.verdict")}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((row) => {
                const reading = globalReading(row.global_score);
                return (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      <Stack direction="row" spacing={1.25} alignItems="center">
                        <Avatar src={row.respondent_avatar ?? undefined} sx={{ width: 30, height: 30, fontSize: 13 }}>
                          {row.respondent_name.charAt(0)}
                        </Avatar>
                        <Stack sx={{ minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {row.respondent_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {[row.respondent_login, row.respondent_position].filter(Boolean).join(" · ")}
                          </Typography>
                        </Stack>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{row.team_name}</Typography>
                    </TableCell>
                    {PSI_DIMENSIONS.map((k) => {
                      const score = row.dimensions.find((d) => d.key === k)?.score ?? 0;
                      return (
                        <TableCell key={k} align="center" sx={{ color: READING_COLORS[dimensionReading(score)], fontWeight: 700 }}>
                          {fmtPsi(score)}
                        </TableCell>
                      );
                    })}
                    <TableCell align="center" sx={{ fontWeight: 800, color: GLOBAL_READING_COLORS[reading] }}>
                      {fmtPsi(row.global_score)}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: GLOBAL_READING_COLORS[reading], fontWeight: 700 }}>
                        {t(`psiReview.readings.${reading}`)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Select
                        size="small"
                        fullWidth
                        displayEmpty
                        value={row.verdict}
                        disabled={savingId === row.id}
                        onChange={(e) => saveVerdict(row, e.target.value as PsiVerdict | "", row.verdict_comment)}
                        renderValue={(value) =>
                          value ? (
                            <VerdictChip verdict={value as PsiVerdict} label={verdictLabel(value as PsiVerdict)} />
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              {t("psiReview.noVerdict")}
                            </Typography>
                          )
                        }
                      >
                        <MenuItem value="">
                          <Typography variant="body2" color="text.secondary">
                            {t("psiReview.noVerdict")}
                          </Typography>
                        </MenuItem>
                        {VERDICTS.map((v) => (
                          <MenuItem key={v} value={v}>
                            <VerdictChip verdict={v} label={verdictLabel(v)} />
                          </MenuItem>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={t("psiReview.detail")}>
                        <IconButton size="small" onClick={() => openDetail(row)}>
                          <VisibilityOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={!!detail} onClose={() => setDetail(null)} fullWidth maxWidth="md">
        {detail && (
          <>
            <DialogTitle>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Avatar src={detail.respondent_avatar ?? undefined}>{detail.respondent_name.charAt(0)}</Avatar>
                <Box>
                  <Typography variant="h6" fontWeight={700}>
                    {t("psiReview.detailTitle", { name: detail.respondent_name, campaign: campaign?.name ?? detail.campaign_name })}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {[detail.team_name, detail.respondent_position].filter(Boolean).join(" · ")}
                  </Typography>
                </Box>
                <Box sx={{ flexGrow: 1 }} />
                <Box sx={{ textAlign: "right" }}>
                  <Typography sx={{ fontSize: 26, fontWeight: 800, color: GLOBAL_READING_COLORS[globalReading(detail.global_score)] }}>
                    {fmtPsi(detail.global_score)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: GLOBAL_READING_COLORS[globalReading(detail.global_score)], fontWeight: 700 }}>
                    {t(`psi.readingGlobal.${globalReading(detail.global_score)}`)}
                  </Typography>
                </Box>
              </Stack>
            </DialogTitle>
            <DialogContent dividers>
              <Stack spacing={2}>
                {PSI_DIMENSIONS.map((key, d) => {
                  const score = detail.dimensions.find((x) => x.key === key)?.score ?? 0;
                  const reading = dimensionReading(score);
                  return (
                    <Box key={key}>
                      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.75 }}>
                        <Typography variant="subtitle2" fontWeight={800}>
                          {t(`psi.dimension.${key}`)} — {t(`psi.dimensionTitle.${key}`)}
                        </Typography>
                        <Typography variant="subtitle2" sx={{ color: READING_COLORS[reading], fontWeight: 800, whiteSpace: "nowrap", ml: 1 }}>
                          {fmtPsi(score)} · {t(`psi.readingDim.${reading}`)}
                        </Typography>
                      </Stack>
                      <Stack spacing={0.75}>
                        {[0, 1, 2].map((i) => {
                          const index = d * 3 + i;
                          return (
                            <Stack key={index} direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
                              <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                                {index + 1}. {t(`psi.statements.${index}`)}
                              </Typography>
                              <ScorePills score={detail.scores[index]} />
                            </Stack>
                          );
                        })}
                      </Stack>
                    </Box>
                  );
                })}

                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Stack spacing={1.5}>
                    <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                      <TextField
                        select
                        size="small"
                        label={t("psiReview.verdict")}
                        value={draft.verdict}
                        onChange={(e) => setDraft((prev) => ({ ...prev, verdict: e.target.value as PsiVerdict | "" }))}
                        sx={{ minWidth: 200 }}
                      >
                        <MenuItem value="">{t("psiReview.noVerdict")}</MenuItem>
                        {VERDICTS.map((v) => (
                          <MenuItem key={v} value={v}>
                            {verdictLabel(v)}
                          </MenuItem>
                        ))}
                      </TextField>
                      <Typography variant="body2" color="text.secondary">
                        {t("psiReview.suggestion", { verdict: verdictLabel(suggestedVerdict(detail.global_score)) })}
                      </Typography>
                      <Button
                        size="small"
                        onClick={() => setDraft((prev) => ({ ...prev, verdict: suggestedVerdict(detail.global_score) }))}
                      >
                        {t("psiReview.applySuggestion")}
                      </Button>
                    </Stack>
                    <TextField
                      label={t("psiReview.comment")}
                      helperText={`${t("psiReview.commentHint")} ${draft.comment.length} / ${COMMENT_MAX}`}
                      value={draft.comment}
                      onChange={(e) => setDraft((prev) => ({ ...prev, comment: e.target.value }))}
                      multiline
                      minRows={3}
                      fullWidth
                      error={draft.comment.length > COMMENT_MAX}
                    />
                    {detail.verdict && detail.verdict_at && (
                      <Typography variant="caption" color="text.secondary">
                        {t("psiReview.assessedBy", { name: detail.verdict_by_name || "—", date: dateFmt(detail.verdict_at) })}
                      </Typography>
                    )}
                    {issues.length > 0 && <ValidationSummary issues={issues} onClose={clear} />}
                  </Stack>
                </Paper>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetail(null)}>{t("common.close")}</Button>
              <Button
                variant="contained"
                disabled={savingId === detail.id}
                onClick={async () => {
                  if (await saveVerdict(detail, draft.verdict, draft.comment)) setDetail(null);
                }}
              >
                {t("psiReview.save")}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Stack>
  );
}
