import { Alert, MenuItem, Stack, TextField } from "@mui/material";
import { createContext, Fragment, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import { setPeerDirection } from "@/app/peerState";

interface Peer {
  id: number;
  name: string;
  manager_name: string;
  manager_position: string;
  rubrics: string[];
}

const PeerContext = createContext<{ peerId: number | null; readOnly: boolean }>({ peerId: null, readOnly: false });

/** `readOnly` est vrai quand un directeur consulte la direction d'un pair : les
 *  écrans masquent alors leurs actions de saisie (le serveur les refuse aussi). */
export const usePeerDirection = () => useContext(PeerContext);

/**
 * Sélecteur « Voir les autres directions » pour un directeur, au-dessus d'un
 * écran de consultation (Cohésion d'équipe, Matrice ID-3A, Évaluations).
 *
 * Choisir une direction pose `peer_direction` sur toutes les requêtes de lecture
 * de l'écran, qui est remonté d'un bloc (clé = direction) pour tout recharger.
 * Les autres rôles, ou un directeur sans pair, voient l'écran tel quel.
 */
export function PeerDirectionScope({ rubric, children }: { rubric: "COHESION" | "ID3A" | "EVALUATIONS"; children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [peerId, setPeerId] = useState<number | null>(null);
  const isManager = user?.role === "MANAGER";

  useEffect(() => {
    if (!isManager) return;
    apiClient
      .get<Peer[]>("/departments/peers/")
      .then((r) => setPeers(r.data.filter((p) => p.rubrics.includes(rubric))))
      .catch(() => setPeers([]));
  }, [isManager, rubric]);

  // Posé pendant le rendu, avant les effets des enfants qui chargent leurs données.
  setPeerDirection(isManager ? peerId : null);
  useEffect(() => () => setPeerDirection(null), []);

  const peer = peers.find((p) => p.id === peerId) ?? null;
  return (
    <PeerContext.Provider value={{ peerId: peer ? peer.id : null, readOnly: peer !== null }}>
      {isManager && peers.length > 0 && (
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 2 }} className="pmc-no-print">
          <TextField
            select
            size="small"
            label={t("peerDirection.label")}
            value={peerId ?? ""}
            onChange={(e) => setPeerId(e.target.value === "" ? null : Number(e.target.value))}
            sx={{ minWidth: 320 }}
          >
            <MenuItem value="">{t("peerDirection.mine")}</MenuItem>
            {peers.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
                {p.manager_name ? ` — ${p.manager_name}` : ""}
              </MenuItem>
            ))}
          </TextField>
          {peer && (
            <Alert severity="info" sx={{ py: 0 }}>
              {t("peerDirection.readOnly", { name: peer.name })}
            </Alert>
          )}
        </Stack>
      )}
      <Fragment key={peer ? peer.id : "own"}>{children}</Fragment>
    </PeerContext.Provider>
  );
}
