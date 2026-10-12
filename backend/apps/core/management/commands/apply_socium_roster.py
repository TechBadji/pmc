"""
Aligne SOCIUM sur la liste réelle de ses managers, lue dans un fichier JSON
qui n'est PAS versionné : il porte les noms de personnes réelles et n'a rien à
faire dans le dépôt. C'est une liste d'objets, dans l'ordre des comptes, avec
les clés sex (H ou F), last_name, first_name et position (les autres clés
sont ignorées).

  - EMP1…EMPn prennent le nom, le prénom, la fonction et le genre des
    personnes du fichier, dans l'ordre de ses lignes. Identifiant,
    mot de passe et données déjà rattachées au compte sont conservés ;
  - EMP1 (le CEO) devient l'administrateur de l'entreprise ; les autres
    sont des managers qui ont le CEO pour responsable, toujours sans direction.
    Leurs évaluations existantes ont désormais le CEO pour évaluateur ;
  - chacun reçoit un vrai portrait, pris selon son genre dans
    `management/portraits/` (les visages ne sont pas ceux des personnes) ;
  - tous les autres comptes de l'entreprise (CEOSOC, DGASOC, CTOSOC et les
    EMP au-delà de la liste) sont SUPPRIMÉS avec tout ce qui leur appartient : évaluations,
    objectifs, auto-évaluations, avis 360° donnés et reçus, avis de cohésion,
    réponses PSI, fiches. Les référentiels de compétences des postes DGA et
    CTO, devenus sans objet, le sont aussi.

Les seeds de la première version de la démo (`seed_socium`,
`seed_socium_rubriques`, `seed_socium_psi`, `seed_socium_feedforward`)
décrivent l'ancienne structure : ne plus les relancer après cette commande,
ils recréeraient les comptes supprimés.

Relançable : une seconde exécution ne trouve plus rien à supprimer et ne
réécrit ni un portrait déjà posé ni un nom ressaisi à l'identique.

Usage:
    python manage.py apply_socium_roster /chemin/liste.json --dry-run
    python manage.py apply_socium_roster /chemin/liste.json
"""
import json
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models.deletion import Collector

from apps.core.management.commands import seed_sunu_bank_senegal_portraits as PORTRAITS
from apps.core.models import Company, PerformanceProfile, User
from apps.evaluations.models import Evaluation, Feedback360
from apps.skills.models import SkillMatrix

COMPANY_NAME = "SOCIUM"
ADMIN_LOGIN = "EMP1"
# Champs attendus pour chaque personne du fichier. L'équipe et le pays ne sont
# pas stockés (aucune direction n'est créée).
FIELDS = ("sex", "last_name", "first_name", "position")
OBSOLETE_MATRICES = ["Directeur Général Adjoint", "Directeur Technique (CTO)"]
# Les textes de démo conservés citaient le DGA, dont le compte disparaît.
REWORDINGS = [("le DGA et le CTO", "mes collègues"), ("le DGA", "la direction"), ("du DGA", "de la direction")]


