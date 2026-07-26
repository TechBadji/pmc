# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Company Admin** (dirigeant/RH de l'entreprise cliente) — configure l'entreprise, crée les départements et les campagnes d'évaluation, supervise l'ensemble de l'organisation.
- **Manager d'équipe** — utilisateur quotidien : évalue les membres de son équipe (Hard/Soft Skills), consulte la Matrice ID-3A, gère les plans d'action et l'analyse de cohésion d'équipe.

Aucun des deux rôles ne prime sur l'autre dans les décisions produit — ils sont co-primaires.

Rôles secondaires (support, pas moteurs des décisions produit) : **Member** (collaborateur évalué, consulte sa propre performance) et **Super Admin** (opérateur de la plateforme, gère les entreprises clientes et leurs formules d'abonnement).

## Product Purpose

ID-PMC (People Management Canvas) est un SaaS multi-tenant de gestion de la performance RH, basé sur la méthodologie propriétaire **ID-3A** (Aptitudes × Attitudes = Altitude). Il permet aux entreprises clientes d'évaluer, suivre et faire progresser la performance individuelle et collective de leurs collaborateurs à travers des cycles d'évaluation périodiques.

## Positioning

Le différenciateur est la méthodologie ID-3A elle-même — pas une grille de performance générique. Chaque collaborateur est évalué sur deux axes indépendants (Aptitudes/Hard Skills et Attitudes/Soft Skills), combinés en un score de performance globale (Altitude). Cette double mesure est visualisée sur une matrice 2D positionnant chaque personne, permettant de comparer les profils et de suivre leur progression dans le temps — un neighboring product avec une simple note unique ou un 9-box générique ne pourrait pas reproduire cette lecture.

## Operating Context

Le Company Admin définit des **campagnes d'évaluation** (nom + dates de début/fin), valables pour tous les départements de l'entreprise. Pendant une campagne ouverte, chaque Manager évalue les membres de son équipe sur un référentiel de compétences (Hard/Soft Skills) propre à leur poste ou, à défaut, à leur département. Chaque évaluation compare aussi la performance actuelle à l'objectif fixé lors de la période précédente (colonnes Actuel / Objectif / Réalisé).

Isolation multi-tenant stricte : chaque entreprise cliente a ses propres utilisateurs, départements, référentiels de compétences et campagnes, sans visibilité croisée (sauf le Super Admin, qui supervise toutes les entreprises).

## Capabilities and Constraints

- 4 rôles : Super Admin, Company Admin, Manager, Member — permissions strictement hiérarchiques.
- Interface bilingue FR/EN, choisie individuellement par chaque utilisateur.
- Formules d'abonnement (DEMO / STANDARD / PREMIUM) avec fonctionnalités différenciées par entreprise.
- Chargement en masse d'utilisateurs par CSV, avec génération automatique de login/mot de passe.
- Récupération de mot de passe médiée par l'admin (pas d'envoi d'email automatique) — notification visuelle (badge clignotant) sur la demande en attente.
- Analyse de cohésion d'équipe et plans d'action de développement individuels.
- Stack : Django REST (Python) + React/TypeScript/MUI, Dockerisé, PostgreSQL.

## Brand Commitments

- Nom du produit : **ID-PMC** (People Management Canvas).
- Logo ID-PMC (palette bleu / orange / magenta — cf. `theme.ts`).
- Terminologie méthodologique **jamais traduite**, conservée en anglais dans les deux langues de l'interface : "Hard Skills" / "Soft Skills", ainsi que les libellés d'axes de la Matrice ID-3A ("APTITUDES (HARD SKILLS)" / "ATTITUDE (SOFT SKILLS)"), pour rester fidèles au support méthodologique source.

## Evidence on Hand

- Fiches PDF de référence de la méthodologie ID-PMC ("ID-3A du Manager", "Revue des performances individuelles des Directeurs 2022-2025") ayant directement guidé le rendu visuel de la Matrice ID-3A (vignettes photo cerclées de la couleur du palier de performance, mode Objectifs avec projections en pointillés).
- Données de démonstration **fictives** : entreprise "Elias Energy Group", 7 départements, environ 70 collaborateurs générés avec évaluations variées.

## Product Principles

- Isolation multi-tenant stricte : aucune fuite de données entre entreprises clientes.
- La méthodologie ID-3A (Aptitudes × Attitudes = Altitude) structure toute évaluation — jamais remplacée ou diluée par une grille générique.
- Les décisions produit servent Company Admin et Manager à égalité.
- Les données saisies par les utilisateurs (noms, postes, notes, commentaires) ne sont jamais traduites automatiquement ni inventées.
- L'historisation s'appuie sur des campagnes d'évaluation à dates réelles (jamais du texte libre) pour garantir un tri chronologique et une comparabilité fiables entre départements.

## Statut produit

**Démo / prototype.** Pas encore de client réel en production — les données actuelles (Elias Energy Group) sont fictives, destinées à la démonstration.
