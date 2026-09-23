from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0016_peer_access"),
    ]

    operations = [
        migrations.AddField(
            model_name="auditlog",
            name="ip_address",
            field=models.GenericIPAddressField(blank=True, null=True, verbose_name="Adresse IP"),
        ),
        migrations.AddField(
            model_name="auditlog",
            name="country_code",
            field=models.CharField(blank=True, max_length=2, verbose_name="Code pays"),
        ),
        migrations.AddField(
            model_name="auditlog",
            name="country_name",
            field=models.CharField(blank=True, max_length=80, verbose_name="Pays"),
        ),
    ]
