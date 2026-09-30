"""
Crée la Direction Juridique Groupe d'Africa Insurance Group et peuple les
évaluations de son équipe, pour la démo :

  - direction « Direction Juridique Groupe » (code DJG), rattachée au PDG comme
    les autres directions fonctionnelles ;
  - sa directrice, Akissi Konan, Ivoirienne (login DIR14, avec photo), et dix
    juristes JUR1…JUR10 (avec photo), tous au mot de passe 123456 ;
  - référentiel de compétences : dix savoir-faire juridiques (hard) et les
    soft skills communs du groupe ;
  - sur les 4 campagnes, tout ce qu'affiche le menu « Évaluations » :
    évaluations ID-3A (les juristes par la directrice, la directrice par le
    PDG), forces & faiblesses, fiches d'objectifs employé et équipe,
    auto-évaluation managériale et sa synthèse, Monkey Management ; avis 360°
    Feedback / Forward sur les deux dernières campagnes ; fiche Performance ID.

Mêmes générateurs que les autres seeds Africa Insurance Group (niveaux hard,
soft et performance tirés indépendamment, objectifs dont la moyenne pondérée
redonne le score stocké). Ne touche à aucune autre direction. Idempotent :
relançable sans doublon. À relancer après `seed_africa_insurance_group_rubriques`,
qui reconstruit les objectifs des seules directions qu'il connaît.

Portraits : Unsplash (licence libre), recadrés en carré — Etty Fidele
(directrice), The Jopwell Collection, Alex Starnes, #WOCinTech Chat, Raymond
Owusu Afriyie, Larry George II, Dorrell Tibbs, Fortune Vieyra, Taylor Grote,
Jassir Jonis.

Usage:
    python manage.py seed_africa_insurance_group_juridique
"""
import random
from datetime import date, timedelta
from pathlib import Path

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.management.commands import seed_africa_insurance_group as MAIN
from apps.core.management.commands import seed_africa_insurance_group_rubriques as R
from apps.core.management.commands import seed_africa_insurance_group_self_assessments as SELF
from apps.core.management.commands.seed_africa_insurance_group_psi_360 import CONTINUE, IMPROVE, START, STOP, STRENGTHS
from apps.core.models import Company, Department, PerformanceProfile, User
from apps.evaluations.models import (
    Evaluation,
    EvaluationCampaign,
    Feedback360,
    ManagerialSelfAssessment,
    ManagerialSynthesis,
    PerformanceObjective,
    SkillNote,
    recompute_evaluation_scores,
)

COMPANY_NAME = "Africa Insurance Group"
PASSWORD = "123456"
PORTRAITS = Path(__file__).resolve().parent.parent / "portraits"

