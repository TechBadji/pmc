import { Alert, Button, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import PersonPerformanceId from "@/components/PersonPerformanceId";
import { BoardPeriodBar } from "@/components/teamBoard/BoardPieces";
import TeamPerformanceIdBoard from "@/components/teamBoard/TeamPerformanceIdBoard";
import { today, useTeamBoard } from "@/features/teamBoard";
import type { Department, Paginated, UserRecord } from "@/api/types";

export default function PerformancePage() {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const isCompanyAdmin = user?.role === "COMPANY_ADMIN";
  const [people, setPeople] = useState<UserRecord[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  // Deux fiches d'identité : celle d'une personne, celle de l'équipe.
  const [view, setView] = useState<"person" | "team">("person");
  const [teamId, setTeamId] = useState<number | "">("");
  const board = useTeamBoard(teamId);
  // La planche se lit en texte ; on n'ouvre les champs que pendant une saisie,
  // qu'il s'agisse d'une nouvelle entrée ou d'une correction demandée.
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    apiClient.get<Paginated<UserRecord>>("/users/", { params: { page_size: 500 } }).then((r) => setPeople(r.data.results));
    apiClient.get<Paginated<Department>>("/departments/", { params: { page_size: 500 } }).then((r) => {
      setDepartments(r.data.results);
      // Un directeur n'a qu'une direction : elle s'ouvre sans rien choisir.
      if (r.data.results.length > 0) setTeamId((prev) => (prev === "" ? r.data.results[0].id : prev));
    });
  }, []);

  // Côté CEO, le sélecteur ne propose que les managers (revue individuelle
  // des directeurs) — les autres collaborateurs restent consultables via
  // "Mon équipe" côté manager. `people` reste complet pour les lookups
  // internes (rattachement, collègues d'équipe pour la dynamique d'équipe).
  const selectablePeople = useMemo(
    () => (isCompanyAdmin ? people.filter((p) => p.role === "MANAGER") : people),
    [people, isCompanyAdmin]
  );

  const canEditBoard = isCompanyAdmin || user?.role === "MANAGER";

  return (
    <Stack spacing={3}>
      <Typography variant="h5" fontWeight={700} className="pmc-no-print">
        {t("performanceId.pageTitle")}
      </Typography>

      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap className="pmc-no-print">
        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          onChange={(_, v) => v && setView(v)}
          sx={{
            height: 40,
            "& .MuiToggleButton-root": { px: 2, fontWeight: 700, borderColor: "primary.main", color: "primary.main" },
            "& .Mui-selected": { bgcolor: "primary.main", color: "#fff !important", "&:hover": { bgcolor: "primary.dark" } },
          }}
        >
          <ToggleButton value="person">
            {isCompanyAdmin ? t("performanceId.viewManager") : t("performanceId.viewMember")}
          </ToggleButton>
          <ToggleButton value="team">{t("performanceId.viewTeam")}</ToggleButton>
        </ToggleButtonGroup>

        {view === "team" && (
          <TextField
            select
            size="small"
            label={t("cohesion.team")}
            value={teamId}
            onChange={(e) => setTeamId(Number(e.target.value))}
            sx={{ minWidth: 260 }}
          >
            {departments.map((d) => (
              <MenuItem key={d.id} value={d.id}>
                {d.name}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Stack>

      {view === "person" ? (
        <PersonPerformanceId people={people} selectablePeople={selectablePeople} />
      ) : (
        <Stack spacing={2}>
          <BoardPeriodBar
            dates={board.dates}
            currentId={board.currentId}
            onSelect={board.select}
            onNew={() => {
              board.startNew(today());
              setEditing(true);
            }}
            onSave={async () => {
              await board.save();
              setEditing(false);
            }}
            dirty={board.dirty}
            saving={board.saving}
            canEdit={canEditBoard}
            extra={
              canEditBoard && (
                <Button size="small" variant={editing ? "contained" : "outlined"} onClick={() => setEditing((e) => !e)}>
                  {editing ? t("teamBoard.stopEditing") : t("common.edit")}
                </Button>
              )
            }
          />
          {board.error === "duplicate" && <Alert severity="warning">{t("teamBoard.duplicateDate")}</Alert>}
          {board.error === "save" && <Alert severity="error">{t("teamBoard.saveFailed")}</Alert>}
          <TeamPerformanceIdBoard
            teamId={teamId}
            teamName={departments.find((d) => d.id === teamId)?.name ?? ""}
            board={board.draft}
            patch={board.patch}
            readOnly={!canEditBoard}
            editing={editing && canEditBoard}
          />
        </Stack>
      )}
    </Stack>
  );
}
