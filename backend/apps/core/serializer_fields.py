"""Champs de sérialisation communs à toute l'API.

Un seul sujet pour l'instant : la saisie des nombres décimaux en français.
"""
from django.db import models
from rest_framework import serializers

# Virgule décimale, et espaces de groupement des milliers — l'espace fine
# insécable et l'espace insécable arrivent tels quels d'un copier-coller depuis
# un tableur, où « 1 250,5 » s'écrit avec l'un ou l'autre selon l'outil.
_NORMALISATION = str.maketrans({",": ".", " ": "", " ": "", " ": ""})


class LocalizedDecimalField(serializers.DecimalField):
    """Un décimal qui accepte la virgule autant que le point.

    « 2,4 » est la forme naturelle en français, et c'était jusqu'ici un 400
    « Un nombre valide est requis ». Les écrans de saisie enregistrent en
    arrière-plan et n'affichaient pas cette erreur : la valeur semblait prise,
    puis disparaissait au rechargement. Corriger l'affichage de l'erreur
    n'aurait pas suffi — il aurait fallu apprendre à l'utilisateur à taper un
    point pour saisir une note. On normalise donc à l'entrée.

    La normalisation ne porte que sur les chaînes : un nombre JSON arrive déjà
    typé et n'a aucun séparateur à réinterpréter.
    """

    def to_internal_value(self, data):
        if isinstance(data, str):
            data = data.translate(_NORMALISATION)
        return super().to_internal_value(data)


def normalize_decimal(value):
    """Même normalisation, pour les valeurs qui ne passent pas par un champ.

    Les notes de compétences transitent par un `ListField(DictField())` écrit
    ensuite en `bulk_create` : aucun champ de sérialisation ne les voit, la
    conversion doit donc être faite à la main sur ce chemin-là.
    """
    if isinstance(value, str):
        return value.translate(_NORMALISATION)
    return value


class DecimalCommaMixin:
    """Rend tous les champs décimaux d'un ModelSerializer tolérants à la virgule.

    Passe par `serializer_field_mapping` plutôt que par une déclaration champ
    par champ : les bornes (`max_digits`, `decimal_places`) et le caractère
    facultatif restent déduits du modèle, et un champ décimal ajouté plus tard
    en hérite sans qu'on ait à y penser.
    """

    serializer_field_mapping = {
        **serializers.ModelSerializer.serializer_field_mapping,
        models.DecimalField: LocalizedDecimalField,
    }