CODE = "DJG"
NAME = "Direction Juridique Groupe"
DIRECTOR = {"login": "DIR14", "first": "Akissi", "last": "Konan", "position": "Directrice Juridique Groupe"}
# login, prénom, nom, genre, poste, portrait (management/portraits/juridique/<id>.jpg)
JURISTS = [
    ("JUR1", "Adjoua", "Tanoh", "F", "Juriste Droit des Assurances", "PK_t0Lrh7MM"),
    ("JUR2", "Moussa", "Coulibaly", "M", "Juriste Contentieux", "Xo-gWpCmgDw"),
    ("JUR3", "Fatou", "Sarr", "F", "Juriste Droit des Sociétés et Gouvernance", "LJL7wx7PM3Y"),
    ("JUR4", "Kodjo", "Agbenyega", "M", "Juriste Conformité Réglementaire (CIMA)", "bdWqmV7UrXI"),
    ("JUR5", "Nadège", "Houngbédji", "F", "Juriste Contrats et Partenariats", "Zpzf7TLj_gA"),
    ("JUR6", "Serge", "Ehui", "M", "Juriste Droit Social", "cokfziNs91A"),
    ("JUR7", "Mariama", "Bah", "F", "Juriste Protection des Données", "VPvYUK2Iibo"),
    ("JUR8", "Hervé", "Mbarga", "M", "Juriste Réassurance et Grands Risques", "aAN9ocBHbyo"),
    ("JUR9", "Awa", "Cissé", "F", "Juriste Lutte Anti-Blanchiment (LAB/FT)", "lFntEHwQvi4"),
    ("JUR10", "Jean-Marc", "Gnahoré", "M", "Juriste Recouvrement et Précontentieux", "UiVe5QvOhao"),
]
LEGAL_SKILLS = [
    "Droit des assurances (Code CIMA)", "Droit des sociétés et gouvernance (OHADA)",
    "Gestion des contentieux et précontentieux", "Rédaction et négociation des contrats",
    "Conformité réglementaire et relations avec le régulateur", "Lutte anti-blanchiment (LAB/FT)",
    "Protection des données personnelles", "Droit social et relations du travail",
    "Veille juridique et réglementaire", "Secrétariat juridique des conseils et assemblées",
]
# Contenu de la direction, au format des autres directions (objectifs business, diplômes…).
R.DEPT[CODE] = dict(
    vision="Sécuriser juridiquement la croissance du groupe et faire du droit un levier de confiance pour les assurés et les partenaires.",
    values=["Rigueur", "Intégrité", "Confidentialité", "Sens du conseil"],
    counter=["Avis rendus hors délai", "Juridisme bloquant", "Rétention d'information"],
    wins=["Refonte des conditions générales des contrats IARD", "Programme de conformité LAB/FT déployé dans les filiales",
          "Taux de contentieux gagnés en hausse", "Registre des traitements de données personnelles", "Gouvernance des conseils d'administration harmonisée"],
    fails=["Retards de validation de certains contrats partenaires", "Veille réglementaire mal diffusée aux métiers",
           "Dépendance à des cabinets d'avocats externes", "Archivage des actes encore papier"],
    biz=[("Contentieux clos favorablement (%)", "Décisions favorables / dossiers clos", 85, 68),
         ("Délai de validation des contrats (score /100)", "Indice de célérité juridique", 90, 70),
         ("Conformité réglementaire CIMA (%)", "Points de contrôle conformes", 100, 86)],
    qual=["Master 2 Droit des affaires — Université Félix Houphouët-Boigny", "DESS Droit des assurances — Université Cheikh Anta Diop",
          "Master Droit OHADA — Université de Lomé", "Certificat d'aptitude à la profession d'avocat (CAPA)",
          "Certification Compliance Officer (LAB/FT)", "Diplôme CIMA — Cycle supérieur"],
)
PREV_POSITIONS = ["Juriste — cabinet d'avocats d'affaires", "Juriste contentieux — banque régionale",
                  "Assistant juridique — compagnie d'assurance", "Conseiller juridique — cabinet de conseil",
                  "Juriste conformité — établissement de microfinance"]


def _phone(rng):
    return f"+228 90 {rng.randint(10, 99)} {rng.randint(10, 99)} {rng.randint(10, 99)}"


