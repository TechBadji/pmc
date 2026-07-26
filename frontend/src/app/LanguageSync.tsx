import { useEffect } from "react";
import { setAppLanguage } from "@/i18n";
import { useAppSelector } from "./hooks";

/** Applique la langue enregistrée sur le profil de l'utilisateur connecté
 * dès qu'elle est connue (après connexion ou modification dans le profil),
 * en la faisant primer sur la détection navigateur utilisée avant connexion. */
export default function LanguageSync() {
  const language = useAppSelector((s) => s.auth.user?.language);

  useEffect(() => {
    if (language === "fr" || language === "en") setAppLanguage(language);
  }, [language]);

  return null;
}
