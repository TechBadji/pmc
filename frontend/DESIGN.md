---
name: ID-PMC
description: SaaS multi-tenant de gestion de la performance RH basé sur la méthodologie ID-3A
colors:
  trust-blue: "#2E8FCB"
  signal-magenta: "#B23FA0"
  alert-orange: "#E08A34"
  hard-skills-blue: "#2E5AAC"
  soft-skills-green: "#3F9142"
  perf-very-low: "#d03b3b"
  perf-low: "#ec835a"
  perf-average: "#898781"
  perf-good: "#4caf50"
  perf-outstanding: "#0ca30c"
  surface-light: "#ffffff"
  canvas-light: "#f9f9f7"
  surface-dark: "#1a1a1a"
  canvas-dark: "#121212"
  chart-grid: "#e1e0d9"
  chart-ink: "#898781"
typography:
  display:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontWeight: 700
  headline:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontWeight: 600
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontWeight: 400
rounded:
  sm: "8px"
  md: "10px"
  nav-item: "16px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  card:
    backgroundColor: "{colors.surface-light}"
    rounded: "{rounded.sm}"
    padding: "16px"
  nav-item:
    rounded: "{rounded.nav-item}"
  nav-item-selected:
    backgroundColor: "{colors.trust-blue}"
---

# Design System: ID-PMC

## Overview

**Creative North Star: "Le Tableau de Bord du Stratège"**

ID-PMC est l'instrument d'un dirigeant ou d'un manager qui pilote la performance de son équipe avec méthode : précis, digne de confiance, jamais tape-à-l'œil. L'interface reste chaleureuse sans perdre en rigueur — les photos des collaborateurs, cerclées de la couleur de leur palier de performance, humanisent des données qui pourraient autrement rester abstraites. Rien n'est décoratif sans fonction : chaque couleur, chaque bordure, chaque puce porte une information (un rôle, un statut, un palier), jamais un simple effet.

Le système rejette explicitement le vocabulaire du SaaS "grand public" ludifié (badges de gamification, illustrations décoratives, tons pastel criards) au profit d'une esthétique d'outil professionnel : surfaces plates, bordures fines, couleur réservée aux signaux qui comptent.

**Key Characteristics:**
- Plat par défaut, jamais d'ombre portée — la hiérarchie se lit par la bordure et l'espacement, pas par l'élévation.
- La couleur est un signal, pas une décoration : réservée aux paliers de performance, aux rôles et aux statuts.
- Les photos de collaborateurs (cerclées de couleur) sont le seul élément véritablement chaleureux d'une interface autrement dense et fonctionnelle.

## Colors

Palette fonctionnelle héritée du logo ID-PMC (bleu/magenta/orange), complétée par deux familles de statut dédiées : les 5 paliers de performance ID-3A et les 2 couleurs Hard/Soft Skills.

