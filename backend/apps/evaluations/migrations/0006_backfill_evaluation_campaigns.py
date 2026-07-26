"""
Backfill : crée une EvaluationCampaign par (entreprise, période) distincte
observée dans les évaluations existantes, puis rattache chaque évaluation à
la campagne correspondante — étape intermédiaire avant de rendre `campaign`
obligatoire et de supprimer l'ancien champ texte libre `period`.
"""
import re
from datetime import date

from django.db import migrations


def parse_period(period):
    """Convertit une ancienne période texte ("2022", "2025-S1") en
    (nom, date_debut, date_fin)."""
    match = re.fullmatch(r"(\d{4})-S([12])", period or "")
    if match:
        year, semester = int(match.group(1)), int(match.group(2))
        if semester == 1:
            return f"Semestre 1 {year}", date(year, 1, 1), date(year, 6, 30)
        return f"Semestre 2 {year}", date(year, 7, 1), date(year, 12, 31)
    match = re.fullmatch(r"\d{4}", period or "")
    if match:
        year = int(period)
        return f"Année {year}", date(year, 1, 1), date(year, 12, 31)
    # Format non reconnu : on conserve le texte tel quel avec la date du jour.
    today = date.today()
    return (period or "Période inconnue"), today, today


def backfill_campaigns(apps, schema_editor):
    Evaluation = apps.get_model("evaluations", "Evaluation")
    EvaluationCampaign = apps.get_model("evaluations", "EvaluationCampaign")

    periods_by_company = {}
    for evaluation in Evaluation.objects.select_related("user").all():
        company_id = evaluation.user.company_id
        if not company_id:
            continue
        periods_by_company.setdefault(company_id, set()).add(evaluation.period)

    campaign_by_key = {}
    for company_id, periods in periods_by_company.items():
        for period in periods:
            name, start_date, end_date = parse_period(period)
            campaign, _ = EvaluationCampaign.objects.get_or_create(
                company_id=company_id,
                name=name,
                defaults={"start_date": start_date, "end_date": end_date},
            )
            campaign_by_key[(company_id, period)] = campaign.id

    for evaluation in Evaluation.objects.select_related("user").all():
        company_id = evaluation.user.company_id
        campaign_id = campaign_by_key.get((company_id, evaluation.period))
        if campaign_id:
            evaluation.campaign_id = campaign_id
            evaluation.save(update_fields=["campaign"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("evaluations", "0005_alter_evaluation_options_alter_evaluation_period_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_campaigns, noop_reverse),
    ]
