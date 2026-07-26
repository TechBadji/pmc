import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import {
  Alert,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { apiClient } from "@/api/client";
import type { BulkUploadResult, Company, Paginated } from "@/api/types";

const TEMPLATE_CSV =
  "prenom,nom,email,poste,departement_code,role\nAwa,Ndiaye,,Technicienne,DSI,MEMBER\nMoussa,Diop,moussa.diop@exemple.com,Comptable,DAF,MANAGER\n";

export default function BulkUploadPage() {
  const { t } = useTranslation();
  const { companyId: companyIdParam } = useParams();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<number | "">(
    companyIdParam ? Number(companyIdParam) : ""
  );
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<BulkUploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiClient.get<Paginated<Company>>("/companies/").then((r) => {
      setCompanies(r.data.results);
      if (!companyIdParam && r.data.results.length) setCompanyId(r.data.results[0].id);
    });
  }, [companyIdParam]);

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modele_chargement_utilisateurs.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleUpload() {
    if (!companyId || !file) return;
    setUploading(true);
    setResult(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const { data } = await apiClient.post<BulkUploadResult>(
        `/companies/${companyId}/bulk-upload-users/`,
        formData
      );
      setResult(data);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setUploading(false);
    }
  }

  return (
    <Stack spacing={3} maxWidth={900}>
      <Typography variant="h5" fontWeight={700}>
        {t("bulkUpload.title")}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t("bulkUpload.explanation")}{" "}
        <code>prenom,nom,email,poste,departement_code,role</code>
      </Typography>

      <Paper elevation={0} sx={{ p: 2.5, border: "1px solid", borderColor: "divider" }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <TextField
              select
              label={t("bulkUpload.company")}
              value={companyId}
              onChange={(e) => setCompanyId(Number(e.target.value))}
              sx={{ minWidth: 260 }}
            >
              {companies.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
            <Button startIcon={<DownloadOutlinedIcon />} onClick={downloadTemplate}>
              {t("bulkUpload.downloadTemplate")}
            </Button>
          </Stack>

          <Stack direction="row" spacing={2} alignItems="center">
            <Button variant="outlined" component="label" startIcon={<UploadFileOutlinedIcon />}>
              {t("bulkUpload.chooseFile")}
              <input
                ref={fileInputRef}
                hidden
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Button>
            {file && <Typography variant="body2">{file.name}</Typography>}
            <Button
              variant="contained"
              onClick={handleUpload}
              disabled={!file || !companyId || uploading}
            >
              {uploading ? t("common.loading") : t("bulkUpload.launch")}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {result && (
        <Stack spacing={2}>
          <Alert severity={result.errors.length ? "warning" : "success"}>
            {t("bulkUpload.summary", { count: result.created_count })}
            {result.errors.length ? ` ${t("bulkUpload.errorSummary", { count: result.errors.length })}` : ""}
          </Alert>

          {result.created.length > 0 && (
            <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t("companies.name")}</TableCell>
                    <TableCell>{t("bulkUpload.login")}</TableCell>
                    <TableCell>{t("common.email")}</TableCell>
                    <TableCell>{t("common.department")}</TableCell>
                    <TableCell>{t("common.role")}</TableCell>
                    <TableCell>{t("bulkUpload.password")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.created.map((row) => (
                    <TableRow key={row.row}>
                      <TableCell>{row.full_name}</TableCell>
                      <TableCell>
                        <Chip size="small" label={row.login} />
                      </TableCell>
                      <TableCell>{row.email}</TableCell>
                      <TableCell>{row.department}</TableCell>
                      <TableCell>{row.role}</TableCell>
                      <TableCell>{row.password}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}

          {result.errors.length > 0 && (
            <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t("bulkUpload.row")}</TableCell>
                    <TableCell>{t("bulkUpload.error")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.errors.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>{row.row}</TableCell>
                      <TableCell sx={{ color: "error.main" }}>{row.error}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}
        </Stack>
      )}
    </Stack>
  );
}
