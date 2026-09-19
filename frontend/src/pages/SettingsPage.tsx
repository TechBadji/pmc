import DeleteForeverOutlinedIcon from "@mui/icons-material/DeleteForeverOutlined";
import {
  Alert,
  Box,
  Button,
  Checkbox,
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
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";
import { apiClient } from "@/api/client";
import type { Department, EvaluationCampaign, Paginated } from "@/api/types";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { useUnsavedChanges } from "@/app/unsavedChanges";
import ValidationSummary from "@/components/feedback/ValidationSummary";
import { fetchMe } from "@/features/auth/authSlice";
import { toNumber, useIssues } from "@/utils/validation";

interface CompanySettings {
  id: number;
  name: string;
  sector: string;
  employee_count: number;
  plan: string;
  cohesion_min_respondents: number;
}

interface CatalogueItem {
  key: string;
  group: string;
  campaign_scoped: boolean;
}

interface PreviewItem {
  key: string;
  count: number;
  includes?: { skill_scores: number; skill_notes: number; objectives: number };
}

const GROUP_ORDER = ["evaluations", "cohesion", "teams", "people"];

function CompanySection() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [threshold, setThreshold] = useState("2");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { issues, check, clear, has, messageFor } = useIssues();

  useEffect(() => {
    setLoadFailed(false);
    apiClient
      .get<CompanySettings>("/company-settings/")
      .then((r) => {
        setSettings(r.data);
        setName(r.data.name);
        setSector(r.data.sector ?? "");
        setThreshold(String(r.data.cohesion_min_respondents));
        setDirty(false);
      })
      .catch(() => setLoadFailed(true));
  }, [reloadKey]);

  function edit(setter: (v: string) => void) {
    return (value: string) => {
      setter(value);
      setDirty(true);
      setSaved(false);
      clear();
    };
  }

  const save = useCallback(async () => {
    const value = toNumber(threshold);
    const ok = check([
      [name.trim() === "", t("settings.validation.nameRequired"), "name"],
      [name.trim().length > 255, t("settings.validation.nameTooLong"), "name"],
      [!Number.isInteger(value) || value < 1 || value > 20, t("settings.validation.thresholdInvalid", { value: threshold }), "threshold"],
    ]);
    if (!ok) return;
    setSaving(true);
    try {
      await apiClient.patch("/company-settings/", { name: name.trim(), sector: sector.trim(), cohesion_min_respondents: value });
      setDirty(false);
      setSaved(true);
      dispatch(fetchMe());
    } catch {
      // Le motif est donné par la notification ; les valeurs saisies restent à l'écran.
    } finally {
      setSaving(false);
    }
  }, [check, dispatch, name, sector, t, threshold]);

  useUnsavedChanges(dirty, save);

  if (loadFailed) {
    return (
      <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => setReloadKey((k) => k + 1)}>{t("settings.retry")}</Button>}>
        {t("settings.loadFailed")}
      </Alert>
    );
  }
  if (!settings) return <CircularProgress size={24} />;

  return (
    <Stack spacing={3}>
      <Paper elevation={0} sx={{ p: 2.5, border: "1px solid", borderColor: "divider" }}>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
          {t("settings.company.title")}
        </Typography>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
          <TextField
            label={t("settings.company.name")}
            value={name}
            error={has("name")}
            helperText={messageFor("name")}
            onChange={(e) => edit(setName)(e.target.value)}
          />
          <TextField label={t("settings.company.sector")} value={sector} onChange={(e) => edit(setSector)(e.target.value)} />
          <TextField label={t("settings.company.plan")} value={settings.plan} disabled />
          <TextField label={t("settings.company.headcount")} value={settings.employee_count} disabled />
        </Box>
      </Paper>

      <Paper elevation={0} sx={{ p: 2.5, border: "1px solid", borderColor: "divider" }}>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
          {t("settings.cohesion.title")}
        </Typography>
        <TextField
          label={t("settings.cohesion.threshold")}
          value={threshold}
          onChange={(e) => edit(setThreshold)(e.target.value)}
          error={has("threshold")}
          helperText={messageFor("threshold") ?? t("settings.cohesion.help")}
          inputProps={{ inputMode: "numeric" }}
          sx={{ maxWidth: 520 }}
          fullWidth
        />
      </Paper>

      <ValidationSummary issues={issues} onClose={clear} />
      <Stack direction="row" spacing={2} alignItems="center">
        <Button variant="contained" onClick={save} disabled={saving}>
          {saving ? <CircularProgress size={18} color="inherit" /> : t("settings.company.save")}
        </Button>
        {dirty && <Typography sx={{ color: "warning.main", fontWeight: 700 }}>{t("settings.company.unsaved")}</Typography>}
        {saved && !dirty && <Typography sx={{ color: "success.main", fontWeight: 700 }}>{t("settings.company.saved")}</Typography>}
      </Stack>
    </Stack>
  );
}

