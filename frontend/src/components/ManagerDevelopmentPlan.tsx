import {
  Alert,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { HARD_SKILLS_COLOR, SOFT_SKILLS_COLOR } from "@/theme";
import type { ActionPlan, Paginated } from "@/api/types";

const ORDERS = [1, 2, 3];
const HEADER_ORANGE = "#E08A34"; // orange du logo (theme.palette.warning.main)

type DevCategory = "SOFT_SKILLS" | "HARD_SKILLS";

interface RowItem {
  priority: string;
  baseline: string;
  target: string;
  objective: string;
  due_date: string;
  cost: string;
  responsible: string;
  eval_note: string;
}

function emptyRow(): RowItem {
  return { priority: "", baseline: "", target: "", objective: "", due_date: "", cost: "", responsible: "", eval_note: "" };
}

type RowMap = Record<string, RowItem>;

function key(category: DevCategory, order: number) {
  return `${category}-${order}`;
}

export default function ManagerDevelopmentPlan({ managerId, managerName }: { managerId: number; managerName: string }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<RowMap>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(false);
    apiClient
      .get<Paginated<ActionPlan>>("/action-plans/", { params: { target_user: managerId, page_size: 100 } })
      .then((r) => {
        const map: RowMap = {};
        r.data.results
          .filter((p) => p.order !== null)
          .forEach((p) => {
            map[key(p.category, p.order as number)] = {
              priority: p.priority,
              baseline: p.baseline,
              target: p.target,
              objective: p.objective,
              due_date: p.due_date ?? "",
              cost: p.cost,
              responsible: p.responsible,
              eval_note: p.eval_note,
            };
          });
        setRows(map);
      });
  }, [managerId]);

  function updateField(category: DevCategory, order: number, field: keyof RowItem, value: string) {
    setRows((prev) => ({
      ...prev,
      [key(category, order)]: { ...(prev[key(category, order)] ?? emptyRow()), [field]: value },
    }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const categories: DevCategory[] = ["SOFT_SKILLS", "HARD_SKILLS"];
      const items = categories.flatMap((category) =>
        ORDERS.map((order) => ({ category, order, ...(rows[key(category, order)] ?? emptyRow()) }))
      );
      await apiClient.post("/action-plans/bulk-save-dev-plan/", { target_user: managerId, items });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  function renderRow(category: DevCategory, order: number, isFirst: boolean, groupColor: string, groupLabel: string) {
    const row = rows[key(category, order)] ?? emptyRow();
    const set = (field: keyof RowItem) => (e: React.ChangeEvent<HTMLInputElement>) =>
      updateField(category, order, field, e.target.value);
    return (
      <TableRow key={key(category, order)}>
        {isFirst && (
          <TableCell
            rowSpan={ORDERS.length}
            sx={{ bgcolor: groupColor, color: "#fff", textAlign: "center", p: 0.5, border: "1px solid", borderColor: "divider" }}
          >
            <Typography
              variant="caption"
              fontWeight={700}
              sx={{ writingMode: "vertical-rl", transform: "rotate(180deg)", letterSpacing: 1, fontSize: 11 }}
            >
              {groupLabel}
            </Typography>
          </TableCell>
        )}
        <TableCell sx={{ minWidth: 160 }}>
          <TextField size="small" fullWidth multiline value={row.priority} onChange={set("priority")} />
        </TableCell>
        <TableCell sx={{ width: 64 }}>
          <TextField size="small" fullWidth value={row.baseline} onChange={set("baseline")} />
        </TableCell>
        <TableCell sx={{ width: 64 }}>
          <TextField size="small" fullWidth value={row.target} onChange={set("target")} />
        </TableCell>
        <TableCell sx={{ minWidth: 260 }}>
          <TextField size="small" fullWidth multiline value={row.objective} onChange={set("objective")} />
        </TableCell>
        <TableCell sx={{ width: 130 }}>
          <TextField size="small" fullWidth type="date" value={row.due_date} onChange={set("due_date")} InputLabelProps={{ shrink: true }} />
        </TableCell>
        <TableCell sx={{ width: 90 }}>
          <TextField size="small" fullWidth value={row.cost} onChange={set("cost")} />
        </TableCell>
        <TableCell sx={{ width: 110 }}>
          <TextField size="small" fullWidth value={row.responsible} onChange={set("responsible")} />
        </TableCell>
        <TableCell sx={{ width: 90 }}>
          <TextField size="small" fullWidth value={row.eval_note} onChange={set("eval_note")} />
        </TableCell>
      </TableRow>
    );
  }

  return (
    <Paper elevation={0} sx={{ p: 2, mt: 2, border: "1px solid", borderColor: "divider" }}>
      <Paper elevation={0} sx={{ py: 1, mb: 2, textAlign: "center", bgcolor: "#f5efd6", border: "1px solid", borderColor: "divider" }}>
        <Typography variant="subtitle1" fontWeight={800} sx={{ color: "primary.main" }}>
          {`ID-PMC_ ${t("managerDevPlan.title", { name: managerName }).toUpperCase()}`}
        </Typography>
      </Paper>

      <TableContainer>
        <Table size="small" sx={{ "& .MuiTableCell-root": { border: "1px solid", borderColor: "divider" } }}>
          <TableHead>
            <TableRow>
              <TableCell rowSpan={2} sx={{ bgcolor: HEADER_ORANGE, width: 28 }} />
              <TableCell rowSpan={2} sx={{ bgcolor: HEADER_ORANGE, color: "#fff", fontWeight: 700, textAlign: "center" }}>
                {t("managerDevPlan.priorityCol")}
              </TableCell>
              <TableCell colSpan={2} sx={{ bgcolor: HEADER_ORANGE, color: "#fff", fontWeight: 700, textAlign: "center" }}>
                {t("managerDevPlan.kpis")}
              </TableCell>
              <TableCell rowSpan={2} sx={{ bgcolor: HEADER_ORANGE, color: "#fff", fontWeight: 700, textAlign: "center" }}>
                {t("managerDevPlan.actionsCol")}
              </TableCell>
              <TableCell rowSpan={2} sx={{ bgcolor: HEADER_ORANGE, color: "#fff", fontWeight: 700, textAlign: "center" }}>
                {t("managerDevPlan.timing")}
              </TableCell>
              <TableCell rowSpan={2} sx={{ bgcolor: HEADER_ORANGE, color: "#fff", fontWeight: 700, textAlign: "center" }}>
                {t("managerDevPlan.cost")}
              </TableCell>
              <TableCell rowSpan={2} sx={{ bgcolor: HEADER_ORANGE, color: "#fff", fontWeight: 700, textAlign: "center" }}>
                {t("managerDevPlan.responsible")}
              </TableCell>
              <TableCell rowSpan={2} sx={{ bgcolor: HEADER_ORANGE, color: "#fff", fontWeight: 700, textAlign: "center" }}>
                {t("managerDevPlan.eval")}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell sx={{ bgcolor: HEADER_ORANGE, color: "#fff", fontWeight: 700, textAlign: "center" }}>
                {t("managerDevPlan.baseline")}
              </TableCell>
              <TableCell sx={{ bgcolor: HEADER_ORANGE, color: "#fff", fontWeight: 700, textAlign: "center" }}>
                {t("managerDevPlan.target")}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {ORDERS.map((order) => renderRow("SOFT_SKILLS", order, order === 1, SOFT_SKILLS_COLOR, t("managerDevPlan.softSkills")))}
            {ORDERS.map((order) => renderRow("HARD_SKILLS", order, order === 1, HARD_SKILLS_COLOR, t("managerDevPlan.hardSkills")))}
          </TableBody>
        </Table>
      </TableContainer>

      <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={2} sx={{ mt: 2 }}>
        {saved && (
          <Alert severity="success" sx={{ py: 0 }}>
            {t("managerDevPlan.saved")}
          </Alert>
        )}
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {t("common.save")}
        </Button>
      </Stack>
    </Paper>
  );
}
