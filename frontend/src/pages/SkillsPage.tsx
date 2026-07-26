import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import type { Paginated, SkillMatrix } from "@/api/types";

export default function SkillsPage() {
  const { t } = useTranslation();
  const [matrices, setMatrices] = useState<SkillMatrix[]>([]);

  useEffect(() => {
    apiClient.get<Paginated<SkillMatrix>>("/skill-matrices/").then((r) => setMatrices(r.data.results));
  }, []);

  const byPosition = matrices.reduce<Record<string, SkillMatrix[]>>((acc, m) => {
    (acc[m.name] ??= []).push(m);
    return acc;
  }, {});

  return (
    <Stack spacing={3}>
      <Typography variant="h5" fontWeight={700}>
        {t("nav.skillMatrices")}
      </Typography>

      {Object.entries(byPosition).map(([position, group]) => (
        <Accordion key={position} elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography fontWeight={600}>{position}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
              {group.map((matrix) => (
                <Stack key={matrix.id} sx={{ flex: 1 }} spacing={1}>
                  <Chip
                    size="small"
                    label={matrix.type === "HARD" ? "Hard Skills" : "Soft Skills"}
                    color={matrix.type === "HARD" ? "primary" : "secondary"}
                    sx={{ alignSelf: "flex-start" }}
                  />
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>{t("skills.competency")}</TableCell>
                        <TableCell align="right">{t("skills.weight")}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {matrix.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.name}</TableCell>
                          <TableCell align="right">{item.weight}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Stack>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      ))}
    </Stack>
  );
}
