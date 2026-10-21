"""
Remet en place une entreprise supprimée, avec toutes ses données, à partir
d'une copie de la base : une sauvegarde `pg_dump` chargée dans une base
temporaire du même serveur Postgres.

Supprimer une entreprise (Super Admin → Entreprises) emporte en cascade ses
comptes, directions, campagnes, évaluations, avis, plans d'action… La
commande parcourt ce même graphe dans la copie — chaque ligne qui dépend de
l'entreprise par un lien CASCADE, ou PROTECT pour les évaluations que
`perform_destroy` retire en premier — et le réinsère tel quel dans la base
courante : mêmes identifiants, mêmes dates, mêmes mots de passe. Les autres
entreprises ne sont pas touchées.

Contrôlé avant toute écriture :
- la copie est une autre base que la base courante, au schéma courant (y
  passer `migrate` d'abord) ;
- aucun identifiant à réinsérer n'est pris dans la base courante — et
  l'insertion est forcée : une collision ferait échouer l'opération plutôt
  qu'écraser une ligne ;
- ni le slug ni le nom de l'entreprise, ni les emails et logins de ses
  comptes ne sont pris, casse ignorée comme à la connexion ;
- les lignes extérieures référencées (un super admin auteur d'un verdict…)
  existent encore.
Tout se fait dans une transaction : à la moindre erreur, rien n'est écrit.
`--dry-run` va jusqu'au contrôle des contraintes, puis annule.

Les lignes extérieures qui ont survécu à la suppression en perdant leur lien
(SET_NULL : le journal d'activité garde ses entrées, sans auteur) sont
comptées ; `--relink` leur rend ce lien, seulement si elles n'ont pas changé
par ailleurs. Les fichiers (photos de profil) ne sont pas dans la base : ceux
qui manquent sont signalés.

Usage:
    POSTGRES_DB=pmc_restore python manage.py migrate
    python manage.py restore_company --source-db pmc_restore --slug sunu-services --relink --dry-run
    python manage.py restore_company --source-db pmc_restore --slug sunu-services --relink
"""
from collections import Counter, defaultdict, deque

from django.core.management.base import BaseCommand, CommandError
from django.db import DatabaseError, connections, models, transaction
from django.db.migrations.executor import MigrationExecutor
from django.db.models.deletion import get_candidate_relations_to_delete
from django.db.models.functions import Lower

from apps.core.models import Company, User

SOURCE = "restore_source"
# Liens par lesquels une suppression emporte les lignes qui dépendent de la
# ligne supprimée. PROTECT : les évaluations, que perform_destroy retire avant
# l'entreprise.
FOLLOWED = (models.CASCADE, models.PROTECT, models.RESTRICT)
# Valeurs qui désignent une entreprise ou un compte sur toute la plateforme,
# comparées sans la casse : la connexion accepte l'email ou le login quelle
# que soit leur casse, deux comptes qui n'en diffèrent que par elle se
# confondraient.
IDENTIFIERS = ((Company, "slug"), (Company, "name"), (User, "email"), (User, "generated_login"))


