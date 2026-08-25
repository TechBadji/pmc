import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { Box, Button, IconButton, InputBase, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { TeamRelationship, UserRecord } from "@/api/types";

/** Bandeau de section des planches ID-PMC — vert olive, texte blanc centré. */
export const BOARD_GREEN = "#8faa54";
export const BOARD_CREAM = "#f5efd6";
export const BOARD_TEXT = "#20242e";

export function BandTitle({
  children,
  bg = BOARD_GREEN,
  color = "#fff",
  align = "center",
}: {
  children: React.ReactNode;
  bg?: string;
  /** Le bandeau jaune de la planche porte un texte sombre, pas blanc. */
  color?: string;
  align?: "center" | "left";
}) {
  return (
    <Box sx={{ bgcolor: bg, borderRadius: 0.5, py: 0.4, px: 1, textAlign: align }}>
      <Typography sx={{ color, fontWeight: 800, fontSize: 12.5, letterSpacing: 0.4 }}>{children}</Typography>
    </Box>
  );
}

/**
 * Liste numérotée éditable — la brique de saisie de toutes les planches.
 * Le nombre de lignes est libre : `rows` fixe seulement le minimum affiché,
 * pour que la planche garde sa forme même vide.
 */
export function EditableList({
  items,
  onChange,
  rows = 5,
  readOnly,
  placeholder,
  dense,
  hideEmpty,
  asText,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  rows?: number;
  readOnly?: boolean;
  placeholder?: string;
  dense?: boolean;
  /** N'affiche que les lignes renseignées : le bloc ne prend que la place de
   * ce qu'il contient, au lieu d'étirer la planche sur des cases vides. */
  hideEmpty?: boolean;
  /** Rendu en texte, sans champ ni bouton : l'état de lecture de la planche,
   * celui qu'on projette et qu'on remet au client. */
  asText?: boolean;
}) {
  const { t } = useTranslation();
  const shown = hideEmpty ? [...items] : [...items];
  if (!hideEmpty) {
    while (shown.length < rows) shown.push("");
  }

  function setAt(index: number, value: string) {
    const next = [...shown];
    next[index] = value;
    // On ne conserve pas les lignes vides de fin : la liste reste propre en base.
    while (next.length && next[next.length - 1] === "") next.pop();
    onChange(next);
  }

  if (asText) {
    const filled = items.filter((v) => v.trim() !== "");
    return (
      <Stack spacing={dense ? 0.35 : 0.5}>
        {filled.length === 0 && (
          <Typography variant="caption" color="text.secondary">
            —
          </Typography>
        )}
        {filled.map((value, i) => (
          <Stack key={i} direction="row" spacing={0.75} alignItems="flex-start">
            <Typography sx={{ fontSize: 11, color: "#5b6472", lineHeight: 1.5 }}>▫</Typography>
            <Typography sx={{ fontSize: dense ? 11.5 : 12.5, color: "#1f3864", lineHeight: 1.35 }}>{value}</Typography>
          </Stack>
        ))}
      </Stack>
    );
  }

  return (
    <Stack spacing={dense ? 0.4 : 0.6}>
      {hideEmpty && shown.length === 0 && readOnly && (
        <Typography variant="caption" color="text.secondary">
          —
        </Typography>
      )}
      {shown.map((value, i) => (
        <Stack key={i} direction="row" spacing={0.75} alignItems="center">
          <Typography sx={{ fontSize: 11.5, color: "text.secondary", width: 16, textAlign: "right" }}>{i + 1}.</Typography>
          <Box
            sx={{
              flex: 1,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 0.75,
              px: 1,
              py: dense ? 0.15 : 0.4,
              bgcolor: "background.paper",
            }}
          >
            <InputBase
              value={value}
              readOnly={readOnly}
              placeholder={placeholder}
              onChange={(e) => setAt(i, e.target.value)}
              sx={{ width: "100%", fontSize: dense ? 11.5 : 12.5, "& input": { p: 0 } }}
            />
          </Box>
          {!readOnly && value !== "" && (
            <IconButton size="small" aria-label={t("common.delete")} onClick={() => setAt(i, "")}>
              <DeleteOutlineIcon sx={{ fontSize: 15 }} />
            </IconButton>
          )}
        </Stack>
      ))}
      {!readOnly && (
        <Button size="small" startIcon={<AddOutlinedIcon />} onClick={() => onChange([...items, ""])} sx={{ alignSelf: "flex-start" }}>
          {t("common.add")}
        </Button>
      )}
    </Stack>
  );
}

/** Barre de période : équipe, saisie consultée, création d'une nouvelle. */
export function BoardPeriodBar({
  dates,
  currentId,
  onSelect,
  onNew,
  onSave,
  dirty,
  saving,
  canEdit,
  extra,
}: {
  dates: { id: number; date: string }[];
  currentId: number | "";
  onSelect: (id: number | "") => void;
  onNew: () => void;
  onSave: () => void;
  dirty: boolean;
  saving: boolean;
  canEdit: boolean;
  extra?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap className="pmc-no-print">
      {extra}
      <TextField
        select
        size="small"
        label={t("teamBoard.period")}
        value={currentId}
        onChange={(e) => onSelect(e.target.value === "" ? "" : Number(e.target.value))}
        sx={{ minWidth: 200 }}
      >
        {dates.length === 0 && <MenuItem value="">{t("teamBoard.noEntry")}</MenuItem>}
        {dates.map((d) => (
          <MenuItem key={d.id} value={d.id}>
            {d.date}
          </MenuItem>
        ))}
      </TextField>
      {canEdit && (
        <>
          <Button size="small" startIcon={<AddOutlinedIcon />} onClick={onNew}>
            {t("teamBoard.newEntry")}
          </Button>
          <Button size="small" variant="contained" onClick={onSave} disabled={!dirty || saving}>
            {saving ? t("changePassword.saving") : t("common.save")}
          </Button>
        </>
      )}
    </Stack>
  );
}

/**
 * Toile relationnelle de l'équipe : chaque membre sur un cercle, chaque
 * relation tracée entre deux membres et colorée par sa qualité. Les relations
 * correctes restent grises en arrière-plan ; les excellentes, difficiles et
 * toxiques ressortent — c'est la lecture de la planche ID-PMC.
 */
export const RELATION_COLORS: Record<TeamRelationship["quality"], string> = {
  CORRECT: "#5f6672", // gris franc : le lien doit se voir sans hésitation
  EXCELLENT: "#2e7d32",
  DIFFICULT: "#ef8f2b",
  TOXIC: "#c62828",
};

export function TeamSpiderGraph({
  members,
  relationships,
  size = 420,
  centerId,
  showLegend = true,
}: {
  members: UserRecord[];
  relationships: TeamRelationship[];
  size?: number;
  /** Personne placée au centre — le responsable de l'équipe. */
  centerId?: number | null;
  showLegend?: boolean;
}) {
  const { t } = useTranslation();
  if (members.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: "center" }}>
        {t("teamBoard.noMember")}
      </Typography>
    );
  }
  const radius = size / 2 - 48;
  // Le centre est légèrement au-dessus du milieu : les étiquettes de noms
  // pendent sous les vignettes, sans quoi la toile paraît basse dans son cadre.
  const center = size / 2;
  const positions = new Map<number, { x: number; y: number }>();
  // Le responsable occupe le centre : la toile se lit alors comme une équipe
  // autour de son manager, et non comme un cercle de pairs indifférenciés.
  const middle = members.find((m) => m.id === centerId) ?? null;
  const ring = middle ? members.filter((m) => m.id !== middle.id) : members;
  if (middle) positions.set(middle.id, { x: center, y: center });
  ring.forEach((m, i) => {
    const angle = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
    positions.set(m.id, { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) });
  });

  // Tous les liens ont la même épaisseur : seule la couleur distingue leur
  // nature. Les relations marquantes se dessinent néanmoins en dernier, pour
  // passer au-dessus du maillage gris aux croisements.
  const ordered = [...relationships].sort(
    (a, b) => (a.quality === "CORRECT" ? 0 : 1) - (b.quality === "CORRECT" ? 0 : 1)
  );

  return (
    <Box sx={{ width: "100%", overflowX: "auto" }}>
      <svg
        viewBox={`0 8 ${size} ${size - 8}`}
        width="100%"
        style={{ display: "block", margin: "0 auto", maxWidth: size, height: "auto" }}
      >
        {ordered.map((rel) => {
          const from = positions.get(rel.from_user);
          const to = positions.get(rel.to_user);
          if (!from || !to) return null;
          const strong = rel.quality !== "CORRECT";
          return (
            <line
              key={rel.id}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={RELATION_COLORS[rel.quality]}
              strokeWidth={2.6}
              opacity={strong ? 0.95 : 0.85}
            />
          );
        })}
        {members.map((m) => {
          const p = positions.get(m.id)!;
          const name = m.full_name || m.email;
          return (
            <g key={m.id}>
              <circle cx={p.x} cy={p.y} r={22} fill="#e9edf4" stroke="#8a95a3" strokeWidth={2} />
              {m.avatar && (
                <>
                  <clipPath id={`clip-${m.id}`}>
                    <circle cx={p.x} cy={p.y} r={21} />
                  </clipPath>
                  <image
                    href={m.avatar}
                    x={p.x - 21}
                    y={p.y - 21}
                    width={42}
                    height={42}
                    clipPath={`url(#clip-${m.id})`}
                    preserveAspectRatio="xMidYMid slice"
                  />
                </>
              )}
              {!m.avatar && (
                <text x={p.x} y={p.y + 5} textAnchor="middle" fontSize={15} fontWeight={700} fill="#3c4655">
                  {name.charAt(0).toUpperCase()}
                </text>
              )}
              <rect x={p.x - 42} y={p.y + 25} width={84} height={16} rx={3} fill="#fdf6c8" stroke="#d8d2a8" />
              <text x={p.x} y={p.y + 37} textAnchor="middle" fontSize={10} fontWeight={700} fill={BOARD_TEXT}>
                {name.length > 14 ? `${name.slice(0, 13)}…` : name}
              </text>
            </g>
          );
        })}
      </svg>
      {showLegend && (
      <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
        {(Object.keys(RELATION_COLORS) as TeamRelationship["quality"][]).map((q) => (
          <Stack key={q} direction="row" spacing={0.75} alignItems="center">
            <Box sx={{ width: 22, height: 3, bgcolor: RELATION_COLORS[q], borderRadius: 2 }} />
            <Typography variant="caption" color="text.secondary">
              {t(`cohesion.relationQuality.${q}`)}
            </Typography>
          </Stack>
        ))}
      </Stack>
      )}
    </Box>
  );
}

/** Encadré d'une planche : bandeau titre puis contenu, sur fond clair. */
export function BoardPanel({
  title,
  bg = BOARD_GREEN,
  titleColor,
  titleAlign,
  children,
  sx,
}: {
  title: React.ReactNode;
  bg?: string;
  titleColor?: string;
  titleAlign?: "center" | "left";
  children: React.ReactNode;
  sx?: object;
}) {
  return (
    <Paper elevation={0} sx={{ p: 1, border: "1px solid", borderColor: "divider", height: "100%", ...sx }}>
      <BandTitle bg={bg} color={titleColor} align={titleAlign}>
        {title}
      </BandTitle>
      <Box sx={{ mt: 1 }}>{children}</Box>
    </Paper>
  );
}
