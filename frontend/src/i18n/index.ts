import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

export const LANGUAGE_STORAGE_KEY = "idpmc_language";

type Dict = Record<string, unknown>;

function isDict(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge(target: Dict, source: Dict): Dict {
  const out: Dict = { ...target };
  for (const [key, value] of Object.entries(source)) {
    out[key] = isDict(value) && isDict(out[key]) ? deepMerge(out[key] as Dict, value) : value;
  }
  return out;
}

/** Les textes d'un domaine (messages d'erreur, contrôles de saisie d'un écran)
 * vivent dans `domains/<nom>.<langue>.json` : chaque écran ajoute les siens
 * sans toucher au gros fichier commun, et ils sont fusionnés ici au démarrage. */
function domainTexts(files: Record<string, unknown>): Dict {
  return Object.values(files).reduce<Dict>((acc, file) => deepMerge(acc, file as Dict), {});
}

const frDomains = domainTexts(import.meta.glob("./domains/*.fr.json", { eager: true, import: "default" }));
const enDomains = domainTexts(import.meta.glob("./domains/*.en.json", { eager: true, import: "default" }));

function detectInitialLanguage(): "fr" | "en" {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === "fr" || stored === "en") return stored;
  return navigator.language.toLowerCase().startsWith("en") ? "en" : "fr";
}

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: deepMerge(fr as Dict, frDomains) },
    en: { translation: deepMerge(en as Dict, enDomains) },
  },
  lng: detectInitialLanguage(),
  fallbackLng: "fr",
  interpolation: { escapeValue: false },
});

export function setAppLanguage(lang: "fr" | "en") {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  i18n.changeLanguage(lang);
}

export default i18n;
