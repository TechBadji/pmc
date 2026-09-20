"""
Complète SUNU Group (Africa Insurance Group) dans toutes les rubriques, pour
ses 60 collaborateurs et son directeur Daniel Junior Nkola. S'appuie sur
`seed_africa_insurance_group_sunu_evaluations` (évaluations, objectifs,
auto-évaluations) et `seed_africa_insurance_group_psi_360` (PSI, 360°), et
ajoute ce qui manquait :

- dates d'embauche / d'ancienneté / de naissance (la fiche affiche l'âge, les
  années dans le poste et dans l'entreprise) ;
- Daniel Nkola : évaluations par le PDG sur les 4 campagnes, forces et
  faiblesses, objectifs, auto-évaluation managériale, Monkey Management,
  synthèse, 360° (PDG, pairs, lui-même) ;
- fiche Performance ID (« Performance 360° ») des 61 personnes ;
- synthèses managériales, relations d'équipe, plans d'action de développement.

Ne touche à aucune autre direction. Idempotent : relançable sans doublon.

Usage:
    python manage.py seed_africa_insurance_group_sunu_full
"""
import random
from datetime import date, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.actionplans.models import ActionPlan
from apps.core.management.commands import seed_africa_insurance_group as base_seed
from apps.core.management.commands import seed_africa_insurance_group_rubriques as R
from apps.core.management.commands.seed_africa_insurance_group_portraits import FIRST_F
from apps.core.management.commands.seed_africa_insurance_group_psi_360 import IMPROVE, START, STOP, CONTINUE, STRENGTHS
from apps.core.management.commands.seed_africa_insurance_group_self_assessments import CATEGORIES, Command as SelfAssessments
from apps.core.models import Company, Department, PerformanceProfile, User
from apps.evaluations.models import (
    Evaluation,
    EvaluationCampaign,
    Feedback360,
    PerformanceObjective,
    SkillNote,
    recompute_evaluation_scores,
)
from apps.skills.models import SkillItem, SkillMatrix
from apps.teams.models import TeamRelationship

COMPANY_NAME = "Africa Insurance Group"
DIRECTOR_POSITION = "Directeur SUNU Group"
DIRECTOR_HARD = [
    "Pilotage commercial du réseau", "Gestion budgétaire et rentabilité", "Stratégie de distribution", "Conformité CIMA et réglementation",
    "Pilotage de la performance des équipes", "Relation avec les partenaires et apporteurs", "Analyse du portefeuille et des sinistres",
    "Gestion des sinistres majeurs", "Innovation produit", "Transformation digitale de la souscription",
]