function ResetSection() {
  const { t } = useTranslation();
  const [campaigns, setCampaigns] = useState<EvaluationCampaign[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
  const [phrase, setPhrase] = useState("REMISE A ZERO");
  const [scope, setScope] = useState<"all" | "some">("all");
  const [selectedCampaigns, setSelectedCampaigns] = useState<number[]>([]);
  const [department, setDepartment] = useState<number | "">("");
  const [keys, setKeys] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ items: PreviewItem[]; total: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const { issues, check, clear } = useIssues();
  const dialogIssues = useIssues();

  useEffect(() => {
    apiClient
      .get<Paginated<EvaluationCampaign>>("/evaluation-campaigns/", { params: { page_size: 100 } })
      .then((r) => setCampaigns([...r.data.results].sort((a, b) => a.start_date.localeCompare(b.start_date))))
      .catch(() => undefined);
    apiClient
      .get<Paginated<Department>>("/departments/", { params: { page_size: 500 } })
      .then((r) => setDepartments(r.data.results))
      .catch(() => undefined);
    apiClient
      .get<{ confirmation: string; rubriques: CatalogueItem[] }>("/company-settings/data-reset/")
      .then((r) => {
        setCatalogue(r.data.rubriques);
        setPhrase(r.data.confirmation);
      })
      .catch(() => undefined);
  }, []);

  const byGroup = useMemo(
    () => GROUP_ORDER.map((group) => ({ group, items: catalogue.filter((c) => c.group === group) })).filter((g) => g.items.length),
    [catalogue]
  );
  const allCampaigns = scope === "all";

  function invalidate() {
    setPreview(null);
    setResult(null);
    clear();
  }

  function chooseScope(next: "all" | "some") {
    setScope(next);
    if (next === "some") setKeys((prev) => prev.filter((k) => catalogue.find((c) => c.key === k)?.campaign_scoped));
    invalidate();
  }

  function toggleKey(key: string) {
    setKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    invalidate();
  }

  function toggleCampaign(id: number) {
    setSelectedCampaigns((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
    invalidate();
  }

  function selectableKeys() {
    return catalogue.filter((c) => allCampaigns || c.campaign_scoped).map((c) => c.key);
  }

  function payload() {
    return {
      rubriques: keys,
      campaigns: allCampaigns ? "all" : selectedCampaigns,
      department: department === "" ? null : department,
    };
  }

  function validateScope(): boolean {
    return check([
      [keys.length === 0, t("settings.validation.noRubrique")],
      [!allCampaigns && selectedCampaigns.length === 0, t("settings.validation.noCampaign")],
    ]);
  }

  async function runPreview() {
    if (!validateScope()) return;
    setPreviewing(true);
    setResult(null);
    try {
      const r = await apiClient.post<{ items: PreviewItem[]; total: number }>("/company-settings/data-reset/preview/", payload());
      setPreview(r.data);
    } catch {
      setPreview(null);
    } finally {
      setPreviewing(false);
    }
  }

  async function runReset() {
    const typed = confirmText
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .trim()
      .replace(/\s+/g, " ");
    if (!dialogIssues.check([[typed !== phrase, t("settings.validation.wrongConfirmation", { phrase })]])) return;
    setRunning(true);
    try {
      const r = await apiClient.post<{ total: number }>("/company-settings/data-reset/run/", { ...payload(), confirm: confirmText });
      setResult(r.data.total);
      setPreview(null);
      setDialogOpen(false);
      setConfirmText("");
    } catch {
      // Le motif du refus est donné par la notification ; rien n'a été supprimé.
    } finally {
      setRunning(false);
    }
  }

  return (
    <Paper elevation={0} sx={{ p: 2.5, border: "1px solid", borderColor: "error.light" }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h6" fontWeight={700}>
            {t("settings.reset.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t("settings.reset.intro")}
          </Typography>
        </Box>
        <Alert severity="warning">{t("settings.reset.warning")}</Alert>

        <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
          <Stack spacing={1}>
            <Typography variant="subtitle2" fontWeight={700}>
              {t("settings.reset.campaigns")}
            </Typography>
            <RadioGroup value={scope} onChange={(e) => chooseScope(e.target.value as "all" | "some")}>
              <FormControlLabel value="all" control={<Radio size="small" />} label={t("settings.reset.allCampaigns")} />
              <FormControlLabel value="some" control={<Radio size="small" />} label={t("settings.reset.someCampaigns")} />
            </RadioGroup>
            {scope === "some" && (
              <Stack sx={{ pl: 3 }}>
                {campaigns.map((c) => (
                  <FormControlLabel
                    key={c.id}
                    control={<Checkbox size="small" checked={selectedCampaigns.includes(c.id)} onChange={() => toggleCampaign(c.id)} />}
                    label={t("settings.reset.campaignPeriod", { name: c.name, start: c.start_date, end: c.end_date })}
                  />
                ))}
              </Stack>
            )}
          </Stack>
          <TextField
            select
            size="small"
            label={t("settings.reset.department")}
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value === "" ? "" : Number(e.target.value));
              invalidate();
            }}
            sx={{ maxWidth: 360, alignSelf: "flex-start" }}
          >
            <MenuItem value="">{t("settings.reset.allDepartments")}</MenuItem>
            {departments.map((d) => (
              <MenuItem key={d.id} value={d.id}>
                {d.name}
              </MenuItem>
            ))}
          </TextField>
        </Box>

        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="subtitle2" fontWeight={700}>
              {t("settings.reset.rubriques")}
            </Typography>
            <Button size="small" onClick={() => { setKeys(selectableKeys()); invalidate(); }}>
              {t("settings.reset.selectAll")}
            </Button>
            <Button size="small" onClick={() => { setKeys([]); invalidate(); }}>
              {t("settings.reset.selectNone")}
            </Button>
          </Stack>
          {byGroup.map(({ group, items }) => (
            <Box key={group}>
              <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: "uppercase" }}>
                {t(`settings.reset.groups.${group}`)}
              </Typography>
              {items.map((item) => {
                const blocked = !allCampaigns && !item.campaign_scoped;
                return (
                  <Box key={item.key}>
                    <FormControlLabel
                      disabled={blocked}
                      control={<Checkbox size="small" checked={keys.includes(item.key)} onChange={() => toggleKey(item.key)} />}
                      label={
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {t(`settings.reset.items.${item.key}.label`)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {blocked ? t("settings.reset.needsAllCampaigns") : t(`settings.reset.items.${item.key}.help`)}
                          </Typography>
                        </Box>
                      }
                      sx={{ alignItems: "flex-start", my: 0.25 }}
                    />
                  </Box>
                );
              })}
            </Box>
          ))}
        </Stack>

        <ValidationSummary issues={issues} onClose={clear} />

        <Stack direction="row" spacing={2} alignItems="center">
          <Button variant="outlined" onClick={runPreview} disabled={previewing}>
            {previewing ? <CircularProgress size={18} /> : t("settings.reset.preview")}
          </Button>
        </Stack>

        {result !== null && <Alert severity="success">{t("settings.reset.done", { count: result })}</Alert>}

        {preview && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
              {t("settings.reset.previewTitle")}
            </Typography>
            {preview.total === 0 ? (
              <Alert severity="info">{t("settings.reset.previewEmpty")}</Alert>
            ) : (
              <Stack spacing={0.75}>
                {preview.items.map((item) => (
                  <Box key={item.key}>
                    <Stack direction="row" justifyContent="space-between" spacing={2}>
                      <Typography variant="body2">{t(`settings.reset.items.${item.key}.label`)}</Typography>
                      <Typography variant="body2" fontWeight={700}>
                        {t("settings.reset.count", { count: item.count })}
                      </Typography>
                    </Stack>
                    {item.includes && item.count > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        {t("settings.reset.includes", item.includes)}
                      </Typography>
                    )}
                  </Box>
                ))}
                <Typography variant="body2" fontWeight={800} sx={{ pt: 1 }}>
                  {t("settings.reset.total", { count: preview.total })}
                </Typography>
                <Box sx={{ pt: 1 }}>
                  <Button
                    variant="contained"
                    color="error"
                    startIcon={<DeleteForeverOutlinedIcon />}
                    onClick={() => {
                      setConfirmText("");
                      dialogIssues.clear();
                      setDialogOpen(true);
                    }}
                  >
                    {t("settings.reset.run")}
                  </Button>
                </Box>
              </Stack>
            )}
          </Paper>
        )}
      </Stack>

      <Dialog open={dialogOpen} onClose={() => !running && setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t("settings.reset.dialogTitle")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="error">{t("settings.reset.dialogText", { count: preview?.total ?? 0 })}</Alert>
            <TextField
              autoFocus
              fullWidth
              label={t("settings.reset.dialogType", { phrase })}
              value={confirmText}
              onChange={(e) => {
                setConfirmText(e.target.value);
                dialogIssues.clear();
              }}
              error={dialogIssues.issues.length > 0}
              helperText={dialogIssues.issues[0]?.message}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={running}>
            {t("settings.reset.cancel")}
          </Button>
          <Button variant="contained" color="error" onClick={runReset} disabled={running}>
            {running ? <CircularProgress size={18} color="inherit" /> : t("settings.reset.confirm")}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

const SHORTCUTS = [
  { to: "/evaluation-campaigns", key: "campaigns" },
  { to: "/teams", key: "teams" },
  { to: "/skills", key: "skills" },
  { to: "/password-requests", key: "passwords" },
];

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  if (user?.role !== "COMPANY_ADMIN") return <Alert severity="warning">{t("settings.notAllowed")}</Alert>;
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" fontWeight={700}>
          {t("settings.title")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("settings.intro")}
        </Typography>
      </Box>
      <CompanySection />
      <Box>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5 }}>
          {t("settings.shortcuts.title")}
        </Typography>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(4, 1fr)" } }}>
          {SHORTCUTS.map((s) => (
            <Paper
              key={s.key}
              component={RouterLink}
              to={s.to}
              elevation={0}
              sx={{ p: 2, border: "1px solid", borderColor: "divider", textDecoration: "none", color: "inherit", "&:hover": { borderColor: "primary.main" } }}
            >
              <Typography fontWeight={700}>{t(`settings.shortcuts.${s.key}`)}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t(`settings.shortcuts.${s.key}Help`)}
              </Typography>
            </Paper>
          ))}
        </Box>
      </Box>
      <ResetSection />
    </Stack>
  );
}
