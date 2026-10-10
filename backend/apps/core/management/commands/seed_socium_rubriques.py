"""
Peuple les rubriques individuelles de SOCIUM sur ses quatre campagnes (Année
2023, 2024, 2025 et Semestre 1 2026), pour le DGA, le CTO et les
collaborateurs créés par `seed_socium` :

  - référentiels de compétences : un par poste (DGA, CTO, Collaborateur), sans
    direction de rattachement, et les soft skills communs à toutes les démos ;
  - évaluations ID-3A (le DGA et le CTO par le CEO, les collaborateurs par le
    DGA), forces & faiblesses, fiches d'objectifs ;
  - auto-évaluation managériale, sa synthèse et Monkey Management (CEO compris) ;
  - avis 360° Feedback / Forward sur les deux dernières campagnes ;
  - avis de chacun sur l'organisation (cohésion, portée ORGANISATION) ;
  - fiches Performance ID, téléphone de chaque compte.

SOCIUM n'a aucune direction : les rubriques qui se lisent par équipe (PSI,
fiche de cohésion d'une direction, relations et cartes d'équipe, objectifs et
plans d'action d'équipe) ne sont pas peuplées — elles n'ont personne à viser.

Mêmes générateurs que SUNU Bank Sénégal et Africa Insurance Group. Le CEO
n'est évalué par personne.

Relançable sans doublon, mais la relance RECONSTRUIT ces rubriques pour
l'entreprise : ce qui aurait été saisi entre-temps dans l'application est
écrasé. Ne touche à aucune autre entreprise.

Usage:
    python manage.py seed_socium_rubriques
"""
import random
from datetime import date, timedelta

from django.core.management.base import CommandError
from django.db import transaction

from apps.core.management.commands import seed_africa_insurance_group as MAIN
from apps.core.management.commands import seed_africa_insurance_group_rubriques as R
from apps.core.management.commands import seed_socium as SOCIUM
from apps.core.management.commands import seed_sunu_bank_senegal_rubriques as SBS
from apps.core.management.commands.seed_africa_insurance_group_psi_360 import CONTINUE, IMPROVE, START, STOP, STRENGTHS
from apps.core.models import Company, PerformanceProfile, User
from apps.evaluations.models import (
    Evaluation,
    EvaluationCampaign,
    Feedback360,
    PerformanceObjective,
    recompute_evaluation_scores,
)
from apps.teams.models import CohesionResponse

# Dix savoir-faire par poste : le référentiel « hard » porte le nom du poste,
# c'est par lui que la fiche d'évaluation le retrouve en l'absence de direction.
HARD_SKILLS = {
    SOCIUM.DGA_POSITION: [
        "Déclinaison de la stratégie en plans d'action", "Pilotage budgétaire et financier",
        "Suivi de la performance opérationnelle", "Développement commercial et grands comptes",
        "Gestion des risques et conformité", "Conduite du changement",
        "Négociation avec les partenaires et fournisseurs", "Gouvernance et reporting au conseil",
        "Gestion des ressources humaines", "Pilotage des projets transverses",
    ],
    SOCIUM.CTO_POSITION: [
        "Architecture des systèmes d'information", "Cybersécurité et protection des données",
        "Pilotage de la feuille de route technique", "Gestion des plateformes cloud et de l'infrastructure",
        "Méthodes agiles et livraison continue", "Qualité logicielle et revue de code",
        "Gestion des fournisseurs technologiques", "Budget et maîtrise des coûts techniques",
        "Données, reporting et intelligence artificielle", "Continuité d'activité et gestion des incidents",
    ],
    SOCIUM.EMPLOYEE_POSITION: [
        "Maîtrise des procédures du poste", "Qualité et fiabilité des livrables",
        "Respect des délais", "Maîtrise des outils bureautiques et métiers",
        "Relation client et sens du service", "Analyse et résolution de problèmes",
        "Rédaction et reporting", "Gestion de projet",
        "Connaissance des offres de l'entreprise", "Respect des règles de sécurité et de conformité",
    ],
}