class Command(BaseCommand):
    help = "Complète toutes les rubriques de SUNU Group (60 collaborateurs + Daniel Nkola)."

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            company = Company.objects.get(name=COMPANY_NAME)
        except Company.DoesNotExist:
            raise CommandError(f"Entreprise « {COMPANY_NAME} » introuvable.")
        sunu = Department.objects.filter(company=company, code="SUNU").first()
        daniel = User.objects.filter(company=company, generated_login="DIR10").first()
        ceo = User.objects.filter(company=company, role=User.Role.COMPANY_ADMIN).first()
        campaigns = list(EvaluationCampaign.objects.filter(company=company).order_by("start_date"))
        staff = list(User.objects.filter(company=company, department=sunu, role=User.Role.MEMBER).order_by("id")) if sunu else []
        if not (sunu and daniel and ceo and campaigns) or len(staff) != 60:
            raise CommandError("Lancez d'abord les seeds SUNU, portraits et sunu_evaluations.")
        if not Evaluation.objects.filter(user__in=staff).exists():
            raise CommandError("Lancez d'abord seed_africa_insurance_group_sunu_evaluations.")
        everyone = staff + [daniel]
        rng = random.Random(9090)

        # 1. Dates de carrière : âge, ancienneté dans le poste et dans l'entreprise.
        for u in staff:
            if u.birth_date is None:
                u.birth_date = base_seed.random_birth_date(rng, 30, 52)
            u.career_start_date = u.career_start_date or date(2003 + rng.randint(0, 12), 1, 1)
            u.hire_date = u.hire_date or date(2016 + rng.randint(0, 8), rng.randint(1, 12), 1)
            u.role_start_date = u.role_start_date or (u.hire_date + timedelta(days=rng.randint(0, 700)))
            u.save(update_fields=["birth_date", "career_start_date", "hire_date", "role_start_date"])
        if daniel.birth_date is None:
            daniel.birth_date = base_seed.random_birth_date(rng, 44, 54)
        daniel.career_start_date = daniel.career_start_date or date(1999, 1, 1)
        daniel.hire_date = daniel.hire_date or date(2018, 1, 1)
        daniel.role_start_date = daniel.role_start_date or date(2021, 1, 1)
        daniel.save(update_fields=["birth_date", "career_start_date", "hire_date", "role_start_date"])

        # 2. Daniel Nkola : référentiel, évaluations par le PDG, forces/faiblesses, objectifs.
        hard_matrix, _ = SkillMatrix.objects.get_or_create(company=company, name=DIRECTOR_POSITION, type=SkillMatrix.SkillType.HARD, defaults={"department": sunu})
        if not hard_matrix.items.exists():
            SkillItem.objects.bulk_create([SkillItem(matrix=hard_matrix, name=n, order=i) for i, n in enumerate(DIRECTOR_HARD)])
        soft_matrix, _ = SkillMatrix.objects.get_or_create(company=company, name=DIRECTOR_POSITION, type=SkillMatrix.SkillType.SOFT, defaults={"department": sunu})
        if not soft_matrix.items.exists():
            SkillItem.objects.bulk_create([SkillItem(matrix=soft_matrix, name=n, order=i) for i, n in enumerate(base_seed.SOFT_SKILLS)])
        gen = base_seed.Command()
        gen.rng = random.Random(1111)
        for campaign in campaigns:
            gen._evaluate_person(campaign, daniel, ceo, list(hard_matrix.items.all()), list(soft_matrix.items.all()))
        d_evals = list(Evaluation.objects.filter(user=daniel).select_related("campaign"))
        notes = []
        for ev in d_evals:
            groups = {"HARD": [], "SOFT": []}
            for s in ev.skill_scores.select_related("skill_item__matrix"):
                if s.score is not None:
                    groups[s.skill_item.matrix.type].append((s.score, s.skill_item.name))
            for kind in ("HARD", "SOFT"):
                ordered = sorted(groups[kind], key=lambda t: (-t[0], t[1]))
                for cat, lst in ((f"{kind}_STRENGTH", ordered[:5]), (f"{kind}_WEAKNESS", list(reversed(ordered[-5:])))):
                    for order, (score, name) in enumerate(lst, start=1):
                        notes.append(SkillNote(evaluation=ev, category=cat, order=order, text=name[:255], score=score))
        SkillNote.objects.filter(evaluation__in=d_evals).delete()
        SkillNote.objects.bulk_create(notes)
        rub = R.Command()
        rub.company, rub.campaigns, rub.ceo, rub.today = company, campaigns, ceo, date.today()
        rub.depts, rub.stdout = {"SUNU": sunu}, self.stdout
        PerformanceObjective.objects.filter(evaluation__in=d_evals).delete()
        lines = []
        for ev in d_evals:
            r = random.Random(f"obj-{ev.pk}")
            lines += rub._make_lines({"evaluation": ev}, "SUNU", ev.business_objectives_score, ev.people_objectives_score, True, r)
            camp = ev.campaign
            evaluated = min(rub.today, max(camp.start_date + timedelta(days=30), camp.end_date - timedelta(days=12)))
            ev.objectives_set_on = camp.start_date + timedelta(days=14 + r.randint(0, 10))
            ev.evaluated_on = evaluated
            ev.next_evaluation_on = evaluated + timedelta(days=365 if camp.end_date - camp.start_date > timedelta(days=200) else 182)
            ev.manager_visa = f"{ceo.get_full_name()} — visé le {evaluated.strftime('%d/%m/%Y')}"
            ev.save(update_fields=["objectives_set_on", "evaluated_on", "next_evaluation_on", "manager_visa"])
        PerformanceObjective.objects.bulk_create(lines)
        for ev in d_evals:
            recompute_evaluation_scores(ev)

        # 3. Auto-évaluation managériale et Monkey Management de Daniel.
        sa = SelfAssessments()
        sa.rng = random.Random(2222)
        for campaign in campaigns:
            for category in CATEGORIES:
                sa._managerial(daniel, campaign, category)
            sa._monkey(daniel, campaign)

        # 4. Avis 360° sur Daniel : PDG (manager), quatre autres directeurs (pairs), lui-même.
        Feedback360.objects.filter(subject=daniel).delete()
        peers = list(User.objects.filter(company=company, role=User.Role.MANAGER).exclude(pk=daniel.pk)[:4])
        rows = []
        for campaign in campaigns[-2:]:
            for author, rel in [(daniel, "SELF"), (ceo, "MANAGER")] + [(p, "PEER") for p in peers]:
                rows.append(Feedback360(company=company, campaign=campaign, subject=daniel, author=author, kind="FEEDBACK", relation=rel,
                                        scores=[max(1, min(5, round(rng.gauss(3.9, 0.7)))) for _ in range(6)],
                                        text_a=rng.choice(STRENGTHS), text_b=rng.choice(IMPROVE)))
                rows.append(Feedback360(company=company, campaign=campaign, subject=daniel, author=author, kind="FORWARD", relation=rel,
                                        text_a=rng.choice(START), text_b=rng.choice(STOP), text_c=rng.choice(CONTINUE)))
        Feedback360.objects.bulk_create(rows)

        # 5. Fiche Performance ID (« Performance 360° ») des 61 personnes.
        latest = campaigns[-1]
        evals = {e.user_id: e for e in Evaluation.objects.filter(campaign=latest, user__in=everyone)}
        pool_q = R.DEPT["SUNU"]["qual"]
        female = set(FIRST_F) | R.FEMALE_NAMES
        for user in everyone:
            r = random.Random(f"profile-{user.pk}")
            ev = evals.get(user.pk)
            start_year = user.career_start_date.year if user.career_start_date else 2005

            def pick(pool, k):
                return r.sample(pool, min(k, len(pool)))

            PerformanceProfile.objects.update_or_create(user=user, defaults=dict(
                gender="Femme" if user.first_name in female else "Homme",
                contract_type="CDI" if r.random() < 0.9 else "CDD",
                performance_pct=f"{ev.altitude_percentage}" if ev else "",
                performer_category=ev.performance_rating if ev else "",
                qualifications=pick(pool_q, 3), previous_positions=r.sample(R.PREV_POSITIONS, 2),
                previous_position_dates=[str(start_year + r.randint(1, 6)), str(start_year + r.randint(7, 12))],
                professional_achievements=pick(R.PROF_ACHIEVEMENTS, 3), personal_achievements=pick(R.PERS_ACHIEVEMENTS, 2),
                vision_aspirations="Contribuer durablement à la croissance de SUNU Group et transmettre son savoir.",
                personal_projects="Financer les études des enfants et développer une activité associative locale.",
                professional_role_models=pick(R.ROLE_MODELS, 2), role_models_in_life=pick(R.LIFE_MODELS, 2),
                dislikes=pick(R.DISLIKES, 2), motivates=pick(R.MOTIVATES, 3), personality_traits=pick(R.TRAITS, 3),
                hobbies=pick(R.HOBBIES, 2), bono_hat=r.choice(R.BONO_HATS),
                brings_to_team=pick(R.NOURISHERS, 3), brings_to_manager=pick(["Loyauté", "Fiabilité", "Force de proposition", "Remontée d'information"], 2),
                expects_from_team=pick(["Transparence", "Entraide", "Respect des délais"], 2),
                expects_from_manager=pick(["Feedback régulier", "Autonomie", "Clarté des priorités"], 2),
                dev_priorities=pick(R.DEV_PRIORITIES, 3), dev_professional_perspectives=pick(R.DEV_PERSPECTIVES, 2),
                dev_actions_support=pick(R.DEV_SUPPORT, 2), dev_risks_obstacles=pick(R.DEV_RISKS, 2),
            ))

        # 6. Synthèses managériales (idempotent, déduites des auto-évaluations).
        rub.syntheses()

        # 7. Relations d'équipe : chacun désigne 3 collègues excellents, 2 difficiles, 1 toxique, 3 corrects.
        TeamRelationship.objects.filter(team=sunu).delete()
        rel_rows, seen = [], set()
        for u in staff:
            r = random.Random(f"rel-{u.pk}")
            others = [o for o in staff if o.pk != u.pk]
            r.shuffle(others)
            for quality, n in (("EXCELLENT", 3), ("CORRECT", 3), ("DIFFICULT", 2), ("TOXIC", 1)):
                for o in others[:n]:
                    if (u.pk, o.pk) not in seen:
                        seen.add((u.pk, o.pk))
                        rel_rows.append(TeamRelationship(team=sunu, from_user=u, to_user=o, quality=quality))
                others = others[n:]
        TeamRelationship.objects.bulk_create(rel_rows)

        # 8. Plans de développement : Daniel (posé par le PDG), ses deux collaborateurs les plus faibles (posés par Daniel), grille d'équipe.
        ActionPlan.objects.filter(team=sunu, target_user__isnull=False).delete()
        ActionPlan.objects.filter(team=sunu, target_user__isnull=True, category__in=["HARD_SKILLS", "SOFT_SKILLS"], manager=daniel).delete()
        weak = {}
        for note in SkillNote.objects.filter(evaluation__campaign=latest, evaluation__user__in=everyone, category__in=["HARD_WEAKNESS", "SOFT_WEAKNESS"]).select_related("evaluation"):
            kind = "HARD" if note.category == "HARD_WEAKNESS" else "SOFT"
            weak.setdefault(note.evaluation.user_id, {}).setdefault(kind, []).append((note.order, note.text, note.score))
        for w in weak.values():
            for kind in w:
                w[kind] = [(t, s) for _, t, s in sorted(w[kind])]
        start = date(2026, 10, 1)
        plans = rub._dev_rows(ceo, sunu, daniel, weak.get(daniel.pk, {}), 2, 3, start, ceo.get_full_name())
        lowest = sorted(staff, key=lambda m: float(evals[m.pk].altitude_percentage))[:2]
        for m in lowest:
            plans += rub._dev_rows(daniel, sunu, m, weak.get(m.pk, {}), 1, 2, start, daniel.get_full_name())
        from decimal import Decimal
        team_weak = {"HARD": [(b, Decimal("3.0")) for b in R.BUSINESS_WEAKNESSES[:3]], "SOFT": [(p, Decimal("3.0")) for p in R.PEOPLE_WEAKNESSES[:3]]}
        plans += rub._dev_rows(daniel, sunu, None, team_weak, 1, 3, start, daniel.get_full_name())
        ActionPlan.objects.bulk_create(plans)

        self.stdout.write(self.style.SUCCESS(
            f"Terminé — SUNU Group : {len(everyone)} personnes, fiches Performance ID, évaluations de Daniel, "
            f"{len(rel_rows)} relations, {len(plans)} lignes de plans de développement."
        ))
