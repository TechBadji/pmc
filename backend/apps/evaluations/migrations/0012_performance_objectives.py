from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0013_department_parent"),
        ("evaluations", "0011_skillnote_score"),
    ]

    operations = [
        migrations.AddField(
            model_name="evaluation",
            name="objectives_set_on",
            field=models.DateField(blank=True, null=True, verbose_name="Date de fixation des objectifs"),
        ),
        migrations.AddField(
            model_name="evaluation",
            name="evaluated_on",
            field=models.DateField(blank=True, null=True, verbose_name="Date de l'évaluation"),
        ),
        migrations.AddField(
            model_name="evaluation",
            name="next_evaluation_on",
            field=models.DateField(blank=True, null=True, verbose_name="Date de la prochaine évaluation"),
        ),
        migrations.AddField(
            model_name="evaluation",
            name="manager_visa",
            field=models.CharField(blank=True, max_length=150, verbose_name="Visa manager"),
        ),
        migrations.CreateModel(
            name="PerformanceObjective",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("category", models.CharField(choices=[("BUSINESS", "Objectifs business"), ("MANAGERIAL", "Objectifs leadership et managériaux")], max_length=12, verbose_name="Catégorie")),
                ("order", models.PositiveSmallIntegerField(default=1, verbose_name="Rang")),
                ("label", models.CharField(blank=True, max_length=500, verbose_name="Objectif")),
                ("indicator", models.CharField(blank=True, max_length=255, verbose_name="Indicateur de performance")),
                ("reference_value", models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True, verbose_name="Valeur de référence")),
                ("target_value", models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True, verbose_name="Valeur cible")),
                ("actual_value", models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True, verbose_name="Réalisé")),
                ("weight", models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True, verbose_name="Coefficient de pondération")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("campaign", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="team_objectives", to="evaluations.evaluationcampaign", verbose_name="Campagne")),
                ("evaluation", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="objectives", to="evaluations.evaluation", verbose_name="Évaluation")),
                ("team", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="objectives", to="core.department", verbose_name="Équipe")),
            ],
            options={
                "verbose_name": "Objectif de performance",
                "verbose_name_plural": "Objectifs de performance",
                "ordering": ["category", "order", "id"],
            },
        ),
    ]
