from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0013_department_parent"),
        ("teams", "0006_teamboard_objectives_plan"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="CohesionResponse",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("date", models.DateField(verbose_name="Date du tour")),
                (
                    "scores",
                    models.JSONField(
                        blank=True,
                        default=list,
                        help_text="Liste de {criterion, score} — score de 1 à 5.",
                        verbose_name="Notes par critère",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "team",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="cohesion_responses",
                        to="core.department",
                        verbose_name="Direction notée",
                    ),
                ),
                (
                    "respondent",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="cohesion_responses",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Répondant",
                    ),
                ),
            ],
            options={
                "verbose_name": "Avis de cohésion",
                "verbose_name_plural": "Avis de cohésion",
                "ordering": ["-date"],
                "unique_together": {("team", "respondent", "date")},
            },
        ),
    ]
