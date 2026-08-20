from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    """Une direction est composée de services : un service est un département
    dont `parent` désigne la direction. Nul partout à l'application de cette
    migration — l'organisation existante reste donc inchangée."""

    dependencies = [("core", "0012_previous_position_dates")]

    operations = [
        migrations.AddField(
            model_name="department",
            name="parent",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="services",
                to="core.department",
                verbose_name="Direction de rattachement",
                help_text="Renseigné pour un service : la direction dont il dépend. Vide pour une direction.",
            ),
        ),
    ]
