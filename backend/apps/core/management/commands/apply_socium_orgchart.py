"""
Applique à SOCIUM son organigramme réel, lu dans un dossier qui n'est PAS
versionné (il porte les noms et les photos de personnes réelles) :

    <dossier>/orgchart.json   {"departments": [{code, name, parent, manager}],
                               "people": [{login, first_name, last_name, position,
                                           role, department, manager, photo}]}
    <dossier>/photos/<fichier>  le portrait de chaque personne

  - les directions et leurs services sont créés (un service a `parent`), avec
    leur responsable ;
  - chaque personne est rattachée à son équipe et à son responsable ; un compte
    absent est créé (mot de passe de démonstration, sans changement imposé),
    un compte existant garde son mot de passe et toutes ses données ;
  - la photo de l'organigramme remplace la vignette du compte ;
  - les évaluations déjà présentes prennent pour évaluateur le responsable de
    la personne ;
  - l'administrateur de l'entreprise est la personne de rôle COMPANY_ADMIN.

Aucun compte n'est supprimé. Relançable : rien n'est créé deux fois, une photo
déjà posée par cette commande n'est pas réécrite.

Usage:
    python manage.py apply_socium_orgchart /chemin/dossier --dry-run
    python manage.py apply_socium_orgchart /chemin/dossier
"""
import json
from pathlib import Path

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.models import Company, Department, User
from apps.evaluations.models import Evaluation

COMPANY_NAME = "SOCIUM"
PASSWORD = "123456"
PHOTO_MARK = "_photo"


class _Rollback(Exception):
    pass


