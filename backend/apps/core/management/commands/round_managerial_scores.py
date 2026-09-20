"""
Ramène en entiers (1 à 5) les notes « niveau actuel » de l'auto-évaluation
managériale : la fiche se remplit par pilules (1, 2, 3, 4, 5), une note
décimale (3,2 ; 4,7) n'allume donc aucune pilule. Les objectifs, eux, restent
décimaux. L'indice de la fiche (IC) est recalculé.

Arrondi à l'entier le plus proche (0,5 vers le haut). Idempotent.

Usage:
    python manage.py round_managerial_scores [--company "Africa Insurance Group"]
"""
from decimal import ROUND_HALF_UP, Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.evaluations.models import ManagerialSelfAssessment


def _to_int(value):
    return max(1, min(5, int(Decimal(str(value)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))))


class Command(BaseCommand):
    help = "Arrondit à l'entier les notes de l'auto-évaluation managériale."

    def add_arguments(self, parser):
        parser.add_argument("--company", default="Africa Insurance Group")

    @transaction.atomic
    def handle(self, *args, **options):
        rows = ManagerialSelfAssessment.objects.filter(user__company__name=options["company"])
        changed = 0
        for a in rows:
            new_scores, dirty = [], False
            for entry in a.scores:
                score = entry.get("score")
                if score is not None and _to_int(score) != score:
                    entry = {**entry, "score": _to_int(score)}
                    dirty = True
                new_scores.append(entry)
            if not dirty:
                continue
            values = [e["score"] for e in new_scores if e.get("score") is not None]
            a.scores = new_scores
            a.ic_score = round(sum(values) / len(values), 1) if values else 0
            a.save(update_fields=["scores", "ic_score"])
            changed += 1
        self.stdout.write(self.style.SUCCESS(f"Terminé — {changed} fiche(s) sur {rows.count()} ramenée(s) à des notes entières."))
