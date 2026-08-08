import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('evaluations', '0009_skillnote'),
    ]

    operations = [
        # Retire l'ancienne contrainte unique (user, category, order) avant
        # de supprimer la colonne 'user' qu'elle référence.
        migrations.AlterUniqueTogether(
            name='skillnote',
            unique_together=set(),
        ),
        migrations.RemoveField(
            model_name='skillnote',
            name='user',
        ),
        migrations.AddField(
            model_name='skillnote',
            name='evaluation',
            field=models.ForeignKey(
                default=None,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='skill_notes',
                to='evaluations.evaluation',
                verbose_name='Évaluation',
            ),
            preserve_default=False,
        ),
        migrations.AlterField(
            model_name='skillnote',
            name='evaluation',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='skill_notes',
                to='evaluations.evaluation',
                verbose_name='Évaluation',
            ),
        ),
        migrations.AlterUniqueTogether(
            name='skillnote',
            unique_together={('evaluation', 'category', 'order')},
        ),
    ]
