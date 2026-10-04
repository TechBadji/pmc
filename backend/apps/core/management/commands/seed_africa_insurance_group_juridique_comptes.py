"""
Complète la Direction Juridique Groupe d'Africa Insurance Group avec des
comptes génériques, pour une démo où chacun saisit en direct :

  - comptes JUR10…JUR30, juristes rattachés à la directrice de la direction,
    au mot de passe 123456 ; le prénom et le nom reprennent le login
    (« JUR11 JUR11 »). Un login déjà présent est laissé tel quel — JUR10
    vient de `seed_africa_insurance_group_juridique`, et c'est
    `rename_juridique_accounts` qui nomme JUR1…JUR10 d'après leur login ;
  - avec `--clear-current-evaluations`, supprime les évaluations ID-3A de la
    direction sur la campagne en cours (la campagne ouverte la plus récente),
    avec leurs notes de compétences, forces & faiblesses et fiches d'objectifs.
    Les autres campagnes, les autres directions, les objectifs d'équipe,
    l'auto-évaluation managériale, le Monkey Management et les avis 360° ne
    sont pas touchés.

La création des comptes est idempotente. La suppression ne l'est pas : elle
efface aussi ce qui aurait été saisi depuis, d'où l'option explicite. Même
périmètre que la remise à zéro du menu Paramètres (`apps/core/data_reset.py`,
rubrique « evaluations », une campagne, une direction).

Ne pas relancer `seed_africa_insurance_group_juridique` ensuite : il recrée
les évaluations de la directrice et de JUR1…JUR10 sur toutes les campagnes.

Usage:
    python manage.py seed_africa_insurance_group_juridique_comptes
    python manage.py seed_africa_insurance_group_juridique_comptes --clear-current-evaluations
    python manage.py seed_africa_insurance_group_juridique_comptes --clear-current-evaluations --dry-run
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core import data_reset
from apps.core.avatar_utils import make_avatar_file
from apps.core.models import Company, Department, User
from apps.evaluations.models import EvaluationCampaign

COMPANY_NAME = "Africa Insurance Group"
DEPT_CODE = "DJG"
PASSWORD = "123456"
POSITION = "Juriste"
FIRST, LAST = 10, 30


class Command(BaseCommand):
    help = "Direction Juridique Groupe d'Africa Insurance Group : comptes génériques JUR10…JUR30, et remise à zéro des évaluations de la campagne en cours."

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear-current-evaluations", action="store_true",
            help="Supprime les évaluations ID-3A de la direction sur la campagne en cours.",
        )
        parser.add_argument("--dry-run", action="store_true", help="Annonce ce qui serait fait, sans rien écrire.")

    @transaction.atomic
    def handle(self, *args, **options):
        dry = options["dry_run"]
        try:
            company = Company.objects.get(name=COMPANY_NAME)
        except Company.DoesNotExist:
            raise CommandError(f"Entreprise « {COMPANY_NAME} » introuvable.")
        dept = Department.objects.filter(company=company, code=DEPT_CODE).select_related("manager").first()
        if dept is None or dept.manager is None:
            raise CommandError("Direction Juridique Groupe ou directrice introuvable — lancez d'abord seed_africa_insurance_group_juridique.")
        if dry:
            self.stdout.write(self.style.WARNING("Essai à blanc : rien n'est écrit."))
        self.stdout.write(f"{dept.name} ({DEPT_CODE}) — encadrant : {dept.manager.get_full_name()} ({dept.manager.generated_login})")

        created = self._accounts(company, dept, dry)
        if created and not dry:
            company.employee_count = company.users.count()
            company.save(update_fields=["employee_count"])
        if options["clear_current_evaluations"]:
            self._clear_current_evaluations(company, dept, dry)

        total = User.objects.filter(company=company, department=dept).count()
        self.stdout.write(self.style.SUCCESS(
            f"Terminé — {created} compte(s) {'à créer' if dry else 'créé(s)'} (JUR{FIRST}…JUR{LAST} / {PASSWORD}), "
            f"{total} compte(s) dans la direction."
        ))

    def _accounts(self, company, dept, dry):
        created = 0
        for n in range(FIRST, LAST + 1):
            login = f"JUR{n}"
            existing = User.objects.filter(generated_login__iexact=login).select_related("company").first()
            if existing is not None and existing.company_id != company.id:
                raise CommandError(f"Le login {login} est déjà pris par un autre tenant.")
            if existing is not None:
                self.stdout.write(f"  = {login} {existing.get_full_name()} — déjà présent, laissé tel quel")
                continue
            created += 1
            self.stdout.write(f"  + {login} {login} {login} — {POSITION}")
            if dry:
                continue
            user = User(
                email=f"{login.lower()}@{company.slug}.pmc.local",
                first_name=login,
                last_name=login,
                role=User.Role.MEMBER,
                position=POSITION,
                company=company,
                department=dept,
                manager=dept.manager,
                generated_login=login,
                must_change_password=False,
            )
            user.set_password(PASSWORD)
            user.avatar.save(f"{login}.png", make_avatar_file(login, str(n)), save=False)
            user.save()
        return created

    def _clear_current_evaluations(self, company, dept, dry):
        campaign = EvaluationCampaign.objects.filter(company=company, is_closed=False).order_by("-start_date").first()
        if campaign is None:
            raise CommandError("Aucune campagne ouverte : pas de campagne en cours à vider.")
        item = data_reset.preview(company, ["evaluations"], [campaign], dept)[0]
        inc = item["includes"]
        self.stdout.write(
            f"Campagne en cours « {campaign.name} » — {dept.name} : {item['count']} évaluation(s) ID-3A "
            f"{'à supprimer' if dry else 'supprimée(s)'} ({inc['skill_scores']} notes de compétences, "
            f"{inc['skill_notes']} lignes forces & faiblesses, {inc['objectives']} lignes d'objectifs)."
        )
        if not dry:
            data_reset.execute(company, ["evaluations"], [campaign], dept)
