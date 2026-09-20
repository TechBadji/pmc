/** Direction pair actuellement consultée par un directeur (lecture seule).
 *  État de module, sans dépendance : l'intercepteur d'API le lit pour ajouter
 *  `peer_direction` aux requêtes GET, et `PeerDirectionScope` le pose. */
let active: number | null = null;

export function getPeerDirection(): number | null {
  return active;
}

export function setPeerDirection(id: number | null) {
  active = id;
}