class Command(BaseCommand):
    help = "Remet en place une entreprise supprimée et toutes ses données, depuis une copie de la base."

    def add_arguments(self, parser):
        parser.add_argument("--source-db", required=True, help="Base temporaire où la sauvegarde a été chargée, sur le même serveur.")
        parser.add_argument("--slug", required=True, help="Slug de l'entreprise à remettre en place.")
        parser.add_argument("--relink", action="store_true", help="Rend leur lien aux lignes extérieures qui l'ont perdu à la suppression.")
        parser.add_argument("--dry-run", action="store_true", help="Va jusqu'au contrôle des contraintes, puis annule : rien n'est écrit.")

    def handle(self, *args, **options):
        dry, source_db = options["dry_run"], options["source_db"]
        self._open_source(source_db)
        try:
            company = Company._base_manager.using(SOURCE).get(slug=options["slug"])
        except Company.DoesNotExist:
            raise CommandError(f"Aucune entreprise « {options['slug']} » dans la copie {source_db}.")

        graph = self._collect(company)
        rows = [obj for model, pks in graph.items() for obj in model._base_manager.using(SOURCE).filter(pk__in=pks)]
        self.stdout.write(f"{company.name} (#{company.pk}) dans {source_db} : {len(rows)} lignes")
        for model, pks in sorted(graph.items(), key=lambda item: item[0]._meta.label):
            self.stdout.write(f"  {model._meta.label} : {len(pks)}")

        references, missing = self._references(graph, rows)
        problems = self._conflicts(graph, rows) + missing
        if problems:
            raise CommandError("Rien n'a été écrit :\n  " + "\n  ".join(problems))
        for model, pks in sorted(references.items(), key=lambda item: item[0]._meta.label):
            self.stdout.write(f"Lignes extérieures référencées, présentes : {model._meta.label} × {len(pks)}")
        unlinked = self._unlinked(graph)
        for (model, field), count in sorted(Counter((m._meta.label, f.name) for m, f, _ in unlinked).items()):
            self.stdout.write(f"Lien perdu à la suppression : {model}.{field} × {count}")
        for name in self._missing_files(rows):
            self.stdout.write(self.style.WARNING(f"Fichier absent du stockage : {name}"))
        behind = self._sequences_behind(graph)

        with transaction.atomic():
            if behind and not dry:
                # setval échappe à la transaction : on n'avance une séquence
                # que pour de bon, et jamais à reculons.
                with connections["default"].cursor() as cursor:
                    for sequence, top in behind:
                        cursor.execute("SELECT setval(%s, %s)", [sequence, top])
            for obj in rows:
                # Les clés étrangères de Postgres sont vérifiées en fin de
                # transaction : l'ordre d'insertion est indifférent.
                obj.save_base(raw=True, force_insert=True, using="default")
            relinked, kept = self._relink(unlinked) if options["relink"] else (0, 0)
            connections["default"].check_constraints()
            for model, pks in graph.items():
                if model._base_manager.filter(pk__in=pks).count() != len(pks):
                    raise CommandError(f"{model._meta.label} : décompte incomplet après insertion. Rien n'a été écrit.")
            if dry:
                transaction.set_rollback(True)
        connections[SOURCE].close()

        for sequence, top in behind:
            self.stdout.write(f"Séquence {sequence} {'à avancer' if dry else 'avancée'} jusqu'à {top}")
        if options["relink"]:
            self.stdout.write(f"Liens rendus : {relinked}" + (f" ; laissés tels quels (ligne modifiée ou disparue) : {kept}" if kept else ""))
        if dry:
            self.stdout.write(self.style.WARNING(f"Essai à blanc : {len(rows)} lignes passeraient, contraintes comprises. Rien n'a été écrit."))
        else:
            self.stdout.write(self.style.SUCCESS(f"{company.name} est de retour : {len(rows)} lignes réinsérées."))

    def _open_source(self, name):
        """Déclare la copie comme seconde base, avec les réglages de la base courante."""
        default = connections.settings["default"]
        if name == default["NAME"]:
            raise CommandError("--source-db désigne la base courante : il faut la copie où la sauvegarde a été chargée.")
        connections.settings[SOURCE] = {**default, "NAME": name}
        try:
            executor = MigrationExecutor(connections[SOURCE])
            pending = executor.migration_plan(executor.loader.graph.leaf_nodes())
        except DatabaseError as error:
            raise CommandError(f"Copie {name} illisible : {error}")
        if pending:
            raise CommandError(
                f"La copie {name} n'est pas au schéma courant ({len(pending)} migration(s) à passer) : "
                f"lancez d'abord migrate avec POSTGRES_DB={name}."
            )

    def _collect(self, company):
        """Identifiants, par modèle, de toutes les lignes que la suppression de
        l'entreprise emporte : le parcours du Collector de Django, sans rien
        supprimer. Les tables de liaison plusieurs-à-plusieurs en font partie
        (leurs clés vers les deux côtés sont en CASCADE)."""
        graph = defaultdict(set)
        graph[Company].add(company.pk)
        queue = deque([(Company, {company.pk})])
        while queue:
            model, pks = queue.popleft()
            for rel in get_candidate_relations_to_delete(model._meta):
                if rel.on_delete not in FOLLOWED:
                    continue
                found = set(
                    rel.related_model._base_manager.using(SOURCE)
                    .filter(**{f"{rel.field.name}__in": pks})
                    .values_list("pk", flat=True)
                ) - graph.get(rel.related_model, set())
                if found:
                    graph[rel.related_model] |= found
                    queue.append((rel.related_model, found))
        return graph

    def _conflicts(self, graph, rows):
        """Ce que la base courante a déjà : identifiants, slug, nom, emails, logins."""
        problems = []
        for model, pks in graph.items():
            taken = sorted(model._base_manager.filter(pk__in=pks).values_list("pk", flat=True))
            if taken:
                problems.append(f"{model._meta.label} : {len(taken)} identifiant(s) déjà pris, dont {taken[:10]}")
        for model, field in IDENTIFIERS:
            values = {getattr(obj, field).lower() for obj in rows if isinstance(obj, model) and getattr(obj, field)}
            if not values:
                continue
            taken = sorted(
                model._base_manager.annotate(identifier=Lower(field)).filter(identifier__in=values).values_list(field, flat=True)
            )
            if taken:
                problems.append(f"{model._meta.label}.{field} déjà pris : {', '.join(taken[:10])}")
        return problems

    def _references(self, graph, rows):
        """Lignes hors du graphe vers lesquelles pointent les lignes à
        réinsérer (un super admin, un groupe…) : elles doivent exister dans la
        base courante."""
        wanted = defaultdict(set)
        for obj in rows:
            for f in obj._meta.concrete_fields:
                if not f.is_relation:
                    continue
                target, value = f.related_model._meta.concrete_model, getattr(obj, f.attname)
                if value is not None and value not in graph.get(target, ()):
                    wanted[target].add(value)
        missing = []
        for model, pks in wanted.items():
            absent = pks - set(model._base_manager.filter(pk__in=pks).values_list("pk", flat=True))
            if absent:
                missing.append(f"{model._meta.label} : {len(absent)} ligne(s) référencée(s) absente(s), dont {sorted(absent)[:10]}")
        return wanted, missing

    def _unlinked(self, graph):
        """Lignes de la copie, hors du graphe, qui pointaient vers lui par un
        lien que la suppression a coupé sans les emporter (SET_NULL…)."""
        found = []
        for model, pks in graph.items():
            for rel in get_candidate_relations_to_delete(model._meta):
                if rel.on_delete in FOLLOWED:
                    continue
                outside = (
                    rel.related_model._base_manager.using(SOURCE)
                    .filter(**{f"{rel.field.name}__in": pks})
                    .exclude(pk__in=graph.get(rel.related_model, ()))
                )
                found += [(rel.related_model, rel.field, obj) for obj in outside]
        return found

    def _relink(self, unlinked):
        """Rend son lien à chaque ligne encore là, sans lien et identique à la
        copie pour tout le reste ; sinon ce n'est plus la même ligne, ou elle a
        été modifiée depuis : on n'y touche pas."""
        relinked = kept = 0
        for model, field, source in unlinked:
            live = model._base_manager.filter(pk=source.pk).first()
            unchanged = live is not None and all(
                getattr(live, f.attname) == getattr(source, f.attname) for f in model._meta.concrete_fields if f is not field
            )
            if field.remote_field.on_delete is models.SET_NULL and unchanged and getattr(live, field.attname) is None:
                model._base_manager.filter(pk=source.pk).update(**{field.attname: getattr(source, field.attname)})
                relinked += 1
            else:
                kept += 1
        return relinked, kept

    @staticmethod
    def _missing_files(rows):
        return [
            file.name
            for obj in rows
            for f in obj._meta.concrete_fields
            if isinstance(f, models.FileField)
            for file in [getattr(obj, f.attname)]
            if file and not file.storage.exists(file.name)
        ]

    @staticmethod
    def _sequences_behind(graph):
        """Séquences d'identifiants restées en deçà des lignes à réinsérer : la
        prochaine création de l'application heurterait l'une d'elles."""
        behind = []
        with connections["default"].cursor() as cursor:
            for model, pks in graph.items():
                pk = model._meta.pk
                if not isinstance(pk, models.AutoField):
                    continue
                cursor.execute("SELECT pg_get_serial_sequence(%s, %s)", [model._meta.db_table, pk.column])
                sequence = cursor.fetchone()[0]
                if not sequence:
                    continue
                cursor.execute(f"SELECT last_value, is_called FROM {sequence}")
                last, called = cursor.fetchone()
                if max(pks) >= (last + 1 if called else last):
                    behind.append((sequence, max(pks)))
        return behind
