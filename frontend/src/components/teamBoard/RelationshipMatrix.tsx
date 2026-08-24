import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";
import {
  Alert,
  Avatar,
  Box,
  Button,
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
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import type { TeamRelationship, UserRecord } from "@/api/types";
import { RELATION_COLORS } from "./BoardPieces";

const QUALITIES: TeamRelationship["quality"][] = ["EXCELLENT", "CORRECT", "DIFFICULT", "TOXIC"];

/** Clé d'un binôme, indépendante du sens : la relation est réciproque. */
function pairKey(a: number, b: number) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * Saisie de la dynamique relationnelle d'une équipe.
 *
 * Dans un département, chacun est en relation avec tous les autres : ce qui
 * varie n'est pas l'existence du lien mais sa nature. La saisie se fait donc
 * personne par personne — on choisit un collaborateur, et ses liens avec
 * chacun des autres s'affichent d'un bloc. Une liste à plat des quinze binômes
 * d'une équipe de six oblige à chercher les siens ; ici, on qualifie les cinq
 * relations d'une personne, puis on passe à la suivante.
 *
 * Un binôme reste unique : qualifié depuis l'un ou l'autre de ses membres,
 * c'est la même relation qui est mise à jour.
 */
export default function RelationshipMatrix({
  teamId,
  members,
  relationships,
  onChanged,
  readOnly,
}: {
  teamId: number;
  members: UserRecord[];
  relationships: TeamRelationship[];
  onChanged: () => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<number | "">("");

  const byPair = useMemo(() => {
    const map = new Map<string, TeamRelationship>();
    relationships.forEach((r) => map.set(pairKey(r.from_user, r.to_user), r));
    return map;
  }, [relationships]);

  const pairs = useMemo(() => {
    const list: { a: UserRecord; b: UserRecord; relation: TeamRelationship | undefined }[] = [];
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        list.push({ a: members[i], b: members[j], relation: byPair.get(pairKey(members[i].id, members[j].id)) });
      }
    }
    return list;
  }, [members, byPair]);

  const missing = pairs.filter((p) => !p.relation);

  // Personne dont on qualifie les liens : le responsable d'abord, c'est par
  // lui qu'on commence naturellement une revue d'équipe.
  const manager = members.find((m) => m.role === "MANAGER") ?? members[0];
  const focus = members.find((m) => m.id === focusId) ?? manager;
  const others = members.filter((m) => m.id !== focus?.id);

  async function setQuality(a: UserRecord, b: UserRecord, quality: TeamRelationship["quality"]) {
    const existing = byPair.get(pairKey(a.id, b.id));
    setBusy(true);
    setError(null);
    try {
      if (existing) {
        await apiClient.patch(`/team-relationships/${existing.id}/`, { quality });
      } else {
        await apiClient.post("/team-relationships/", {
          team: teamId,
          from_user: a.id,
          to_user: b.id,
          quality,
        });
      }
      onChanged();
    } catch {
      setError("save");
    } finally {
      setBusy(false);
    }
  }

  /** Pose en une fois les binômes non encore qualifiés, en « correcte ». */
  async function fillMissing() {
    setBusy(true);
    setError(null);
    try {
      // En série plutôt qu'en parallèle : la contrainte d'unicité porte sur le
      // couple, deux écritures simultanées sur le même binôme se percuteraient.
      for (const pair of missing) {
        await apiClient.post("/team-relationships/", {
          team: teamId,
          from_user: pair.a.id,
          to_user: pair.b.id,
          quality: "CORRECT",
        });
      }
      onChanged();
    } catch {
      setError("save");
    } finally {
      setBusy(false);
    }
  }

  if (members.length < 2) {
    return <Alert severity="info">{t("teamBoard.noMember")}</Alert>;
  }

  return (
    <Paper elevation={0} sx={{ p: 1.5, border: "1px solid", borderColor: "divider" }}>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
        <Select
          size="small"
          value={focus?.id ?? ""}
          onChange={(e) => setFocusId(Number(e.target.value))}
          sx={{ minWidth: 260 }}
        >
          {members.map((m) => (
            <MenuItem key={m.id} value={m.id}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Avatar src={m.avatar ?? undefined} sx={{ width: 24, height: 24, fontSize: 11 }}>
                  {(m.full_name || m.email).charAt(0)}
                </Avatar>
                <Typography variant="body2">{m.full_name || m.email}</Typography>
                {m.role === "MANAGER" && (
                  <Typography variant="caption" color="text.secondary">
                    {t("departments.serviceHead")}
                  </Typography>
                )}
              </Stack>
            </MenuItem>
          ))}
        </Select>

        <Typography variant="caption" color="text.secondary">
          {t("teamBoard.matrixProgress", { done: pairs.length - missing.length, total: pairs.length })}
        </Typography>

        {missing.length > 0 && !readOnly && (
          <Button size="small" startIcon={<AutoFixHighOutlinedIcon />} onClick={fillMissing} disabled={busy}>
            {t("teamBoard.matrixFill", { count: missing.length })}
          </Button>
        )}
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {t("teamBoard.saveFailed")}
        </Alert>
      )}

      <TableContainer sx={{ maxHeight: 420 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>
                {t("teamBoard.relationWith", { name: focus?.full_name || focus?.email || "" })}
              </TableCell>
              <TableCell sx={{ fontWeight: 700, width: 230 }}>{t("teamBoard.relationQuality")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {others.map((other) => {
              const relation = focus ? byPair.get(pairKey(focus.id, other.id)) : undefined;
              const quality: TeamRelationship["quality"] | "" = relation?.quality ?? "";
              return (
                <TableRow key={other.id} hover>
                  <TableCell>
                    <Stack direction="row" spacing={1.25} alignItems="center">
                      <Avatar src={other.avatar ?? undefined} sx={{ width: 30, height: 30, fontSize: 13 }}>
                        {(other.full_name || other.email).charAt(0)}
                      </Avatar>
                      <Stack sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {other.full_name || other.email}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {other.position}
                        </Typography>
                      </Stack>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Select
                      size="small"
                      fullWidth
                      displayEmpty
                      value={quality}
                      disabled={readOnly || busy || !focus}
                      onChange={(e) => focus && setQuality(focus, other, e.target.value as TeamRelationship["quality"])}
                      renderValue={(value) =>
                        !value ? (
                          <Typography variant="body2" color="warning.main">
                            {t("teamBoard.toQualify")}
                          </Typography>
                        ) : (
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Box
                              sx={{
                                width: 20,
                                height: 4,
                                borderRadius: 2,
                                bgcolor: RELATION_COLORS[value as TeamRelationship["quality"]],
                              }}
                            />
                            <Typography variant="body2">{t(`cohesion.relationQuality.${value}`)}</Typography>
                          </Stack>
                        )
                      }
                    >
                      {QUALITIES.map((q) => (
                        <MenuItem key={q} value={q}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Box sx={{ width: 20, height: 4, borderRadius: 2, bgcolor: RELATION_COLORS[q] }} />
                            <Typography variant="body2">{t(`cohesion.relationQuality.${q}`)}</Typography>
                          </Stack>
                        </MenuItem>
                      ))}
                    </Select>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
