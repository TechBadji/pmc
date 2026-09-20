import { Alert, Avatar, Box, Button, Checkbox, Chip, Paper, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, Tooltip, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { useUnsavedChanges } from "@/app/unsavedChanges";

type Rubric = "COHESION" | "ID3A" | "EVALUATIONS";

interface Director {
  id: number;
  name: string;
  position: string;
  avatar: string | null;
  department_name: string;
  own: number[];
}
interface Direction {
  id: number;
  name: string;
  manager_name: string;
}
interface Payload {
  rubrics: Rubric[];
  directors: Director[];
  directions: Direction[];
  grants: { viewer: number; department: number; rubrics: Rubric[] }[];
}

const cell = (rubric: Rubric, viewer: number, department: number) => `${rubric}:${viewer}:${department}`;

/**
 * Accès entre directions : le CEO décide quel directeur peut consulter, en
 * lecture seule, quelle direction — rubrique par rubrique.
 *
 * Une grille par rubrique (onglets) : les directeurs en lignes, les directions
 * en colonnes, une case par autorisation. Sa propre direction est grisée. Des
 * raccourcis évitent de cocher case par case : tout autoriser / tout retirer,
 * une ligne entière (« ce directeur voit tout »), une colonne entière (« cette
 * direction est ouverte à tous »). Rien n'est enregistré avant « Enregistrer ».
 */
export default function PeerAccessSection() {
  const { t } = useTranslation();
  const [data, setData] = useState<Payload | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [tab, setTab] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toSet = (p: Payload) => {
    const set = new Set<string>();
    p.grants.forEach((g) => g.rubrics.forEach((r) => set.add(cell(r, g.viewer, g.department))));
    return set;
  };

  const load = useCallback(() => {
    setLoadFailed(false);
    apiClient
      .get<Payload>("/company-settings/peer-access/")
      .then((r) => {
        setData(r.data);
        const set = toSet(r.data);
        setChecked(set);
        setSaved(new Set(set));
      })
      .catch(() => setLoadFailed(true));
  }, []);
  useEffect(load, [load]);

  const dirty = useMemo(() => checked.size !== saved.size || [...checked].some((k) => !saved.has(k)), [checked, saved]);

  const save = useCallback(async () => {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      const byPair = new Map<string, { viewer: number; department: number; rubrics: string[] }>();
      checked.forEach((k) => {
        const [rubric, viewer, department] = k.split(":");
        const key = `${viewer}:${department}`;
        const entry = byPair.get(key) ?? { viewer: Number(viewer), department: Number(department), rubrics: [] };
        entry.rubrics.push(rubric);
        byPair.set(key, entry);
      });
      const r = await apiClient.put<Payload>("/company-settings/peer-access/", { grants: [...byPair.values()] });
      setData(r.data);
      const set = toSet(r.data);
      setChecked(set);
      setSaved(new Set(set));
      setJustSaved(true);
    } catch (err: any) {
      const d = err?.response?.data;
      const detail = d && typeof d === "object" ? Object.values(d).flat().join(" ") : "";
      setError(detail || t("settings.peerAccess.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [checked, data, t]);

  useUnsavedChanges(dirty, save);

  if (loadFailed) {
    return (
      <Alert severity="error" action={<Button color="inherit" size="small" onClick={load}>{t("settings.retry")}</Button>}>
        {t("settings.peerAccess.loadFailed")}
      </Alert>
    );
  }
  if (!data) return null;

  const rubric = data.rubrics[tab];
  const canView = (d: Director, dir: Direction) => !d.own.includes(dir.id);
  const setMany = (keys: string[], on: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
      return next;
    });
    setJustSaved(false);
  };
  const rowKeys = (d: Director) => data.directions.filter((dir) => canView(d, dir)).map((dir) => cell(rubric, d.id, dir.id));
  const colKeys = (dir: Direction) => data.directors.filter((d) => canView(d, dir)).map((d) => cell(rubric, d.id, dir.id));
  const allKeys = data.directors.flatMap(rowKeys);
  const countFor = (r: Rubric) => [...checked].filter((k) => k.startsWith(`${r}:`)).length;
  const state = (keys: string[]) => {
    const n = keys.filter((k) => checked.has(k)).length;
    return { all: keys.length > 0 && n === keys.length, some: n > 0 && n < keys.length };
  };

  return (
    <Paper elevation={0} sx={{ p: 2.5, border: "1px solid", borderColor: "divider" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
        {t("settings.peerAccess.title")}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 780 }}>
        {t("settings.peerAccess.intro")}
      </Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: "1px solid", borderColor: "divider", mb: 2 }}>
        {data.rubrics.map((r) => (
          <Tab key={r} label={`${t(`settings.peerAccess.rubric.${r}`)} (${countFor(r)})`} />
        ))}
      </Tabs>

      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 260 }}>
          {t(`settings.peerAccess.help.${rubric}`)}
        </Typography>
        <Button size="small" variant="outlined" onClick={() => setMany(allKeys, true)}>
          {t("settings.peerAccess.allowAll")}
        </Button>
        <Button size="small" variant="outlined" color="inherit" onClick={() => setMany(allKeys, false)}>
          {t("settings.peerAccess.removeAll")}
        </Button>
      </Stack>

      <Box sx={{ overflow: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1, maxHeight: 620 }}>
        <Table size="small" stickyHeader sx={{ "& .MuiTableCell-root": { px: 0.5 } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 230, pl: 1.5, fontWeight: 700, verticalAlign: "bottom" }}>
                {t("settings.peerAccess.viewer")} → {t("settings.peerAccess.viewed")}
              </TableCell>
              {data.directions.map((dir) => {
                const s = state(colKeys(dir));
                return (
                  <TableCell key={dir.id} align="center" sx={{ width: 64, verticalAlign: "bottom", pb: 0.5 }}>
                    <Tooltip title={`${dir.name}${dir.manager_name ? ` — ${dir.manager_name}` : ""} : ${t("settings.peerAccess.columnHint")}`}>
                      <Stack alignItems="center" spacing={0.25}>
                        <Typography
                          variant="caption"
                          fontWeight={700}
                          sx={{ writingMode: "vertical-rl", transform: "rotate(180deg)", maxHeight: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        >
                          {dir.name}
                        </Typography>
                        <Checkbox size="small" checked={s.all} indeterminate={s.some} onChange={(e) => setMany(colKeys(dir), e.target.checked)} inputProps={{ "aria-label": dir.name }} />
                      </Stack>
                    </Tooltip>
                  </TableCell>
                );
              })}
              <TableCell align="center" sx={{ width: 70, fontWeight: 700, verticalAlign: "bottom" }}>
                {t("settings.peerAccess.all")}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.directors.map((d) => {
              const keys = rowKeys(d);
              const s = state(keys);
              const count = keys.filter((k) => checked.has(k)).length;
              return (
                <TableRow key={d.id} hover>
                  <TableCell sx={{ pl: 1.5 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Avatar src={d.avatar ?? undefined} sx={{ width: 30, height: 30, fontSize: 13 }}>
                        {d.name.charAt(0)}
                      </Avatar>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="body2" fontWeight={700} noWrap>
                          {d.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap display="block">
                          {d.department_name || d.position}
                        </Typography>
                      </Box>
                      {count > 0 && <Chip size="small" color="primary" label={count} />}
                    </Stack>
                  </TableCell>
                  {data.directions.map((dir) => {
                    const own = !canView(d, dir);
                    return (
                      <TableCell key={dir.id} align="center" sx={{ bgcolor: own ? "action.hover" : undefined }}>
                        {own ? (
                          <Typography variant="caption" color="text.disabled">
                            —
                          </Typography>
                        ) : (
                          <Checkbox
                            size="small"
                            checked={checked.has(cell(rubric, d.id, dir.id))}
                            onChange={(e) => setMany([cell(rubric, d.id, dir.id)], e.target.checked)}
                            inputProps={{ "aria-label": `${d.name} → ${dir.name}` }}
                          />
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell align="center">
                    <Checkbox size="small" checked={s.all} indeterminate={s.some} onChange={(e) => setMany(keys, e.target.checked)} inputProps={{ "aria-label": d.name }} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>

      <Stack direction="row" spacing={2} alignItems="center" justifyContent="flex-end" flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
        {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}
        {justSaved && !dirty && <Alert severity="success" sx={{ py: 0 }}>{t("settings.peerAccess.saved")}</Alert>}
        {dirty && (
          <Button color="inherit" onClick={() => { setChecked(new Set(saved)); setError(null); }}>
            {t("settings.peerAccess.cancel")}
          </Button>
        )}
        <Button variant="contained" onClick={save} disabled={saving || !dirty}>
          {t("settings.peerAccess.save")}
        </Button>
      </Stack>
    </Paper>
  );
}