class Command(BaseCommand):
    help = "SOCIUM : applique l'organigramme réel (équipes, rattachements, photos) lu dans un dossier non versionné."

    def add_arguments(self, parser):
        parser.add_argument("folder", help="Dossier contenant orgchart.json et photos/ (non versionné).")
        parser.add_argument("--dry-run", action="store_true", help="Annonce ce qui serait fait, sans rien écrire.")

    def handle(self, *args, **options):
        folder = Path(options["folder"])
        data = self._read(folder)
        try:
            with transaction.atomic():
                self._apply(folder, data, options["dry_run"])
                if options["dry_run"]:
                    raise _Rollback
        except _Rollback:
            self.stdout.write(self.style.WARNING("Essai à blanc : rien n'a été écrit."))

    def _read(self, folder):
        try:
            data = json.loads((folder / "orgchart.json").read_text(encoding="utf-8"))
            departments, people = data["departments"], data["people"]
        except (OSError, ValueError, KeyError, TypeError) as error:
            raise CommandError(f"Organigramme illisible ({folder / 'orgchart.json'}) : {error}")
        codes = {d["code"] for d in departments}
        logins = {p["login"] for p in people}
        problems = []
        for d in departments:
            if len(d["code"]) > 4:
                problems.append(f"code d'équipe trop long : {d['code']}")
            if d.get("parent") and d["parent"] not in codes:
                problems.append(f"{d['code']} : direction de rattachement inconnue ({d['parent']})")
            if d.get("manager") and d["manager"] not in logins:
                problems.append(f"{d['code']} : responsable inconnu ({d['manager']})")
        for p in people:
            if not all(str(p.get(k) or "").strip() for k in ("login", "first_name", "last_name", "position")):
                problems.append(f"{p.get('login')} : login, prénom, nom et fonction sont attendus")
            if p.get("role") not in User.Role.values:
                problems.append(f"{p['login']} : rôle inconnu ({p.get('role')})")
            if p.get("department") not in codes:
                problems.append(f"{p['login']} : équipe inconnue ({p.get('department')})")
            if p.get("manager") and p["manager"] not in logins:
                problems.append(f"{p['login']} : responsable inconnu ({p['manager']})")
            if p.get("photo") and not (folder / "photos" / p["photo"]).exists():
                problems.append(f"{p['login']} : photo introuvable ({p['photo']})")
        admins = [p["login"] for p in people if p.get("role") == User.Role.COMPANY_ADMIN]
        if len(admins) != 1:
            problems.append(f"un seul administrateur est attendu, {len(admins)} trouvé(s)")
        if problems:
            raise CommandError("Organigramme incohérent :\n  " + "\n  ".join(problems))
        return data

    def _apply(self, folder, data, dry):
        company = Company.objects.filter(name=COMPANY_NAME).first()
        if company is None:
            raise CommandError(f"Entreprise « {COMPANY_NAME} » introuvable.")
        # Contrôle avant d'écrire : un login tenu par une autre entreprise ferait
        # échouer la création par une erreur d'intégrité illisible.
        for person in data["people"]:
            other = User.objects.filter(generated_login__iexact=person["login"]).exclude(company=company).first()
            if other is not None:
                raise CommandError(f"Le login {person['login']} est déjà pris par {other.email}.")

        depts = {}
        for d in data["departments"]:
            dept, created = Department.objects.get_or_create(company=company, code=d["code"], defaults={"name": d["name"]})
            if dept.name != d["name"]:
                dept.name = d["name"]
                dept.save(update_fields=["name"])
            depts[d["code"]] = dept
            self.stdout.write(f"  équipe {d['code']} {d['name']} : {'créée' if created else 'déjà là'}")
        for d in data["departments"]:
            dept, parent = depts[d["code"]], depts.get(d.get("parent"))
            if dept.parent_id != (parent.id if parent else None):
                dept.parent = parent
                dept.save(update_fields=["parent"])

        users, created_count, photos = {}, 0, 0
        for person in data["people"]:
            login = person["login"]
            user = company.users.filter(generated_login__iexact=login).first()
            if user is None:
                user = User(email=f"{login.lower()}@{company.slug}.pmc.local", generated_login=login, company=company,
                            must_change_password=False)
                user.set_password(PASSWORD)
                created_count += 1
            user.first_name, user.last_name = person["first_name"].strip(), person["last_name"].strip()
            user.position, user.role = person["position"].strip(), person["role"]
            user.department = depts[person["department"]]
            user.save()
            users[login] = user
        for person in data["people"]:
            user = users[person["login"]]
            manager = users.get(person.get("manager"))
            if user.manager_id != (manager.id if manager else None):
                user.manager = manager
                user.save(update_fields=["manager"])
            if person.get("photo") and not dry and PHOTO_MARK not in (user.avatar.name or ""):
                if user.avatar:
                    user.avatar.delete(save=False)
                user.avatar.save(
                    f"socium_{person['login']}{PHOTO_MARK}.jpg",
                    ContentFile((folder / "photos" / person["photo"]).read_bytes()), save=True,
                )
                photos += 1
            Evaluation.objects.filter(user=user).exclude(evaluator=manager).update(evaluator=manager)
        for d in data["departments"]:
            dept, manager = depts[d["code"]], users.get(d.get("manager"))
            if dept.manager_id != (manager.id if manager else None):
                dept.manager = manager
                dept.save(update_fields=["manager"])

        admin = next(users[p["login"]] for p in data["people"] if p["role"] == User.Role.COMPANY_ADMIN)
        company.admin_user = admin
        company.admin_first_name, company.admin_last_name = admin.first_name, admin.last_name
        company.employee_count = company.users.count()
        company.save(update_fields=["admin_user", "admin_first_name", "admin_last_name", "employee_count"])
        outside = company.users.exclude(pk__in=[u.pk for u in users.values()]).count()
        self.stdout.write(self.style.SUCCESS(
            f"Terminé — {company.name} : {len(depts)} équipes, {len(users)} personnes dont {created_count} compte(s) créé(s), "
            f"{photos} photo(s) posée(s), {outside} compte(s) hors organigramme laissé(s) en place."
        ))
