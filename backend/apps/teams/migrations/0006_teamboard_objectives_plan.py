from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("teams", "0005_teamboard")]

    operations = [
        migrations.AddField(
            model_name="teamboard",
            name="objectives_plan",
            field=models.JSONField(blank=True, default=list, verbose_name="Objectifs par année"),
        ),
    ]