class Command(BaseCommand):
    help = "Direction Juridique Groupe d'Africa Insurance Group : directrice DIR14, juristes JUR1…JUR10 et leurs évaluations."

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            company = Company.objects.get(name=COMPANY_NAME)
        except Company.DoesNotExist:
            raise CommandError(f"Entreprise « {COMPANY_NAME} » introuvable.")
        pdg = User.objects.filter(company=company, generated_login="CODIR").first()
        campaigns = list(EvaluationCampaign.objects.filter(company=company).order_by("start_date"))
        if pdg is None or not campaigns:
            raise CommandError("PDG ou campagnes introuvables — lancez d'abord seed_africa_insurance_group.")
        for login in [DIRECTOR["login"]] + [j[0] for j in JURISTS]:
            other = User.objects.filter(generated_login__iexact=login).exclude(company=company).first()
            if other is not None:
                raise CommandError(f"Le login {login} est déjà pris par un autre tenant.")

        self.company, self.pdg, self.campaigns = company, pdg, campaigns
        dept = self._department()
        director = self._director(dept)
        jurists = [self._jurist(dept, director, spec) for spec in JURISTS]
        company.employee_count = company.users.count()
        company.save(update_fields=["employee_count"])

        evaluations = self._evaluations(dept, director, jurists)
        self._skill_notes(evaluations)
        self._objectives(dept, director, jurists, evaluations)
        self._self_assessments([director] + jurists)
        self._feedback_360(director, jurists)
        self._profiles(dept, director, jurists)
        self.stdout.write(self.style.SUCCESS(
            f"Terminé — {NAME} : {director.get_full_name()} ({DIRECTOR['login']}) et {len(jurists)} juristes, "
            f"{len(evaluations)} évaluations sur {len(campaigns)} campagnes."
        ))

    # -- comptes ---------------------------------------------------------
    def _department(self):
        dept, created = Department.objects.get_or_create(company=self.company, code=CODE, defaults={"name": NAME})
        if dept.name != NAME:
            dept.name = NAME
            dept.save(update_fields=["name"])
        self.stdout.write(f"{'+' if created else '='} {NAME} ({CODE})")
        return dept

    def _account(self, login, first, last, role, position, dept, manager, birth, hire, career, role_start, photo):
        user = User.objects.filter(company=self.company, generated_login=login).first()
        created = user is None
        if created:
            user = User(generated_login=login, email=f"{login.lower()}@{self.company.slug}.pmc.local", company=self.company)
            user.set_password(PASSWORD)
        user.first_name, user.last_name, user.role, user.position = first, last, role, position
        user.department, user.manager, user.must_change_password = dept, manager, False
        user.birth_date = user.birth_date or birth
        user.hire_date, user.career_start_date, user.role_start_date = hire, career, role_start
        user.phone = user.phone or _phone(random.Random(f"phone-{login}"))
        user.save()
        if created or "_portrait" not in (user.avatar.name or ""):
            user.avatar.save(f"{login}_portrait.jpg", ContentFile(photo.read_bytes()), save=True)
        self.stdout.write(f"  {'+' if created else '='} {login} {user.get_full_name()} — {position}")
        return user

    def _director(self, dept):
        rng = random.Random("djg-director")
        d = DIRECTOR
        director = self._account(
            d["login"], d["first"], d["last"], User.Role.MANAGER, d["position"], dept, self.pdg,
            MAIN.random_birth_date(rng, 45, 50), date(2017, 3, 1), date(2003, 1, 1), date(2021, 1, 1),
            PORTRAITS / "leaders" / f"{d['login']}.jpg",
        )
        if dept.manager_id != director.id:
            dept.manager = director
            dept.save(update_fields=["manager"])
        return director

    def _jurist(self, dept, director, spec):
        login, first, last, _gender, position, photo = spec
        rng = random.Random(f"djg-{login}")
        career = date(2006 + rng.randint(0, 12), 1, 1)
        hire = date(max(career.year + 1, 2014) + rng.randint(0, 8), rng.randint(1, 12), 1)
        return self._account(
            login, first, last, User.Role.MEMBER, position, dept, director,
            MAIN.random_birth_date(rng, 30, 48), hire, career, hire + timedelta(days=rng.randint(0, 700)),
            PORTRAITS / "juridique" / f"{photo}.jpg",
        )

    # -- évaluations -----------------------------------------------------
    def _evaluations(self, dept, director, jurists):
        hard_items, soft_items = MAIN.Command()._matrices(self.company, dept, DIRECTOR["position"], LEGAL_SKILLS)
        gen = MAIN.Command()
        gen.rng = random.Random("djg-evaluations")
        for campaign in self.campaigns:
            gen._evaluate_person(campaign, director, self.pdg, hard_items, soft_items)
            for jurist in jurists:
                gen._evaluate_person(campaign, jurist, director, hard_items, soft_items)
        evaluations = list(Evaluation.objects.filter(user__in=[director] + jurists).select_related("user", "campaign", "evaluator"))
        self.stdout.write(f"Évaluations ID-3A : {len(evaluations)}")
        return evaluations

    def _skill_notes(self, evaluations):
        notes = []
        for ev in evaluations:
            groups = {"HARD": [], "SOFT": []}
            for s in ev.skill_scores.select_related("skill_item__matrix"):
                if s.score is not None:
                    groups[s.skill_item.matrix.type].append((s.score, s.skill_item.name))
            for kind in ("HARD", "SOFT"):
                ordered = sorted(groups[kind], key=lambda t: (-t[0], t[1]))
                for cat, lst in ((f"{kind}_STRENGTH", ordered[:5]), (f"{kind}_WEAKNESS", list(reversed(ordered[-5:])))):
                    for order, (score, name) in enumerate(lst, start=1):
                        notes.append(SkillNote(evaluation=ev, category=cat, order=order, text=name[:255], score=score))
        SkillNote.objects.filter(evaluation__in=evaluations).delete()
        SkillNote.objects.bulk_create(notes)
        self.stdout.write(f"Forces & faiblesses : {len(notes)} lignes")

    def _objectives(self, dept, director, jurists, evaluations):
        rub = R.Command()
        today = date.today()
        PerformanceObjective.objects.filter(evaluation__in=evaluations).delete()
        PerformanceObjective.objects.filter(team=dept).delete()
        lines = []
        for ev in evaluations:
            rng = random.Random(f"obj-{ev.pk}")
            lines += rub._make_lines({"evaluation": ev}, CODE, ev.business_objectives_score, ev.people_objectives_score,
                                     ev.user_id == director.id, rng)
            camp = ev.campaign
            evaluated = min(today, max(camp.start_date + timedelta(days=30), camp.end_date - timedelta(days=12)))
            ev.objectives_set_on = camp.start_date + timedelta(days=14 + rng.randint(0, 10))
            ev.evaluated_on = evaluated
            ev.next_evaluation_on = evaluated + timedelta(days=365 if camp.end_date - camp.start_date > timedelta(days=200) else 182)
            ev.manager_visa = f"{(ev.evaluator or self.pdg).get_full_name()} — visé le {evaluated.strftime('%d/%m/%Y')}"
            ev.save(update_fields=["objectives_set_on", "evaluated_on", "next_evaluation_on", "manager_visa"])
        PerformanceObjective.objects.bulk_create(lines)
        for ev in evaluations:
            recompute_evaluation_scores(ev)  # l'Altitude suit les objectifs saisis
        team_lines = []
        for campaign in self.campaigns:
            group = list(Evaluation.objects.filter(user__in=jurists, campaign=campaign))
            business = sum(float(e.business_objectives_score) for e in group) / len(group)
            people = sum(float(e.people_objectives_score) for e in group) / len(group)
            rng = random.Random(f"tobj-{CODE}-{campaign.pk}")
            team_lines += rub._make_lines({"team": dept, "campaign_id": campaign.pk}, CODE, round(business, 1), round(people, 1), True, rng)
        PerformanceObjective.objects.bulk_create(team_lines)
        self.stdout.write(f"Objectifs : {len(lines)} lignes employés, {len(team_lines)} lignes équipe")

    def _self_assessments(self, people):
        maker = SELF.Command()
        for user in people:
            maker.rng = random.Random(f"djg-self-{user.generated_login}")
            for campaign in self.campaigns:
                for category in SELF.CATEGORIES:
                    maker._managerial(user, campaign, category)
                maker._monkey(user, campaign)
                rows = list(ManagerialSelfAssessment.objects.filter(user=user, campaign=campaign))
                ordered = sorted(rows, key=lambda r: (-(r.ic_score or 0), r.category))
                ManagerialSynthesis.objects.update_or_create(
                    user=user, campaign=campaign,
                    defaults={
                        "key_skills": [R.STRONG[r.category] for r in ordered[:3]],
                        "improvement_areas": [R.WEAK[r.category] for r in reversed(ordered[-3:])],
                    },
                )
        self.stdout.write(f"Auto-évaluation managériale, synthèse et Monkey Management : {len(people)} personnes")

    def _feedback_360(self, director, jurists):
        """Directrice : elle-même, le PDG, trois directeurs pairs, trois juristes.
        Chaque juriste : lui-même, la directrice, trois collègues."""
        company = self.company
        peers_dir = list(User.objects.filter(company=company, role=User.Role.MANAGER).exclude(pk=director.pk).order_by("generated_login"))
        Feedback360.objects.filter(subject__in=[director] + jurists).delete()
        rows = []
        for campaign in self.campaigns[-2:]:
            circles = []
            r = random.Random(f"djg-360-{campaign.pk}")
            circles.append((director, [(director, "SELF"), (self.pdg, "MANAGER")]
                            + [(p, "PEER") for p in r.sample(peers_dir, min(3, len(peers_dir)))]
                            + [(j, "REPORT") for j in r.sample(jurists, 3)]))
            for j in jurists:
                colleagues = r.sample([o for o in jurists if o.pk != j.pk], 3)
                circles.append((j, [(j, "SELF"), (director, "MANAGER")] + [(o, "PEER") for o in colleagues]))
            for subject, authors in circles:
                for author, rel in authors:
                    rows.append(Feedback360(
                        company=company, campaign=campaign, subject=subject, author=author, kind="FEEDBACK", relation=rel,
                        scores=[max(1, min(5, round(r.gauss(3.8 + (0.2 if rel == "SELF" else 0), 0.7)))) for _ in range(6)],
                        text_a=r.choice(STRENGTHS), text_b=r.choice(IMPROVE)))
                    rows.append(Feedback360(
                        company=company, campaign=campaign, subject=subject, author=author, kind="FORWARD", relation=rel,
                        text_a=r.choice(START), text_b=r.choice(STOP), text_c=r.choice(CONTINUE)))
        Feedback360.objects.bulk_create(rows)
        self.stdout.write(f"Avis 360° : {len(rows)}")

    def _profiles(self, dept, director, jurists):
        latest = self.campaigns[-1]
        evals = {e.user_id: e for e in Evaluation.objects.filter(campaign=latest, user__in=[director] + jurists)}
        female = {spec[0] for spec in JURISTS if spec[3] == "F"} | {DIRECTOR["login"]}
        spec = R.DEPT[CODE]
        for user in [director] + jurists:
            r = random.Random(f"profile-{user.generated_login}")
            ev = evals.get(user.pk)
            start_year = user.career_start_date.year if user.career_start_date else 2005

            def pick(pool, k):
                return r.sample(pool, min(k, len(pool)))

            PerformanceProfile.objects.update_or_create(user=user, defaults=dict(
                gender="Femme" if user.generated_login in female else "Homme",
                contract_type="CDI" if user.pk == director.pk or r.random() < 0.9 else "CDD",
                performance_pct=f"{ev.altitude_percentage}" if ev else "",
                performer_category=ev.performance_rating if ev else "",
                qualifications=pick(spec["qual"], 3), previous_positions=r.sample(PREV_POSITIONS, 2),
                previous_position_dates=[str(start_year + r.randint(1, 5)), str(start_year + r.randint(6, 11))],
                professional_achievements=pick(spec["wins"], 3), personal_achievements=pick(R.PERS_ACHIEVEMENTS, 2),
                vision_aspirations=f"Contribuer à la sécurité juridique du groupe au sein de la {dept.name} et transmettre son savoir.",
                personal_projects=r.choice(["Préparer le CAPA et s'inscrire au barreau", "Publier un article de doctrine sur le droit CIMA",
                                            "Financer les études des enfants", "Enseigner le droit des assurances en vacation"]),
                professional_role_models=pick(R.ROLE_MODELS, 2), role_models_in_life=pick(R.LIFE_MODELS, 2),
                dislikes=pick(R.DISLIKES, 2), motivates=pick(R.MOTIVATES, 3), personality_traits=pick(R.TRAITS, 3),
                hobbies=pick(R.HOBBIES, 2), bono_hat=r.choice(R.BONO_HATS),
                brings_to_team=pick(R.NOURISHERS, 3), brings_to_manager=pick(["Loyauté", "Fiabilité", "Force de proposition", "Remontée d'information"], 2),
                expects_from_team=pick(["Transparence", "Entraide", "Respect des délais"], 2),
                expects_from_manager=pick(["Feedback régulier", "Autonomie", "Clarté des priorités"], 2),
                dev_priorities=pick(R.DEV_PRIORITIES, 3), dev_professional_perspectives=pick(R.DEV_PERSPECTIVES, 2),
                dev_actions_support=pick(R.DEV_SUPPORT, 2), dev_risks_obstacles=pick(R.DEV_RISKS, 2),
            ))
        self.stdout.write(f"Fiches Performance ID : {len(jurists) + 1}")
