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
import ValidationSummary from "@/components/feedback/ValidationSummary";
import { useIssues } from "@/utils/validation";

const MAX_FILE_MB = 2;
const REQUIRED_COLUMNS = ["prenom", "nom", "departement_code"];

/** Première ligne du CSV, sans BOM ni guillemets, séparée par des virgules. */
function readHeader(text: string): string[] {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  return firstLine.split(",").map((c) => c.trim().replace(/^"|"$/g, "").toLowerCase());
}

// `service_code` est facultatif : laissé vide, la personne est rattachée
// directement à la direction, comme avant l'introduction des services.
const TEMPLATE_CSV =
  "prenom,nom,email,poste,departement_code,service_code,role\n" +
  "Awa,Ndiaye,,Technicienne,DSI,,MEMBER\n" +
  "Moussa,Diop,moussa.diop@exemple.com,Comptable,DAF,,MANAGER\n" +
  "Fatou,Sall,,Acheteuse,DAF,ACH,MEMBER\n";

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
  const [loadError, setLoadError] = useState(false);
  const { issues, check, clear } = useIssues();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiClient
      .get<Paginated<Company>>("/companies/")
      .then((r) => {
        setCompanies(r.data.results);
        if (!companyIdParam && r.data.results.length) setCompanyId(r.data.results[0].id);
      })
      .catch(() => setLoadError(true));
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
    const name = file?.name ?? "";
    const isExcel = /\.xlsx?$/i.test(name);
    const isCsv = /\.csv$/i.test(name);
    // Le contenu n'est lu que si le fichier a passé les contrôles de forme.
    let text = "";
    if (file && isCsv && file.size > 0 && file.size <= MAX_FILE_MB * 1024 * 1024) text = await file.text();
    const header = readHeader(text);
    const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
    const readable = text !== "";
    const semicolons = readable && missing.length > 0 && /[;\t]/.test(text.split(/\r?\n/, 1)[0] ?? "");
    const dataLines = text.split(/\r?\n/).slice(1).filter((l) => l.replace(/[,;\s"]/g, "") !== "");
    const ok = check([
      [!companyId, t("validation.bulkUpload.companyRequired")],
      [!file, t("validation.bulkUpload.fileRequired")],
      [!!file && isExcel, t("validation.bulkUpload.excelFile", { name })],
      [!!file && !isExcel && !isCsv, t("validation.bulkUpload.notCsv", { name })],
      [!!file && isCsv && file.size === 0, t("validation.bulkUpload.empty", { name })],
      [
        !!file && isCsv && file.size > MAX_FILE_MB * 1024 * 1024,
        t("validation.bulkUpload.tooLarge", { size: file ? (file.size / 1024 / 1024).toFixed(1).replace(".", ",") : "", max: MAX_FILE_MB }),
      ],
      [readable && text.includes("\uFFFD"), t("validation.bulkUpload.badEncoding")],
      [semicolons, t("validation.bulkUpload.wrongSeparator")],
      [readable && !semicolons && missing.length > 0, t("validation.bulkUpload.missingColumns", { columns: missing.join(", ") })],
      [readable && missing.length === 0 && dataLines.length === 0, t("validation.bulkUpload.noRows")],
    ]);
    if (!ok || !companyId || !file) return;
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
        <code>prenom,nom,email,poste,departement_code,service_code,role</code>
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {t("bulkUpload.serviceHint")}
      </Typography>

      <Paper elevation={0} sx={{ p: 2.5, border: "1px solid", borderColor: "divider" }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <TextField
              select
              label={t("bulkUpload.company")}
              value={companyId}
              onChange={(e) => {
                setCompanyId(Number(e.target.value));
                clear();
              }}
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

          <ValidationSummary issues={issues} onClose={clear} />
          <Stack direction="row" spacing={2} alignItems="center">
            <Button variant="outlined" component="label" startIcon={<UploadFileOutlinedIcon />}>
              {t("bulkUpload.chooseFile")}
              <input
                ref={fileInputRef}
                hidden
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  clear();
                }}
              />
            </Button>
            {file && <Typography variant="body2">{file.name}</Typography>}
            <Button
              variant="contained"
              onClick={handleUpload}
              disabled={uploading}
            >
              {uploading ? t("common.loading") : t("bulkUpload.launch")}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {loadError && <Alert severity="error">{t("common.loadError")}</Alert>}

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