# Contenu de l'entreprise, au format d'une direction d'Africa Insurance Group
# (objectifs business : libellé, indicateur, cible, valeur de départ). « SOC »
# n'est le code d'aucune direction : c'est la clé de ce contenu.
SPEC_CODE = "SOC"
R.DEPT[SPEC_CODE] = dict(
    vision="Faire de SOCIUM le partenaire de confiance de ses clients, par la qualité du service et l'innovation.",
    values=["Sens du client", "Fiabilité", "Esprit d'équipe", "Innovation"],
    counter=["Engagements non tenus", "Travail en silo", "Rétention d'information"],
    wins=["Chiffre d'affaires en hausse de 15 %", "Portail client mis en service", "Certification qualité obtenue",
          "Deux contrats cadres signés", "Délais de livraison réduits d'un tiers"],
    fails=["Projets livrés avec retard", "Dépendance à quelques grands clients",
           "Processus encore peu documentés", "Rotation sur les profils techniques"],
    biz=[("Chiffre d'affaires (M FCFA)", "Chiffre d'affaires de la période", 4800, 3600),
         ("Satisfaction client (score /100)", "Enquête de satisfaction", 90, 74),
         ("Livrables remis dans les délais (%)", "Respect des échéances", 95, 78)],
    qual=["Master Management — ISM Dakar", "Master Informatique — École Supérieure Polytechnique de Dakar",
          "Master Finance — CESAG Dakar", "Licence Gestion — UCAD", "Certification PMP"],
)


