import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

export const LANGUAGE_STORAGE_KEY = "idpmc_language";

function detectInitialLanguage(): "fr" | "en" {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === "fr" || stored === "en") return stored;
  return navigator.language.toLowerCase().startsWith("en") ? "en" : "fr";
}

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
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