### Primary
- **Bleu Confiance** (#2E8FCB): couleur d'action principale (boutons, liens, sélection de navigation, dirigeant du logo). Utilisée avec parcimonie — jamais en aplat sur de grandes surfaces.

### Secondary
- **Magenta Signal** (#B23FA0): accent secondaire hérité du logo, réservé aux besoins de contraste ponctuels (pas encore massivement utilisé dans l'implémentation actuelle).

### Tertiary
- **Orange Alerte** (#E08A34): signalétique d'avertissement (`warning` du thème MUI), troisième couleur du logo.

### Neutral
- **Surface** (#ffffff clair / #1a1a1a sombre): fond des cartes et panneaux (`Paper`).
- **Canvas** (#f9f9f7 clair / #121212 sombre): fond de page, légèrement teinté pour distinguer le canvas des cartes blanches posées dessus.

### Statut — Paliers de performance ID-3A
- **Très faible** (#d03b3b), **Faible** (#ec835a), **Moyenne** (#898781), **Bonne** (#4caf50), **Exceptionnelle** (#0ca30c) — jamais réutilisées hors de ce rôle précis ; c'est le seul endroit où la couleur porte un jugement de valeur.

### Statut — Hard Skills / Soft Skills
- **Bleu Hard Skills** (#2E5AAC) et **Vert Soft Skills** (#3F9142) : distinguent systématiquement les deux volets Aptitudes/Attitudes de la méthodologie ID-3A — en-têtes de tableau, vignettes, graphiques. Jamais interchangés.

### Named Rules
**La Règle du Signal Unique.** Une couleur ne porte jamais deux significations différentes selon l'écran : le bleu Hard Skills ne devient jamais un bouton d'action, le bleu Confiance ne sert jamais à distinguer un palier de performance.

## Typography

**Display/Body Font:** system-ui, -apple-system, "Segoe UI", sans-serif (pile système)

**Directions en cours d'évaluation.** Les variantes servies sur `/login1`, `/login2`, … (`src/features/auth/variants/`) sont des planches de comparaison figées : leurs choix — polices, palettes, matières — **n'appartiennent pas au système** tant qu'une direction n'a pas été retenue. Ne pas s'y référer pour concevoir un autre écran.

**Exception — l'écran de connexion.** *Baloo 2* (700/800), sans-serif géométrique arrondie, est chargée depuis Google Fonts (`display=swap`) et sert **uniquement** les titres de `/login` : c'est la seule surface où la marque parle avant les données, et cette graisse ronde est ce qui rattache la page au wordmark PMC. Tout le reste de l'application, l'écran de connexion compris pour son texte courant, reste sur la pile système.

**Character:** Neutre et lisible avant tout ; la police système renforce la sensation d'outil professionnel intégré plutôt que de produit marketing.

### Hierarchy
- **Display/Headline** (weight 700, variantes `h1`/`h2` MUI) : titres de page.
- **Title** (weight 600, variante `h3` MUI) : sous-titres de section, valeurs chiffrées mises en avant (ex. Altitude en grand format coloré).
- **Body** (weight 400) : contenu courant, tableaux, libellés de formulaire.
- **Label** (variant `caption`, `text.secondary`) : métadonnées, aide contextuelle, légendes de graphique.

## Layout

Navigation latérale permanente (`Drawer` MUI, 260px, jamais rétractable) avec logo en tête, séparée du contenu par une bordure fine (`borderRight: 1px solid divider`) plutôt qu'une ombre. Le contenu principal s'organise en `Stack` verticaux à espacement `spacing={3}` (24px), chaque section étant une carte (`Paper`) distincte plutôt qu'un bloc continu. Les tableaux de données utilisent systématiquement une pagination (`TablePagination`) au-delà d'une dizaine de lignes plutôt qu'un défilement infini.

## Elevation & Depth

**Le système est plat par construction — aucune ombre portée n'est utilisée.** Toutes les cartes (`Paper`) sont rendues avec `elevation={0}` et une bordure de 1px (`border: "1px solid", borderColor: "divider"`) : ce motif apparaît de façon quasi systématique (27 occurrences observées dans le code). La profondeur, quand elle existe, vient de la couleur de fond (surface vs canvas), jamais du flou.

### Named Rules
**La Règle du Plat-par-Défaut.** Une carte se distingue du fond par une bordure fine, jamais par une ombre. Les seules exceptions sont les `Dialog`/menus contextuels MUI (ombre native du composant, non stylée manuellement) et l'écran de connexion (voir ci-dessous).

**Exception — l'écran de connexion.** `/login` est la seule page qui assume le rendu « glossy/embossé » des tuiles du canevas ID-PMC : dégradés internes, reflet supérieur et ombre portée douce sur le motif SVG, la plaque du logo et le CTA. C'est un choix d'identité de marque sur une page sans données ; dès que l'utilisateur est authentifié, la Règle du Plat-par-Défaut reprend sans exception.

## Shapes

Coins légèrement arrondis et cohérents : 10px par défaut (`theme.shape.borderRadius`), 8px (`borderRadius: 1` MUI) pour les conteneurs de tableau, 16px (`borderRadius: 2` MUI) pour les items de navigation — jamais de coins vifs (0px) ni très arrondis (pill-shape), sauf les `Chip` qui suivent leur forme pilule native MUI.

## Components

### Boutons
- **Shape:** coins à 10px (rayon par défaut du thème), jamais custom.
- **Primary:** fond Bleu Confiance plein, texte blanc — réservé à l'action principale d'un écran ou d'un dialogue.
- **Secondary/Ghost:** variante `outlined`, utilisée pour "Annuler"/actions secondaires, toujours à côté d'un bouton primary.

### Chips (statut, rôle, palier de performance)
- **Style:** fond teinté à la couleur du statut (`bgcolor: color + "22"`, soit ~13% d'opacité), texte plein dans la même couleur, `fontWeight: 600`. C'est le vocabulaire visuel dominant pour tout statut binaire ou catégoriel (actif/bloqué, rôle utilisateur, palier de performance, formule d'abonnement).
- **État neutre/vide:** `variant="outlined"` sans fond teinté (ex. "Non évalué"), pour distinguer visuellement "pas de valeur" d'une vraie catégorie.

### Cards / Containers
- **Corner Style:** 8px (`borderRadius: 1`).
- **Background:** Surface (blanc/sombre selon le mode).
- **Shadow Strategy:** aucune — voir Elevation & Depth.
- **Border:** 1px, couleur `divider` du thème (s'adapte automatiquement clair/sombre).
- **Internal Padding:** 16 à 24px (`p: 2` à `p: 3`) selon la densité du contenu.

### Tableaux
- **En-tête coloré :** quand un tableau représente une catégorie forte (Hard Skills / Soft Skills), l'en-tête entier prend la couleur de la catégorie en fond plein avec texte blanc `fontWeight: 700` — plus appuyé qu'un simple soulignement, pour que la catégorie reste identifiable même en scrollant.
- **Lignes désactivées/exclues :** opacité réduite (0.45) plutôt que masquage, pour indiquer "présent mais exclu" sans faire disparaître l'information.

### Navigation (Drawer latéral)
- **Style:** item plein-largeur, coins 16px, état `selected` en teinte Bleu Confiance (comportement natif MUI `ListItemButton selected`).
- **Notification:** badge rouge pulsant (`animation: scale 1 → 1.35 → 1, 1.1s infinite`) sur l'icône concernée quand une action est en attente (ex. demande de réinitialisation de mot de passe) — seule animation continue du système, réservée aux alertes nécessitant une action.

### Vignette photo cerclée (composant signature — Matrice ID-3A)
Photo de collaborateur découpée en cercle, entourée d'un anneau dont l'épaisseur est proportionnelle au rayon (~26-27%) et dont la couleur est le palier de performance à cette période. Grossit au survol (transition 150ms) pour mettre le visage en valeur sans perdre l'anneau de couleur, qui reste proportionnellement visible à toutes les tailles. Un halo clair (jamais une ombre) sépare l'anneau du fond du graphique.

## Do's and Don'ts

### Do:
- **Do** réserver la couleur aux signaux qui comptent (statut, rôle, palier, catégorie Hard/Soft Skills) — jamais décorative.
- **Do** utiliser `elevation={0}` + bordure `divider` pour toute carte ou panneau.
- **Do** garder les données saisies par l'utilisateur (noms, postes, notes) dans leur langue d'origine, jamais traduites automatiquement.
- **Do** afficher un état vide/neutre explicitement (`Chip` `outlined`, "—") plutôt que de masquer une cellule sans valeur.

### Don't:
- **Don't** ajouter d'ombre portée à une carte ou un bouton — la profondeur vient de la bordure et du fond, jamais du flou.
- **Don't** réutiliser le bleu Hard Skills (#2E5AAC) ou le vert Soft Skills (#3F9142) en dehors de leur rôle Aptitudes/Attitudes.
- **Don't** traduire "Hard Skills"/"Soft Skills" ni les libellés d'axes de la Matrice ID-3A — ils restent identiques en français et en anglais, fidèles au support méthodologique source.
- **Don't** introduire de gamification (badges décoratifs, confettis, tons pastel) — l'outil reste sobre et professionnel même dans ses moments chaleureux (photos, couleurs de palier).