class Command(SBS.Command):
    help = "Peuple les rubriques individuelles de SOCIUM sur ses quatre campagnes."

    def add_arguments(self, parser):
        pass

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            company = Company.objects.get(name=SOCIUM.COMPANY_NAME)
        except Company.DoesNotExist:
            raise CommandError(f"Entreprise « {SOCIUM.COMPANY_NAME} » introuvable — lancez d'abord seed_socium.")
        self.company = company
        users = {u.generated_login.upper(): u for u in company.users.all()}
        logins = [SOCIUM.CEO_LOGIN, SOCIUM.DGA_LOGIN, SOCIUM.CTO_LOGIN] + [f"EMP{n}" for n in range(1, SOCIUM.EMPLOYEE_COUNT + 1)]
        missing = [login for login in logins if login not in users]
        self.campaigns = list(EvaluationCampaign.objects.filter(company=company).order_by("start_date"))
        if missing or len(self.campaigns) != len(R.CAMPAIGN_SHIFTS):
            raise CommandError(
                f"Comptes introuvables : {', '.join(missing) or 'aucun'} ; {len(self.campaigns)} campagne(s) pour "
                f"{len(R.CAMPAIGN_SHIFTS)} attendues — lancez d'abord seed_socium."
            )
        self.ceo, self.dga, self.cto = (users[login] for login in logins[:3])
        self.staff = [users[login] for login in logins[3:]]
        self.evaluated = [self.dga, self.cto] + self.staff
        self.everyone = [self.ceo] + self.evaluated
        self.today = date.today()
        # Jour de dépôt des avis datés : dans la fenêtre de la campagne.
        self.deposit = {c.pk: max(min(self.today, c.end_date), c.start_date) for c in self.campaigns}

        self._phones()
        evaluations = self._evaluations()
        self._skill_notes(evaluations)
        self._objectives(evaluations)
        self._self_assessments()
        self._feedback_360()
        self._cohesion()
        self._profiles()
        self.stdout.write(self.style.SUCCESS(
            f"\nTerminé — {company.name} : {len(self.evaluated)} personnes évaluées sur {len(self.campaigns)} campagnes."
        ))

    def _evaluations(self):
        gen = MAIN.Command()
        gen.rng = random.Random("socium-evaluations")
        # (personne, évaluateur) : le CEO évalue ses deux directeurs, le DGA les collaborateurs.
        pairs = [(self.dga, self.ceo), (self.cto, self.ceo)] + [(person, self.dga) for person in self.staff]
        items = {position: gen._matrices(self.company, None, position, skills) for position, skills in HARD_SKILLS.items()}
        for campaign in self.campaigns:
            for person, evaluator in pairs:
                hard_items, soft_items = items[person.position] if person.position in items else items[SOCIUM.EMPLOYEE_POSITION]
                gen._evaluate_person(campaign, person, evaluator, hard_items, soft_items)
        evaluations = list(Evaluation.objects.filter(user__in=self.evaluated).select_related("user", "campaign", "evaluator"))
        self.stdout.write(f"Évaluations ID-3A : {len(evaluations)}")
        return evaluations

    def _objectives(self, evaluations):
        rub = R.Command()
        leaders = {self.dga.pk, self.cto.pk}
        PerformanceObjective.objects.filter(evaluation__in=evaluations).delete()
        lines = []
        for ev in evaluations:
            rng = random.Random(f"socium-obj-{ev.user.generated_login}-{ev.campaign.name}")
            lines += rub._make_lines({"evaluation": ev}, SPEC_CODE, ev.business_objectives_score,
                                     ev.people_objectives_score, ev.user_id in leaders, rng)
            # En-tête de la fiche annuelle : trois dates du cycle et visa.
            camp = ev.campaign
            evaluated = min(self.today, max(camp.start_date + timedelta(days=30), camp.end_date - timedelta(days=12)))
            ev.objectives_set_on = camp.start_date + timedelta(days=14 + rng.randint(0, 10))
            ev.evaluated_on = evaluated
            ev.next_evaluation_on = evaluated + timedelta(days=365 if camp.end_date - camp.start_date > timedelta(days=200) else 182)
            ev.manager_visa = f"{(ev.evaluator or self.ceo).get_full_name()} — visé le {evaluated.strftime('%d/%m/%Y')}"
            ev.save(update_fields=["objectives_set_on", "evaluated_on", "next_evaluation_on", "manager_visa"])
        PerformanceObjective.objects.bulk_create(lines)
        for ev in evaluations:
            recompute_evaluation_scores(ev)  # l'Altitude suit les objectifs saisis
        self.stdout.write(f"Objectifs : {len(lines)} lignes")

    def _feedback_360(self):
        """CEO : lui-même, le DGA et le CTO. DGA : lui-même, le CEO, le CTO,
        trois collaborateurs. CTO : lui-même, le DGA son responsable, le CEO.
        Collaborateur : lui-même, le DGA, trois collègues."""
        Feedback360.objects.filter(subject__in=self.everyone).delete()
        rows = []
        for campaign in self.campaigns[-2:]:
            r = random.Random(f"socium-360-{campaign.name}")
            circles = [
                (self.ceo, [(self.ceo, "SELF"), (self.dga, "REPORT"), (self.cto, "REPORT")]),
                (self.dga, [(self.dga, "SELF"), (self.ceo, "MANAGER"), (self.cto, "PEER")]
                 + [(m, "REPORT") for m in r.sample(self.staff, 3)]),
                (self.cto, [(self.cto, "SELF"), (self.dga, "MANAGER"), (self.ceo, "MANAGER")]),
            ]
            for member in self.staff:
                colleagues = r.sample([o for o in self.staff if o.pk != member.pk], 3)
                circles.append((member, [(member, "SELF"), (self.dga, "MANAGER")] + [(o, "PEER") for o in colleagues]))
            for subject, authors in circles:
                for author, rel in authors:
                    rows.append(Feedback360(
                        company=self.company, campaign=campaign, subject=subject, author=author, kind="FEEDBACK", relation=rel,
                        scores=[max(1, min(5, round(r.gauss(3.8 + (0.2 if rel == "SELF" else 0), 0.7)))) for _ in range(6)],
                        text_a=r.choice(STRENGTHS), text_b=r.choice(IMPROVE)))
                    rows.append(Feedback360(
                        company=self.company, campaign=campaign, subject=subject, author=author, kind="FORWARD", relation=rel,
                        text_a=r.choice(START), text_b=r.choice(STOP), text_c=r.choice(CONTINUE)))
        Feedback360.objects.bulk_create(rows)
        self.stdout.write(f"Avis 360° : {len(rows)}")

    def _cohesion(self):
        """Avis sur l'organisation seulement : sans direction, la portée
        « ma direction » n'existe pas."""
        rub = R.Command()
        CohesionResponse.objects.filter(company=self.company).delete()
        labels = rub._labels(self.company.name)
        count = 0
        for i, camp in enumerate(self.campaigns):
            rng = random.Random(f"socium-org-{camp.name}")
            users = list(self.everyone)
            rng.shuffle(users)
            for respondent in users[: round(len(users) * R.ORG_PARTICIPATION[i])]:
                base = 3.3 + R.CAMPAIGN_SHIFTS[i] + rng.gauss(0, 0.6)
                scores = [{"criterion": label, "score": R._clamp_score(level + rng.gauss(0, 0.5))}
                          for label, level in zip(labels, rub._levels(base))]
                CohesionResponse.objects.create(
                    scope=CohesionResponse.Scope.ORGANISATION, company=self.company, team=None,
                    respondent=respondent, date=self.deposit[camp.pk], scores=scores,
                )
                count += 1
        self.stdout.write(f"Cohésion : {count} avis sur l'organisation")

    def _profiles(self):
        latest = self.campaigns[-1]
        evals = {e.user_id: e for e in Evaluation.objects.filter(campaign=latest, user__in=self.evaluated)}
        spec = R.DEPT[SPEC_CODE]
        for index, user in enumerate(self.everyone):
            r = random.Random(f"socium-profile-{user.generated_login}")
            ev = evals.get(user.pk)
            start_year = user.career_start_date.year if user.career_start_date else 2005
            is_leader = user.role != User.Role.MEMBER

            def pick(pool, k):
                return r.sample(pool, min(k, len(pool)))

            PerformanceProfile.objects.update_or_create(user=user, defaults=dict(
                # Comptes sans prénom : femmes et hommes alternent dans l'ordre des logins.
                gender="Femme" if index % 2 == 1 else "Homme",
                contract_type="CDI" if is_leader or r.random() < 0.9 else "CDD",
                performance_pct=f"{ev.altitude_percentage}" if ev else "",
                performer_category=ev.performance_rating if ev else "",
                qualifications=pick(spec["qual"], 3),
                previous_positions=r.sample(R.PREV_POSITIONS, 2),
                previous_position_dates=[str(start_year + r.randint(1, 5)), str(start_year + r.randint(6, 11))],
                professional_achievements=pick(spec["wins"] if is_leader else R.PROF_ACHIEVEMENTS, 3),
                personal_achievements=pick(R.PERS_ACHIEVEMENTS, 2),
                vision_aspirations=f"Contribuer durablement à la performance de {self.company.name} et transmettre son savoir.",
                personal_projects=r.choice(SBS.PERSONAL_PROJECTS),
                professional_role_models=pick(R.ROLE_MODELS, 2), role_models_in_life=pick(R.LIFE_MODELS, 2),
                dislikes=pick(R.DISLIKES, 2), motivates=pick(SBS.MOTIVATES[:4], 3), personality_traits=pick(R.TRAITS, 3),
                hobbies=pick(R.HOBBIES, 2), bono_hat=r.choice(R.BONO_HATS),
                brings_to_team=pick(R.NOURISHERS, 3), brings_to_manager=pick(["Loyauté", "Fiabilité", "Force de proposition", "Remontée d'information"], 2),
                expects_from_team=pick(["Transparence", "Entraide", "Respect des délais"], 2),
                expects_from_manager=pick(["Feedback régulier", "Autonomie", "Clarté des priorités"], 2),
                dev_priorities=pick(R.DEV_PRIORITIES, 3), dev_professional_perspectives=pick(R.DEV_PERSPECTIVES, 2),
                dev_actions_support=pick(R.DEV_SUPPORT, 2), dev_risks_obstacles=pick(R.DEV_RISKS, 2),
            ))
        self.stdout.write(f"Fiches Performance ID : {len(self.everyone)}")
