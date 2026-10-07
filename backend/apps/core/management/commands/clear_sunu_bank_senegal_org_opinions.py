"""
Vide la rubrique « Mon avis sur mon organisation » de SUNU Bank Sénégal :
supprime les avis de cohésion de portée ORGANISATION déposés par les comptes
de l'entreprise, toutes dates confondues.

Toutes dates, et pas seulement la campagne en cours : l'écran de saisie
reprend le DERNIER avis du collaborateur, quelle qu'en soit la date. Tant
qu'il lui reste un avis de 2023, 2024 ou 2025, le formulaire s'ouvre
pré-rempli. Contrepartie : la lecture « organisation » du CEO n'a plus
d'historique sur ces campagnes, jusqu'aux nouvelles saisies.

Ne touche ni aux avis « sur sa direction » (portée TEAM), ni aux fiches de
cohésion des directions, ni à aucune autre entreprise.

La suppression exige une sauvegarde : `--backup FICHIER` écrit d'abord les
lignes dans un fichier que `python manage.py loaddata FICHIER` restaure :
mêmes identifiants, mêmes répondants, mêmes dates, mêmes notes (seuls les
horodatages techniques de création sont arrondis à la milliseconde).
`--dry-run` annonce ce qui serait supprimé sans rien écrire en base.

Usage:
    python manage.py clear_sunu_bank_senegal_org_opinions --dry-run
    python manage.py clear_sunu_bank_senegal_org_opinions --backup /tmp/sbs_avis_organisation.json
"""
from collections import Counter
from pathlib import Path

from django.core import serializers
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q

from apps.core.models import Company
from apps.teams.models import CohesionResponse

COMPANY_NAME = "SUNU Bank Sénégal"


class Command(BaseCommand):
    help = "Supprime les avis de cohésion de portée ORGANISATION de SUNU Bank Sénégal (avec sauvegarde)."

    def add_arguments(self, parser):
        parser.add_argument("--backup", metavar="FICHIER", help="Fichier JSON de sauvegarde, restaurable par loaddata.")
        parser.add_argument("--dry-run", action="store_true", help="Annonce ce qui serait supprimé, sans rien écrire en base.")

    def handle(self, *args, **options):
        dry, backup = options["dry_run"], options["backup"]
        if not dry and not backup:
            raise CommandError("Indiquez --backup FICHIER : la suppression ne se fait pas sans sauvegarde (ou --dry-run pour un essai à blanc).")
        try:
            company = Company.objects.get(name=COMPANY_NAME)
        except Company.DoesNotExist:
            raise CommandError(f"Entreprise « {COMPANY_NAME} » introuvable.")

        # Les identifiants sont figés d'abord : la suppression porte sur la
        # liste exacte qui a été comptée et sauvegardée, pas sur une requête
        # rejouée entre-temps.
        ids = sorted(set(
            CohesionResponse.objects
            .filter(scope=CohesionResponse.Scope.ORGANISATION)
            .filter(Q(company=company) | Q(respondent__company=company))
            .values_list("pk", flat=True)
        ))
        target = CohesionResponse.objects.filter(pk__in=ids)
        team_before = self._team_count(company)
        by_date = Counter(str(d) for d in target.values_list("date", flat=True))
        respondents = target.values("respondent").distinct().count()
        self.stdout.write(f"{company.name} — avis « sur mon organisation » : {len(ids)}, de {respondents} personne(s)")
        for day, count in sorted(by_date.items()):
            self.stdout.write(f"  {day} : {count}")
        if not ids:
            self.stdout.write(self.style.SUCCESS("Rien à supprimer."))
            return

        if backup:
            path = Path(backup)
            if path.exists():
                raise CommandError(f"{path} existe déjà : choisissez un autre nom, une sauvegarde ne s'écrase pas.")
            try:
                path.write_text(serializers.serialize("json", target.order_by("pk"), indent=1), encoding="utf-8")
            except OSError as error:
                raise CommandError(f"Sauvegarde impossible dans {path} : {error}")
            saved = len(list(serializers.deserialize("json", path.read_text(encoding="utf-8"))))
            if saved != len(ids):
                raise CommandError(f"Sauvegarde incomplète ({saved} lignes relues sur {len(ids)}) : rien n'a été supprimé.")
            self.stdout.write(f"Sauvegarde : {saved} lignes dans {path}")

        with transaction.atomic():
            _total, per_model = target.delete()
            others = {label: n for label, n in per_model.items() if label != CohesionResponse._meta.label and n}
            if others:
                # Aucune table ne dépend de ces avis aujourd'hui ; si cela
                # change, mieux vaut s'arrêter que d'emporter autre chose.
                raise CommandError(f"La suppression emporterait aussi : {others}. Rien n'a été supprimé.")
            removed = per_model.get(CohesionResponse._meta.label, 0)
            if removed != len(ids) or self._team_count(company) != team_before:
                raise CommandError("Le décompte après suppression ne correspond pas à l'attendu. Rien n'a été supprimé.")
            if dry:
                transaction.set_rollback(True)

        if dry:
            self.stdout.write(self.style.WARNING(f"Essai à blanc : {removed} avis seraient supprimés, rien n'a été écrit en base."))
        else:
            self.stdout.write(self.style.SUCCESS(
                f"{removed} avis supprimés. Avis « sur sa direction » inchangés : {team_before}. "
                f"Pour restaurer : python manage.py loaddata {backup}"
            ))

    @staticmethod
    def _team_count(company):
        return CohesionResponse.objects.filter(scope=CohesionResponse.Scope.TEAM).filter(
            Q(company=company) | Q(team__company=company)
        ).distinct().count()
