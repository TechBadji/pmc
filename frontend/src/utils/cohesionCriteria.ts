import { useTranslation } from "react-i18next";
import { useAppSelector } from "@/app/hooks";

/** Les dix critères de la fiche de cohésion, au nom de l'entreprise connectée.
 *
 * Les libellés nomment l'entreprise (« La vision de SUNU Bank TOGO… ») plutôt
 * que « l'organisation » : la fiche se lit alors comme un document interne. Le
 * nom ne peut donc pas être figé dans les traductions, qui sont communes à
 * tous les tenants — il s'injecte à l'affichage.
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
export function useCohesionCriteria(): string[] {
  const { t } = useTranslation();
  const companyName = useAppSelector((s) => s.auth.user?.company_name);
  const fallback = t("cohesion.organisationFallback");
  const name = companyName?.trim() || fallback;
  const criteria = t("cohesion.criteria", { returnObjects: true, company: name }) as string[];
  return criteria.map((criterion) => criterion.replace(/\{\{\s*company\s*\}\}/g, name));
}
