import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Accordion,
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
import PageHeader from "@/components/layout/PageHeader";
import { apiClient } from "@/api/client";
import type { Company, Paginated, SkillMatrix } from "@/api/types";
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

  useEffect(() => {
    apiClient.get<Paginated<Company>>("/companies/").then((r) => {
      setCompanies(r.data.results);
      if (r.data.results.length) setCompanyId(r.data.results[0].id);
    });
  }, []);

  function loadMatrices() {
    if (!companyId) return;
    apiClient
      .get<Paginated<SkillMatrix>>("/skill-matrices/", { params: { company: companyId } })
      .then((r) => setMatrices(r.data.results));
  }

  useEffect(loadMatrices, [companyId]);

  async function handleCreateMatrix() {
    await apiClient.post("/skill-matrices/", { ...matrixForm, company: companyId });
    setMatrixDialog(false);
    setMatrixForm({ name: "", type: "HARD" });
    loadMatrices();
  }

  async function handleDeleteMatrix(matrix: SkillMatrix) {
    await apiClient.delete(`/skill-matrices/${matrix.id}/`);
    loadMatrices();
  }

  async function handleCreateItem() {
    if (!itemDialog) return;
    await apiClient.post("/skill-items/", {
      matrix: itemDialog.id,
      name: itemForm.name,
      weight: itemForm.weight,
      order: itemDialog.items.length,
    });
    setItemForm({ name: "", weight: 1 });
    setItemDialog(null);
    loadMatrices();
  }

  async function handleDeleteItem(itemId: number) {
    await apiClient.delete(`/skill-items/${itemId}/`);
    loadMatrices();
  }

  return (
    <Stack spacing={3}>
      <PageHeader title={t("skillsAdmin.title")} />

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
        <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={() => setMatrixDialog(true)}>
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
            <Button size="small" startIcon={<AddOutlinedIcon />} sx={{ mt: 1 }} onClick={() => setItemDialog(matrix)}>
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
              onChange={(e) => setMatrixForm({ ...matrixForm, name: e.target.value })}
              fullWidth
            />
            <TextField
              select
              label={t("skillsAdmin.type")}
              value={matrixForm.type}
              onChange={(e) => setMatrixForm({ ...matrixForm, type: e.target.value as "HARD" | "SOFT" })}
            >
              <MenuItem value="HARD">Hard Skills ({t("skillsAdmin.aptitudes")})</MenuItem>
              <MenuItem value="SOFT">Soft Skills ({t("skillsAdmin.attitudes")})</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMatrixDialog(false)}>{t("common.cancel")}</Button>
          <Button variant="contained" onClick={handleCreateMatrix} disabled={!matrixForm.name}>
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
              onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
              autoFocus
              fullWidth
            />
            <TextField
              label={t("skills.weight")}
              type="number"
              value={itemForm.weight}
              onChange={(e) => setItemForm({ ...itemForm, weight: Number(e.target.value) })}
              inputProps={{ step: 0.1, min: 0.1 }}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setItemDialog(null)}>{t("common.cancel")}</Button>
          <Button variant="contained" onClick={handleCreateItem} disabled={!itemForm.name}>
            {t("common.add")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
