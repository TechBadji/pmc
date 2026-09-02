from django.db import migrations, models
import django.db.models.deletion


def rattacher_entreprise(apps, schema_editor):
    """Les avis déjà déposés portent tous sur une direction : on leur donne
    l'entreprise de cette direction, pour que la portée organisation puisse
    s'appuyer sur un champ toujours renseigné."""
    CohesionResponse = apps.get_model("teams", "CohesionResponse")
    for response in CohesionResponse.objects.select_related("team").iterator():
        if response.team_id and not response.company_id:
            response.company_id = response.team.company_id
            response.save(update_fields=["company"])


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0013_department_parent"),
        ("teams", "0008_relationship_unique_per_team"),
    ]

    operations = [
        migrations.AddField(
            model_name="cohesionresponse",
            name="scope",
            field=models.CharField(
                choices=[("TEAM", "Sa direction"), ("ORGANISATION", "L'organisation")],
                default="TEAM",
                max_length=15,
                verbose_name="Portée",
            ),
        ),
        migrations.AddField(
            model_name="cohesionresponse",
            name="company",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="cohesion_responses",
                to="core.company",
                verbose_name="Entreprise",
            ),
        ),
        migrations.AlterField(
            model_name="cohesionresponse",
            name="team",
            field=models.ForeignKey(
                blank=True,
                null=True,
                help_text="Vide pour un avis portant sur l'organisation.",
                on_delete=django.db.models.deletion.CASCADE,
                related_name="cohesion_responses",
                to="core.department",
                verbose_name="Direction notée",
            ),
        ),
        migrations.RunPython(rattacher_entreprise, migrations.RunPython.noop),
        migrations.AlterUniqueTogether(name="cohesionresponse", unique_together=set()),
        migrations.AddConstraint(
            model_name="cohesionresponse",
            constraint=models.UniqueConstraint(
                condition=models.Q(scope="TEAM"),
                fields=("team", "respondent", "date"),
                name="unique_team_cohesion_response",
            ),
        ),
        migrations.AddConstraint(
            model_name="cohesionresponse",
            constraint=models.UniqueConstraint(
                condition=models.Q(scope="ORGANISATION"),
                fields=("company", "respondent", "date"),
                name="unique_org_cohesion_response",
            ),
        ),
    ]
