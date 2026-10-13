import { Alert, Box, Button, Checkbox, FormControlLabel, Paper, Stack, Switch, Tab, Tabs, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import PageHeader from "@/components/layout/PageHeader";
import type { Company } from "@/api/types";
import { ALWAYS_SHOWN_PATH, catalogFor, SCOPED_ROLES, type ScopedRole } from "@/utils/displayCatalog";
import { hiddenViewsFor, type DisplayScope } from "@/utils/displayScope";

/** Ce qui est montré à un rôle : ses rubriques du menu, et les vues retirées. */
type RoleDraft = { paths: Set<string>; hidden: Set<string> };
type Draft = Record<ScopedRole, RoleDraft>;

function toDraft(scope: DisplayScope): Draft {
  return Object.fromEntries(
    SCOPED_ROLES.map((role) => {
      const all = catalogFor(role).map((item) => item.path);
      return [role, { paths: new Set(scope.nav?.[role] ?? all), hidden: hiddenViewsFor(scope, role) }];
    })
  ) as Draft;
}

/** Réglage enregistré : seul ce qui s'écarte de « tout afficher » est écrit. */
function toScope(draft: Draft): DisplayScope {
  const scope: Required<Pick<DisplayScope, "nav" | "hidden_views_by_role">> = { nav: {}, hidden_views_by_role: {} };
  SCOPED_ROLES.forEach((role) => {
    const catalog = catalogFor(role);
    const shown = catalog.map((item) => item.path).filter((p) => p === ALWAYS_SHOWN_PATH || draft[role].paths.has(p));
    if (shown.length < catalog.length) scope.nav[role] = shown;
    const known = new Set(catalog.flatMap((item) => item.views.map((v) => v.key as string)));
    const hidden = [...draft[role].hidden].filter((v) => known.has(v));
    if (hidden.length) scope.hidden_views_by_role[role] = hidden;
  });
  return scope;
}

/** Réglage, par le super administrateur, des rubriques et sous-rubriques
 * montrées à une entreprise — rôle par rôle. Sert à cadrer une démonstration
 * sur quelques écrans ; n'accorde ni ne retire aucun droit. */
export default function CompanyDisplayScopePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { companyId } = useParams();
  const { user } = useAppSelector((s) => s.auth);
  const [company, setCompany] = useState<Company | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [role, setRole] = useState<ScopedRole>("COMPANY_ADMIN");
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<Company>(`/companies/${companyId}/`)
      .then((r) => {
        setCompany(r.data);
        setDraft(toDraft(r.data.display_scope ?? {}));
      })
      .catch(() => setLoadError(true));
  }, [companyId]);

  if (user?.role !== "SUPER_ADMIN") return <Alert severity="info">{t("displayScope.adminOnly")}</Alert>;

  const change = (update: (current: RoleDraft) => RoleDraft, target: ScopedRole = role) => {
    setDraft((prev) => (prev ? { ...prev, [target]: update(prev[target]) } : prev));
    setSaved(false);
  };
  const toggle = (set: Set<string>, key: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(key);
    else next.delete(key);
    return next;
  };

  async function handleSave() {
    if (!draft) return;
    setError(null);
    setSaving(true);
    try {
      const r = await apiClient.patch<Company>(`/companies/${companyId}/`, { display_scope: toScope(draft) }, { silent: true });
      setCompany(r.data);
      setDraft(toDraft(r.data.display_scope ?? {}));
      setSaved(true);
    } catch (err: any) {
      const detail = err?.response?.data?.display_scope;
      setError(Array.isArray(detail) ? detail.join(" ") : t("displayScope.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const catalog = catalogFor(role);
  const current = draft?.[role];
  const sectionShown = (path: string) => path === ALWAYS_SHOWN_PATH || !!current?.paths.has(path);
  const shownCount = catalog.filter((item) => sectionShown(item.path) && (item.views.length === 0 || item.views.some((v) => !current?.hidden.has(v.key)))).length;

  return (
    <Stack spacing={2.5} maxWidth={1000}>
      <PageHeader
        title={t("displayScope.title", { company: company?.name ?? "" })}
        subtitle={t("displayScope.subtitle")}
      />
      {loadError && <Alert severity="error">{t("displayScope.loadFailed")}</Alert>}
      {draft && current && (
        <>
          <Paper variant="outlined">
            <Tabs value={role} onChange={(_, v) => setRole(v)} sx={{ px: 1, borderBottom: "1px solid", borderColor: "divider" }}>
              {SCOPED_ROLES.map((r) => (
                <Tab key={r} value={r} label={t(`displayScope.role.${r}`)} sx={{ textTransform: "none", fontWeight: 700 }} />
              ))}
            </Tabs>
            <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} sx={{ px: 2, py: 1.25, bgcolor: "action.hover" }}>
              <Typography variant="body2" fontWeight={700}>
                {t("displayScope.summary", { shown: shownCount, total: catalog.length })}
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button size="small" onClick={() => change(() => ({ paths: new Set(catalog.map((i) => i.path)), hidden: new Set() }))}>
                  {t("displayScope.showAll")}
                </Button>
                <Button
                  size="small"
                  onClick={() =>
                    SCOPED_ROLES.filter((r) => r !== role).forEach((r) =>
                      change(() => ({ paths: new Set(current.paths), hidden: new Set(current.hidden) }), r)
                    )
                  }
                >
                  {t("displayScope.copyTo")}
                </Button>
              </Stack>
            </Stack>
            <Stack divider={<Box sx={{ borderTop: "1px solid", borderColor: "divider" }} />}>
              {catalog.map((item) => {
                const shown = sectionShown(item.path);
                const locked = item.path === ALWAYS_SHOWN_PATH;
                const noneLeft = shown && item.views.length > 0 && item.views.every((v) => current.hidden.has(v.key));
                return (
                  <Stack key={item.path} direction={{ xs: "column", md: "row" }} spacing={{ xs: 0.5, md: 2 }} sx={{ px: 2, py: 1.25 }}>
                    <Box sx={{ width: { md: 300 }, flexShrink: 0 }}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={shown}
                            disabled={locked}
                            onChange={(e) => change((c) => ({ ...c, paths: toggle(c.paths, item.path, e.target.checked) }))}
                          />
                        }
                        label={<Typography fontWeight={700}>{t(item.labelKey)}</Typography>}
                      />
                      {locked && (
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ pl: 6 }}>
                          {t("displayScope.alwaysShown")}
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ flex: 1, opacity: shown ? 1 : 0.45 }}>
                      {item.views.length === 0 ? (
                        <Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>
                          {t("displayScope.noViews")}
                        </Typography>
                      ) : (
                        <Stack direction="row" flexWrap="wrap" columnGap={1.5}>
                          {item.views.map((v) => (
                            <FormControlLabel
                              key={v.key}
                              control={
                                <Checkbox
                                  size="small"
                                  checked={!current.hidden.has(v.key)}
                                  disabled={!shown}
                                  onChange={(e) => change((c) => ({ ...c, hidden: toggle(c.hidden, v.key, !e.target.checked) }))}
                                />
                              }
                              label={<Typography variant="body2">{t(v.labelKey)}</Typography>}
                            />
                          ))}
                        </Stack>
                      )}
                      {noneLeft && (
                        <Typography variant="caption" color="warning.main" display="block">
                          {t("displayScope.emptySection")}
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                );
              })}
            </Stack>
          </Paper>
          {error && <Alert severity="error">{error}</Alert>}
          {saved && <Alert severity="success">{t("displayScope.saved")}</Alert>}
          <Stack direction="row" justifyContent="flex-end" spacing={1.5}>
            <Button onClick={() => navigate("/companies")}>{t("displayScope.back")}</Button>
            <Button variant="contained" onClick={handleSave} disabled={saving}>
              {t("displayScope.save")}
            </Button>
          </Stack>
        </>
      )}
    </Stack>
  );
}
