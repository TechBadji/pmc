from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("teams", "0007_cohesion_response")]

    operations = [
        migrations.AlterUniqueTogether(
            name="teamrelationship",
            unique_together={("team", "from_user", "to_user")},
        ),
    ]
