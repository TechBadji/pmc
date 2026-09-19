import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Accordion,
  Alert,
  AccordionDetails,
  AccordionSummary,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DecimalField } from "@/components/inputs/DecimalField";
import PageHeader from "@/components/layout/PageHeader";
import { apiClient } from "@/api/client";
import type { Company, Paginated, SkillMatrix } from "@/api/types";
import ValidationSummary from "@/components/feedback/ValidationSummary";
import { isBlank, useIssues } from "@/utils/validation";
import { HARD_SKILLS_COLOR as HARD_COLOR, SOFT_SKILLS_COLOR as SOFT_COLOR } from "@/theme";

export default function SkillsAdminPage() {
  const { t } = useTranslation();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<number | "">("");
  const [matrices, setMatrices] = useState<SkillMatrix[]>([]);
  const [matrixDialog, setMatrixDialog] = useState(false);
  const [matrixForm, setMatrixForm] = useState({ name: "", type: "HARD" as "HARD" | "SOFT" });
  const [itemDialog, setItemDialog] = useState<SkillMatrix | null>(null);
  const [itemForm, setItemForm] = useState({ name: "", weight: 1 });
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const matrixIssues = useIssues();
  const itemIssues = useIssues();

  useEffect(() => {
    apiClient
      .get<Paginated<Company>>("/companies/")
      .then((r) => {
        setCompanies(r.data.results);
        if (r.data.results.length) setCompanyId(r.data.results[0].id);
      })
      .catch(() => setLoadError(true));
  }, []);

  function loadMatrices() {
    if (!companyId) return;
    setLoadError(false);
    apiClient
      .get<Paginated<SkillMatrix>>("/skill-matrices/", { params: { company: companyId, page_size: 500 } })
      .then((r) => setMatrices(r.data.results))
      .catch(() => setLoadError(true));
  }

  useEffect(loadMatrices, [companyId]);

  async function handleCreateMatrix() {
    const name = matrixForm.name.trim();
    const ok = matrixIssues.check([
      [!companyId, t("validation.skillsAdmin.companyRequired")],
      [isBlank(name), t("validation.skillsAdmin.matrixNameRequired"), "name"],
      [
        !isBlank(name) &&
          matrices.some((m) => m.type === matrixForm.type && m.name.trim().toLowerCase() === name.toLowerCase()),
        t("validation.skillsAdmin.matrixDuplicate", { name, type: matrixForm.type === "HARD" ? "Hard Skills" : "Soft Skills" }),
        "name",
      ],
    ]);
    if (!ok) return;
    setSaving(true);
    try {
      await apiClient.post("/skill-matrices/", { ...matrixForm, name, company: companyId });
      setMatrixDialog(false);
      setMatrixForm({ name: "", type: "HARD" });
      loadMatrices();
    } catch {
      // le toast du client explique le refus ; la fenêtre reste ouverte pour corriger
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteMatrix(matrix: SkillMatrix) {
    await apiClient.delete(`/skill-matrices/${matrix.id}/`);
    loadMatrices();
  }

  async function handleCreateItem() {
    if (!itemDialog) return;
    const name = itemForm.name.trim();
    const weight = itemForm.weight;
    const ok = itemIssues.check([
      [isBlank(name), t("validation.skillsAdmin.itemNameRequired"), "name"],
      [
        !isBlank(name) && itemDialog.items.some((i) => i.name.trim().toLowerCase() === name.toLowerCase()),
        t("validation.skillsAdmin.itemDuplicate", { name }),
        "name",
      ],
      [!Number.isFinite(weight) || weight <= 0, t("validation.skillsAdmin.weightInvalid"), "weight"],
      [weight >= 100, t("validation.skillsAdmin.weightTooLarge"), "weight"],
      [weight > 0 && Math.round(weight * 100) / 100 !== weight, t("validation.skillsAdmin.weightDecimals"), "weight"],
    ]);
    if (!ok) return;
    setSaving(true);
    try {
      await apiClient.post("/skill-items/", {
        matrix: itemDialog.id,
        name,
        weight,
        order: itemDialog.items.length,
      });
      setItemForm({ name: "", weight: 1 });
      setItemDialog(null);
      loadMatrices();
    } catch {
      // le toast du client explique le refus ; la fenêtre reste ouverte pour corriger
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteItem(itemId: number) {
    await apiClient.delete(`/skill-items/${itemId}/`);
    loadMatrices();
  }

  return (
    <Stack spacing={3}>
      <PageHeader title={t("skillsAdmin.title")} />
      {loadError && <Alert severity="error">{t("common.loadError")}</Alert>}

      <Stack direction="row" spacing={2} alignItems="center">
        <TextField
          select
          label={t("bulkUpload.company")}
          value={companyId}
          onChange={(e) => setCompanyId(Number(e.target.value))}
          sx={{ minWidth: 280 }}
        >
          {companies.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={() => {
            matrixIssues.clear();
            setMatrixDialog(true);
          }}>
          {t("skillsAdmin.newMatrix")}
        </Button>
      </Stack>

      {matrices.map((matrix) => (
        <Accordion key={matrix.id} elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: "100%" }}>
              <Typography fontWeight={600}>{matrix.name}</Typography>
              <Chip
                size="small"
                label={matrix.type === "HARD" ? "Hard Skills" : "Soft Skills"}
                sx={{
                  bgcolor: (matrix.type === "HARD" ? HARD_COLOR : SOFT_COLOR) + "22",
                  color: matrix.type === "HARD" ? HARD_COLOR : SOFT_COLOR,
                  fontWeight: 600,
                }}
              />
              <Chip size="small" variant="outlined" label={t("skillsAdmin.itemCount", { count: matrix.items.length })} />
              <Stack sx={{ flexGrow: 1 }} />
              <IconButton
                size="small"
                aria-label={t("common.delete")}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteMatrix(matrix);
                }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t("skills.competency")}</TableCell>
                  <TableCell align="right">{t("skills.weight")}</TableCell>
                  <TableCell align="right">{t("common.actions")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {matrix.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell align="right">{item.weight}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" aria-label={t("common.delete")} onClick={() => handleDeleteItem(item.id)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Button size="small" startIcon={<AddOutlinedIcon />} sx={{ mt: 1 }} onClick={() => {
              itemIssues.clear();
              setItemDialog(matrix);
            }}>
              {t("skillsAdmin.addCompetency")}
            </Button>
          </AccordionDetails>
        </Accordion>
      ))}

      <Dialog open={matrixDialog} onClose={() => setMatrixDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t("skillsAdmin.newMatrix")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={t("skillsAdmin.matrixNameLabel")}
              value={matrixForm.name}
              onChange={(e) => {
                setMatrixForm({ ...matrixForm, name: e.target.value });
                matrixIssues.clear();
              }}
              error={matrixIssues.has("name")}
              helperText={matrixIssues.messageFor("name")}
              fullWidth
            />
            <TextField
              select
              label={t("skillsAdmin.type")}
              value={matrixForm.type}
              onChange={(e) => {
                setMatrixForm({ ...matrixForm, type: e.target.value as "HARD" | "SOFT" });
                matrixIssues.clear();
              }}
            >
              <MenuItem value="HARD">Hard Skills ({t("skillsAdmin.aptitudes")})</MenuItem>
              <MenuItem value="SOFT">Soft Skills ({t("skillsAdmin.attitudes")})</MenuItem>
            </TextField>
            <ValidationSummary issues={matrixIssues.issues} onClose={matrixIssues.clear} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMatrixDialog(false)}>{t("common.cancel")}</Button>
          <Button variant="contained" onClick={handleCreateMatrix} disabled={saving}>
            {t("common.create")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!itemDialog} onClose={() => setItemDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle>
          {t("skillsAdmin.addCompetency")} — {itemDialog?.name}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={t("skillsAdmin.competencyNameLabel")}
              value={itemForm.name}
              onChange={(e) => {
                setItemForm({ ...itemForm, name: e.target.value });
                itemIssues.clear();
              }}
              error={itemIssues.has("name")}
              helperText={itemIssues.messageFor("name")}
              autoFocus
              fullWidth
            />
            <DecimalField
              label={t("skills.weight")}
              value={itemForm.weight}
              onChange={(v) => {
                setItemForm({ ...itemForm, weight: v === "" ? 0 : v });
                itemIssues.clear();
              }}
              error={itemIssues.has("weight")}
              helperText={itemIssues.messageFor("weight")}
              fullWidth
            />
            <ValidationSummary issues={itemIssues.issues} onClose={itemIssues.clear} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setItemDialog(null)}>{t("common.cancel")}</Button>
          <Button variant="contained" onClick={handleCreateItem} disabled={saving}>
            {t("common.add")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
