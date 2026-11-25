import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import PageHeader from "@/components/layout/PageHeader";
import type { Company, Paginated, UserRecord } from "@/api/types";
import {
  ALWAYS_SHOWN_PATH,
  catalogFor,
  catalogForRoles,
  SCOPED_ROLES,
  type CatalogItem,
  type ScopedRole,
} from "@/utils/displayCatalog";
import { hiddenViewsFor, normalizePosition, type DisplayScope, type ScopeProfile } from "@/utils/displayScope";

/** Ce qui est montré à un rôle, une fonction ou une personne : ses rubriques du menu, et les vues retirées. */
type ProfileDraft = { paths: Set<string>; hidden: Set<string> };
type Draft = {
  roles: Record<ScopedRole, ProfileDraft>;
  positions: Record<string, ProfileDraft>;
  users: Record<string, ProfileDraft>;
};
type Level = "roles" | "positions" | "users";

const isScoped = (role: string): role is ScopedRole => (SCOPED_ROLES as readonly string[]).includes(role);
const allPaths = (catalog: CatalogItem[]) => new Set(catalog.map((i) => i.path));
const copy = (p: ProfileDraft): ProfileDraft => ({ paths: new Set(p.paths), hidden: new Set(p.hidden) });

function fromProfile(profile: ScopeProfile, catalog: CatalogItem[]): ProfileDraft {
  return { paths: new Set(profile.nav ?? allPaths(catalog)), hidden: new Set(profile.hidden_views ?? []) };
}

/** Réglage enregistré : seul ce qui s'écarte de « tout afficher » est écrit. */
function toProfile(draft: ProfileDraft, catalog: CatalogItem[]): ScopeProfile {
  const shown = catalog.map((i) => i.path).filter((p) => p === ALWAYS_SHOWN_PATH || draft.paths.has(p));
  const known = new Set(catalog.flatMap((i) => i.views.map((v) => v.key as string)));
  const profile: ScopeProfile = { hidden_views: [...draft.hidden].filter((v) => known.has(v)) };
  if (shown.length < catalog.length) profile.nav = shown;
  return profile;
}

/** Réglage, par le super administrateur, des rubriques et sous-rubriques
 * montrées dans une entreprise — par rôle, par fonction, ou pour une personne.
 * Le plus précis l'emporte : personne, puis fonction, puis rôle. Sert à cadrer
 * une démonstration ou un déploiement ; n'accorde ni ne retire aucun droit. */
