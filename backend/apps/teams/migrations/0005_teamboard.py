from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0013_department_parent"),
        ("teams", "0004_team_relationship_ordering"),
    ]

    operations = [
        migrations.CreateModel(
            name="TeamBoard",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("date", models.DateField(verbose_name="Date de la saisie")),
                ("people_strengths", models.JSONField(blank=True, default=list, verbose_name="Forces — People")),
                ("people_weaknesses", models.JSONField(blank=True, default=list, verbose_name="Faiblesses — People")),
                ("business_strengths", models.JSONField(blank=True, default=list, verbose_name="Forces — Business")),
                ("business_weaknesses", models.JSONField(blank=True, default=list, verbose_name="Faiblesses — Business")),
                ("catalysts", models.JSONField(blank=True, default=list, verbose_name="Catalyseurs")),
                ("nourishers", models.JSONField(blank=True, default=list, verbose_name="Nourrisseurs")),
                ("inhibitors", models.JSONField(blank=True, default=list, verbose_name="Inhibiteurs")),
                ("toxins", models.JSONField(blank=True, default=list, verbose_name="Toxines")),
                ("vision_missions", models.TextField(blank=True, verbose_name="Vision / Missions de l'équipe")),
                ("values", models.JSONField(blank=True, default=list, verbose_name="Valeurs")),
                ("counter_values", models.JSONField(blank=True, default=list, verbose_name="Contre-valeurs")),
                ("achievements", models.JSONField(blank=True, default=list, verbose_name="Grandes réalisations")),
                ("failures_lessons", models.JSONField(blank=True, default=list, verbose_name="Échecs / leçons")),
                ("objectives", models.JSONField(blank=True, default=list, verbose_name="Objectifs")),
                ("priorities_cohesion", models.JSONField(blank=True, default=list, verbose_name="Priorités — cohésion")),
                ("priorities_business", models.JSONField(blank=True, default=list, verbose_name="Priorités — business")),
                ("targets_vs_actuals", models.JSONField(blank=True, default=list, verbose_name="Réalisations vs objectifs")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("team", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="boards", to="core.department", verbose_name="Équipe")),
            ],
            options={
                "verbose_name": "Carte d'équipe",
                "verbose_name_plural": "Cartes d'équipe",
                "ordering": ["-date"],
                "unique_together": {("team", "date")},
            },
        ),
    ]