class Command(BaseCommand):
    help = "SOCIUM : les premiers comptes EMP deviennent les managers réels du fichier, les autres comptes sont supprimés."

    def add_arguments(self, parser):
        parser.add_argument("roster", help="Fichier JSON de la liste des managers (non versionné).")
        parser.add_argument("--dry-run", action="store_true", help="Annonce ce qui serait fait, sans rien écrire.")

    def handle(self, *args, **options):
        try:
            with transaction.atomic():
                self._apply(self._roster(options["roster"]), options["dry_run"])
                if options["dry_run"]:
                    raise _Rollback
        except _Rollback:
            self.stdout.write(self.style.WARNING("Essai à blanc : rien n'a été écrit."))

    def _roster(self, path):
        try:
            with open(path, encoding="utf-8") as handle:
                rows = json.load(handle)
        except (OSError, ValueError) as error:
            raise CommandError(f"Liste illisible ({path}) : {error}")
        if not isinstance(rows, list) or not rows:
            raise CommandError("La liste doit contenir au moins une personne.")
        for rank, row in enumerate(rows, start=1):
            if not isinstance(row, dict) or any(not str(row.get(field, "")).strip() for field in FIELDS) or row["sex"] not in ("H", "F"):
                raise CommandError(f"Ligne {rank} : {', '.join(FIELDS)} sont attendus, avec sex = H ou F.")
        return rows

    def _apply(self, roster, dry):
        company = Company.objects.filter(name=COMPANY_NAME).first()
        if company is None:
            raise CommandError(f"Entreprise « {COMPANY_NAME} » introuvable.")
        logins = [f"EMP{n}" for n in range(1, len(roster) + 1)]
        users = {u.generated_login.upper(): u for u in company.users.filter(generated_login__in=logins)}
        missing = [login for login in logins if login not in users]
        if missing:
            raise CommandError(f"Comptes introuvables : {', '.join(missing)}.")
        # Contrôle avant d'écrire : un portrait absent laisserait des comptes sans photo.
        pools = {"F": list(PORTRAITS.FEMALE_POOL), "H": list(PORTRAITS.MALE_POOL)}
        absent = [p for pool in pools.values() for p in pool[: len(roster)] if not (PORTRAITS.PORTRAITS / f"{p}.jpg").exists()]
        if absent:
            raise CommandError(f"Portraits introuvables : {', '.join(absent)}.")

        admin = users[ADMIN_LOGIN]
        for login, person in zip(logins, roster):
            sex, last, first, position = (str(person[field]).strip() for field in FIELDS)
            user = users[login]
            user.first_name, user.last_name, user.position = first, last, position
            user.role = User.Role.COMPANY_ADMIN if login == ADMIN_LOGIN else User.Role.MANAGER
            user.manager = None if login == ADMIN_LOGIN else admin
            user.department = None
            user.save(update_fields=["first_name", "last_name", "position", "role", "manager", "department"])
            photo = pools[sex].pop(0)
            # Un portrait déjà posé est laissé tel quel.
            if not dry and "_portrait" not in (user.avatar.name or ""):
                if user.avatar:
                    user.avatar.delete(save=False)
                user.avatar.save(f"socium_{login}_portrait.jpg", ContentFile((PORTRAITS.PORTRAITS / f"{photo}.jpg").read_bytes()), save=True)
            PerformanceProfile.objects.filter(user=user).update(gender="Femme" if sex == "F" else "Homme")
            self.stdout.write(f"  {login} : {position} ({sex}, {photo})")

        company.admin_user = admin
        company.admin_first_name, company.admin_last_name = admin.first_name, admin.last_name
        company.save(update_fields=["admin_user", "admin_first_name", "admin_last_name"])

        others = company.users.exclude(generated_login__in=logins)
        collector = Collector(using="default")
        collector.collect(others)
        counts = {model._meta.verbose_name_plural: len(objs) for model, objs in collector.data.items()}
        for qs in collector.fast_deletes:
            if qs.count():
                counts[qs.model._meta.verbose_name_plural] = counts.get(qs.model._meta.verbose_name_plural, 0) + qs.count()
        self.stdout.write(f"Comptes supprimés : {', '.join(sorted(u.generated_login for u in others)) or 'aucun'}")
        for label, count in sorted(counts.items()):
            self.stdout.write(f"  {label} : {count}")
        others.delete()

        # Le CEO évalue désormais les treize managers ; lui-même n'a pas d'évaluateur.
        kept = Evaluation.objects.filter(user__company=company)
        kept.exclude(user=admin).update(evaluator=admin)
        kept.filter(user=admin).update(evaluator=None)
        SkillMatrix.objects.filter(company=company, name__in=OBSOLETE_MATRICES).delete()
        reworded = 0
        for row in Feedback360.objects.filter(company=company).exclude(answers={}):
            answers = dict(row.answers)
            for key, text in answers.items():
                for old, new in REWORDINGS:
                    text = text.replace(old, new)
                answers[key] = text
            if answers != row.answers:
                row.answers = answers
                row.save(update_fields=["answers"])
                reworded += 1
        company.employee_count = company.users.count()
        company.save(update_fields=["employee_count"])
        self.stdout.write(self.style.SUCCESS(
            f"Terminé — {company.name} : {company.employee_count} comptes, administrateur {ADMIN_LOGIN}, "
            f"{kept.count()} évaluations conservées, {reworded} texte(s) Feedforward retouché(s)."
        ))


class _Rollback(Exception):
    pass