export default function CompanyDisplayScopePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { companyId } = useParams();
  const { user } = useAppSelector((s) => s.auth);
  const [company, setCompany] = useState<Company | null>(null);
  const [people, setPeople] = useState<UserRecord[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [level, setLevel] = useState<Level>("roles");
  const [role, setRole] = useState<ScopedRole>("COMPANY_ADMIN");
  const [position, setPosition] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Fonctions tenues dans l'entreprise : libellé, rôles de ceux qui la tiennent, effectif. */
  const positions = useMemo(() => {
    const map = new Map<string, { label: string; roles: Set<ScopedRole>; count: number }>();
    people.forEach((p) => {
      const key = normalizePosition(p.position ?? "");
      if (!key || !isScoped(p.role)) return;
      const entry = map.get(key) ?? { label: p.position.trim(), roles: new Set<ScopedRole>(), count: 0 };
      entry.roles.add(p.role);
      entry.count += 1;
      map.set(key, entry);
    });
    return [...map.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => a.label.localeCompare(b.label));
  }, [people]);
  const scopedPeople = useMemo(() => people.filter((p) => isScoped(p.role)), [people]);
  const personById = (id: string) => scopedPeople.find((p) => String(p.id) === id);
  const positionCatalog = (key: string) => {
    const roles = positions.find((p) => p.key === key)?.roles;
    return catalogForRoles(roles && roles.size ? SCOPED_ROLES.filter((r) => roles.has(r)) : SCOPED_ROLES);
  };
  const personCatalog = (id: string) => {
    const r = personById(id)?.role;
    return catalogFor(r && isScoped(r) ? r : "MEMBER");
  };

  useEffect(() => {
    Promise.all([
      apiClient.get<Company>(`/companies/${companyId}/`),
      apiClient.get<Paginated<UserRecord>>("/users/", { params: { company: companyId, page_size: 1000 } }),
    ])
      .then(([c, u]) => {
        setCompany(c.data);
        setPeople(u.data.results);
        setDraft(toDraft(c.data.display_scope ?? {}));
      })
      .catch(() => setLoadError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  function toDraft(scope: DisplayScope): Draft {
    const roles = Object.fromEntries(
      SCOPED_ROLES.map((r) => [r, { paths: new Set(scope.nav?.[r] ?? allPaths(catalogFor(r))), hidden: hiddenViewsFor(scope, r) }])
    ) as Record<ScopedRole, ProfileDraft>;
    const positionsDraft = Object.fromEntries(
      Object.entries(scope.by_position ?? {}).map(([k, p]) => [k, fromProfile(p, catalogForRoles(SCOPED_ROLES))])
    );
    const users = Object.fromEntries(Object.entries(scope.by_user ?? {}).map(([k, p]) => [k, fromProfile(p, catalogForRoles(SCOPED_ROLES))]));
    return { roles, positions: positionsDraft, users };
  }

  function toScope(d: Draft): DisplayScope {
    const scope: DisplayScope = { nav: {}, hidden_views_by_role: {}, by_position: {}, by_user: {} };
    SCOPED_ROLES.forEach((r) => {
      const p = toProfile(d.roles[r], catalogFor(r));
      if (p.nav) scope.nav![r] = p.nav;
      if (p.hidden_views.length) scope.hidden_views_by_role![r] = p.hidden_views;
    });
    Object.entries(d.positions).forEach(([k, p]) => (scope.by_position![k] = toProfile(p, positionCatalog(k))));
    Object.entries(d.users).forEach(([k, p]) => {
      if (personById(k)) scope.by_user![k] = toProfile(p, personCatalog(k));
    });
    return scope;
  }

  if (user?.role !== "SUPER_ADMIN") return <Alert severity="info">{t("displayScope.adminOnly")}</Alert>;

  const touch = (update: (d: Draft) => Draft) => {
    setDraft((prev) => (prev ? update(prev) : prev));
    setSaved(false);
  };

  /** Réglage dont une personne hérite aujourd'hui, et d'où il vient. */
  const inheritedFor = (id: string): { from: "position" | "role"; profile: ProfileDraft; label: string } | null => {
    const p = personById(id);
    if (!p || !draft || !isScoped(p.role)) return null;
    const key = normalizePosition(p.position ?? "");
    if (key && draft.positions[key]) return { from: "position", profile: draft.positions[key], label: p.position.trim() };
    return { from: "role", profile: draft.roles[p.role], label: t(`displayScope.role.${p.role}`) };
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

  const positionLabel = (key: string) => positions.find((p) => p.key === key)?.label ?? key;
  const personLabel = (p: UserRecord) => `${p.full_name || p.generated_login} · ${p.generated_login}${p.position ? ` — ${p.position}` : ""}`;
  const shownPositions = positions.filter((p) => !filter || p.label.toLowerCase().includes(filter.toLowerCase()));

  return (
    <Stack spacing={2.5} maxWidth={1100}>
      <PageHeader title={t("displayScope.title", { company: company?.name ?? "" })} subtitle={t("displayScope.subtitle")} />
      {loadError && <Alert severity="error">{t("displayScope.loadFailed")}</Alert>}
      {draft && (
        <>
          <Tabs value={level} onChange={(_, v) => setLevel(v)} sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
            <Tab value="roles" label={t("displayScope.level.roles")} sx={{ textTransform: "none", fontWeight: 700 }} />
            <Tab
              value="positions"
              label={t("displayScope.level.positions", { count: Object.keys(draft.positions).length })}
              sx={{ textTransform: "none", fontWeight: 700 }}
            />
            <Tab
              value="users"
              label={t("displayScope.level.users", { count: Object.keys(draft.users).length })}
              sx={{ textTransform: "none", fontWeight: 700 }}
            />
          </Tabs>
          <Typography variant="body2" color="text.secondary">
            {t(`displayScope.levelHelp.${level}`)}
          </Typography>

          {level === "roles" && (
            <Paper variant="outlined">
              <Tabs value={role} onChange={(_, v) => setRole(v)} sx={{ px: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                {SCOPED_ROLES.map((r) => (
                  <Tab key={r} value={r} label={t(`displayScope.role.${r}`)} sx={{ textTransform: "none", fontWeight: 700 }} />
                ))}
              </Tabs>
              <ScopeEditor
                catalog={catalogFor(role)}
                value={draft.roles[role]}
                onChange={(v) => touch((d) => ({ ...d, roles: { ...d.roles, [role]: v } }))}
                extraAction={{
                  label: t("displayScope.copyTo"),
                  onClick: () =>
                    touch((d) => ({
                      ...d,
                      roles: Object.fromEntries(SCOPED_ROLES.map((r) => [r, copy(d.roles[role])])) as Draft["roles"],
                    })),
                }}
              />
            </Paper>
          )}

          {level === "positions" && (
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="flex-start">
              <Paper variant="outlined" sx={{ width: { xs: "100%", md: 320 }, flexShrink: 0 }}>
                <Box sx={{ p: 1.5 }}>
                  <TextField size="small" fullWidth placeholder={t("displayScope.searchPosition")} value={filter} onChange={(e) => setFilter(e.target.value)} />
                </Box>
                {positions.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 2 }}>
                    {t("displayScope.noPositions")}
                  </Typography>
                ) : (
                  <List dense sx={{ maxHeight: 520, overflow: "auto", pt: 0 }}>
                    {shownPositions.map((p) => (
                      <ListItemButton key={p.key} selected={position === p.key} onClick={() => setPosition(p.key)}>
                        <ListItemText
                          primary={p.label}
                          secondary={t("displayScope.holders", { count: p.count })}
                          primaryTypographyProps={{ fontWeight: draft.positions[p.key] ? 700 : 400 }}
                        />
                        {draft.positions[p.key] && <Chip size="small" color="primary" label={t("displayScope.custom")} />}
                      </ListItemButton>
                    ))}
                  </List>
                )}
              </Paper>
              <Box sx={{ flex: 1, width: "100%" }}>
                {position ? (
                  <OverrideCard
                    title={positionLabel(position)}
                    enabled={!!draft.positions[position]}
                    inheritedNote={t("displayScope.inheritsRole")}
                    onEnable={(on) =>
                      touch((d) => {
                        const next = { ...d.positions };
                        if (on) {
                          const firstRole = [...(positions.find((p) => p.key === position)?.roles ?? [])][0] ?? "MEMBER";
                          next[position] = copy(d.roles[firstRole]);
                        } else delete next[position];
                        return { ...d, positions: next };
                      })
                    }
                  >
                    {draft.positions[position] && (
                      <ScopeEditor
                        catalog={positionCatalog(position)}
                        value={draft.positions[position]}
                        onChange={(v) => touch((d) => ({ ...d, positions: { ...d.positions, [position]: v } }))}
                      />
                    )}
                  </OverrideCard>
                ) : (
                  <Alert severity="info">{t("displayScope.pickPosition")}</Alert>
                )}
              </Box>
            </Stack>
          )}

          {level === "users" && (
            <Stack spacing={2}>
              <Autocomplete
                options={scopedPeople}
                getOptionLabel={personLabel}
                value={personId ? personById(personId) ?? null : null}
                onChange={(_, p) => setPersonId(p ? String(p.id) : null)}
                renderInput={(params) => <TextField {...params} label={t("displayScope.searchPerson")} />}
              />
              {Object.keys(draft.users).length > 0 && (
                <Stack direction="row" flexWrap="wrap" gap={1}>
                  {Object.keys(draft.users).map((id) => {
                    const p = personById(id);
                    return (
                      <Chip
                        key={id}
                        color={id === personId ? "primary" : "default"}
                        label={p ? p.full_name || p.generated_login : t("displayScope.unknownPerson")}
                        onClick={() => setPersonId(id)}
                        onDelete={() =>
                          touch((d) => {
                            const users = { ...d.users };
                            delete users[id];
                            return { ...d, users };
                          })
                        }
                      />
                    );
                  })}
                </Stack>
              )}
              {personId && personById(personId) ? (
                (() => {
                  const inherited = inheritedFor(personId);
                  return (
                    <OverrideCard
                      title={personLabel(personById(personId)!)}
                      enabled={!!draft.users[personId]}
                      inheritedNote={
                        inherited?.from === "position"
                          ? t("displayScope.inheritsPosition", { position: inherited.label })
                          : t("displayScope.inheritsRoleNamed", { role: inherited?.label ?? "" })
                      }
                      onEnable={(on) =>
                        touch((d) => {
                          const users = { ...d.users };
                          if (on && inherited) users[personId] = copy(inherited.profile);
                          else delete users[personId];
                          return { ...d, users };
                        })
                      }
                    >
                      {draft.users[personId] && (
                        <ScopeEditor
                          catalog={personCatalog(personId)}
                          value={draft.users[personId]}
                          onChange={(v) => touch((d) => ({ ...d, users: { ...d.users, [personId]: v } }))}
                        />
                      )}
                    </OverrideCard>
                  );
                })()
              ) : (
                <Alert severity="info">{t("displayScope.pickPerson")}</Alert>
              )}
            </Stack>
          )}

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

/** Cadre d'un réglage propre (fonction ou personne) : tant qu'il est éteint, l'héritage s'applique. */
function OverrideCard(props: {
  title: string;
  enabled: boolean;
  inheritedNote: string;
  onEnable: (on: boolean) => void;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Paper variant="outlined">
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} sx={{ px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
        <Typography fontWeight={700}>{props.title}</Typography>
        <FormControlLabel
          control={<Switch checked={props.enabled} onChange={(e) => props.onEnable(e.target.checked)} />}
          label={<Typography variant="body2">{t("displayScope.customToggle")}</Typography>}
        />
      </Stack>
      {props.enabled ? (
        props.children
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 2 }}>
          {props.inheritedNote}
        </Typography>
      )}
    </Paper>
  );
}

/** Interrupteur par rubrique du menu, case par sous-rubrique. */
function ScopeEditor(props: {
  catalog: CatalogItem[];
  value: ProfileDraft;
  onChange: (v: ProfileDraft) => void;
  extraAction?: { label: string; onClick: () => void };
}) {
  const { t } = useTranslation();
  const { catalog, value: current, onChange } = props;
  const toggle = (set: Set<string>, key: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(key);
    else next.delete(key);
    return next;
  };
  const sectionShown = (path: string) => path === ALWAYS_SHOWN_PATH || current.paths.has(path);
  const shownCount = catalog.filter((item) => sectionShown(item.path) && (item.views.length === 0 || item.views.some((v) => !current.hidden.has(v.key)))).length;

  return (
    <>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} sx={{ px: 2, py: 1.25, bgcolor: "action.hover" }}>
        <Typography variant="body2" fontWeight={700}>
          {t("displayScope.summary", { shown: shownCount, total: catalog.length })}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button size="small" onClick={() => onChange({ paths: new Set(catalog.map((i) => i.path)), hidden: new Set() })}>
            {t("displayScope.showAll")}
          </Button>
          <Button size="small" onClick={() => onChange({ paths: new Set([ALWAYS_SHOWN_PATH]), hidden: new Set() })}>
            {t("displayScope.hideAll")}
          </Button>
          {props.extraAction && (
            <Button size="small" onClick={props.extraAction.onClick}>
              {props.extraAction.label}
            </Button>
          )}
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
                      onChange={(e) => onChange({ ...current, paths: toggle(current.paths, item.path, e.target.checked) })}
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
                            onChange={(e) => onChange({ ...current, hidden: toggle(current.hidden, v.key, !e.target.checked) })}
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
    </>
  );
}
