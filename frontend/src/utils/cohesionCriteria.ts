import { useTranslation } from "react-i18next";
import { useAppSelector } from "@/app/hooks";

/** Les dix critères de la fiche de cohésion, au nom de l'entreprise connectée
 *  — ou d'une direction précise quand `targetName` est fourni.
 *
 * Les libellés nomment une entité (« La vision de SUNU Bank TOGO… ») plutôt
 * que « l'organisation » : la fiche se lit alors comme un document interne.
 * Pour un avis portant sur l'entreprise entière (portée ORGANISATION), c'est
 * l'entreprise ; pour un avis « sur sa direction » (portée TEAM), c'est la
 * direction visée qui doit apparaître, pas le groupe — un collaborateur de
 * SUNU Group juge SUNU Group, pas Africa Insurance Group. `targetName`
 * porte ce choix : à l'appelant de le renseigner (nom de la direction) pour
 * une portée TEAM, et de le laisser vide pour une portée ORGANISATION.
 *
 * La substitution est faite ici plutôt que laissée à i18next : `returnObjects`
 * renvoie le tableau brut, et selon la version l'interpolation n'est pas
 * appliquée aux chaînes qu'il contient. On passe quand même la valeur à `t()`,
 * et le `replace` rattrape le cas où elle n'aurait pas été substituée.
 *
 * Le texte produit sert aussi de clé de rapprochement : `CohesionCriterionScore`
 * et `CohesionResponse` stockent le libellé, et les écrans retrouvent une note
 * déjà saisie en comparant les chaînes. Toute évolution de ces libellés doit
 * donc s'accompagner d'une reprise des lignes déjà en base.
 */
export function useCohesionCriteria(targetName?: string | null): string[] {
  const { t } = useTranslation();
  const companyName = useAppSelector((s) => s.auth.user?.company_name);
  const fallback = t("cohesion.organisationFallback");
  const name = targetName?.trim() || companyName?.trim() || fallback;
  const criteria = t("cohesion.criteria", { returnObjects: true, company: name }) as string[];
  return criteria.map((criterion) => criterion.replace(/\{\{\s*company\s*\}\}/g, name));
}
