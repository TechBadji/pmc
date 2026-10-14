import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { Alert, Avatar, Box, Button, Chip, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import PageHeader from "@/components/layout/PageHeader";
import StatCard from "@/components/StatCard";
import { presenceInstance } from "@/utils/presence";

type Instance = { browser: string; ip: string; country: string; since: string; last_seen: string; mine: boolean };
type Account = { user: number; login: string; name: string; role: string; company: string; avatar: string | null; last_seen: string; instances: Instance[] };
type Presence = { window_minutes: number; people: number; instances: number; companies: number; accounts: Account[] };

const REFRESH_MS = 30_000;

/** Super administrateur : qui est connecté en ce moment, avec quel compte, et
 * sur combien d'instances (onglets ou appareils). */
export default function PresencePage() {
  const { t, i18n } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const [data, setData] = useState<Presence | null>(null);
  const [error, setError] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [company, setCompany] = useState("");

  const load = useCallback(() => {
    apiClient
      .get<Presence>("/presence/", { params: { instance: presenceInstance() }, silent: true })
      .then((r) => {
        setData(r.data);
        setError(false);
        setRefreshedAt(new Date());
      })
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  const companies = useMemo(() => [...new Set((data?.accounts ?? []).map((a) => a.company))].sort((a, b) => a.localeCompare(b)), [data]);
  const shown = (data?.accounts ?? []).filter((a) => company === "" || a.company === company);
  const time = (iso: string | Date) => new Date(iso).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });
  const ago = (iso: string) => {
    const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    return minutes < 1 ? t("presence.ago.now") : t("presence.ago.min", { n: minutes });
  };

  if (user?.role !== "SUPER_ADMIN") return <Alert severity="info">{t("presence.adminOnly")}</Alert>;

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title={t("presence.title")}
        subtitle={t("presence.subtitle", { minutes: data?.window_minutes ?? 3 })}
        actions={
          <Button variant="outlined" startIcon={<RefreshOutlinedIcon />} onClick={load}>
            {t("presence.refresh")}
          </Button>
        }
      />
      {error && <Alert severity="error">{t("presence.loadFailed")}</Alert>}
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        <StatCard label={t("presence.people")} value={data?.people ?? "—"} />
        <StatCard label={t("presence.instances")} value={data?.instances ?? "—"} />
        <StatCard label={t("presence.companies")} value={data?.companies ?? "—"} />
      </Stack>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField select size="small" label={t("presence.companyCol")} value={company} onChange={(e) => setCompany(e.target.value)} sx={{ minWidth: 260 }} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
          <MenuItem value="">{t("presence.company")}</MenuItem>
          {companies.map((c) => (
            <MenuItem key={c} value={c}>
              {c || "—"}
            </MenuItem>
          ))}
        </TextField>
        {refreshedAt && (
          <Typography variant="caption" color="text.secondary">
            {t("presence.refreshed", { time: refreshedAt.toLocaleTimeString(i18n.language) })}
          </Typography>
        )}
      </Stack>
      {data && shown.length === 0 ? (
        <Alert severity="info">{t("presence.none")}</Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: "primary.main" }}>
                {["account", "companyCol", "role", "instanceCount", "where", "lastSeen"].map((k) => (
                  <TableCell key={k} sx={{ color: "#fff", fontWeight: 700 }} align={k === "instanceCount" ? "center" : "left"}>
                    {t(`presence.${k}`)}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((a) => (
                <TableRow key={a.user} hover sx={{ verticalAlign: "top" }}>
                  <TableCell>
                    <Stack direction="row" spacing={1.25} alignItems="center">
                      <Avatar src={a.avatar ?? undefined} sx={{ width: 32, height: 32 }}>
                        {a.name.charAt(0).toUpperCase()}
                      </Avatar>
                      <Box>
                        <Typography variant="body2" fontWeight={700}>
                          {a.login}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {a.name}
                        </Typography>
                      </Box>
                    </Stack>
                  </TableCell>
                  <TableCell>{a.company || "—"}</TableCell>
                  <TableCell>{t(`presence.roles.${a.role}`, { defaultValue: a.role })}</TableCell>
                  <TableCell align="center">
                    <Chip size="small" color={a.instances.length > 1 ? "warning" : "default"} label={a.instances.length} sx={{ fontWeight: 700 }} />
                  </TableCell>
                  <TableCell>
                    <Stack spacing={0.5}>
                      {a.instances.map((i, n) => (
                        <Typography key={n} variant="caption" display="block">
                          <strong>{i.browser}</strong> · {i.ip || "—"}
                          {i.country ? ` (${i.country})` : ""} · {t("presence.since", { time: time(i.since) })}
                          {i.mine ? ` · ${t("presence.thisTab")}` : ""}
                        </Typography>
                      ))}
                    </Stack>
                  </TableCell>
                  <TableCell>{ago(a.last_seen)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}
