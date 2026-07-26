"""
Constantes métier : départements par défaut à la création d'une entreprise,
et services inclus par formule d'abonnement.
"""

# (code, nom) — créés automatiquement pour toute nouvelle entreprise.
# Le Super Admin peut ensuite en ajouter / en supprimer (s'ils sont vides).
DEFAULT_DEPARTMENTS = [
    ("DG", "Direction Générale"),
    ("DAF", "Direction Administrative et Financière"),
    ("DRH", "Direction des Ressources Humaines"),
    ("DCOM", "Direction Commerciale"),
    ("DSI", "Direction des Systèmes d'Information"),
    ("DPRO", "Direction de la Production"),
    ("DSCM", "Direction Supply Chain & Achats"),
    ("QHSE", "Direction QHSE"),
]


class SubscriptionPlan:
    DEMO = "DEMO"
    STANDARD = "STANDARD"
    PREMIUM = "PREMIUM"

    CHOICES = [
        (DEMO, "Démo"),
        (STANDARD, "Standard"),
        (PREMIUM, "Premium"),
    ]


# Services/limites inclus par formule. Consommé par le frontend pour activer
# ou griser certaines fonctionnalités (feature flags léger, pas de facturation).
PLAN_FEATURES = {
    SubscriptionPlan.DEMO: {
        "label": "Démo",
        "max_users": 10,
        "max_departments": 3,
        "cohesion_analysis": True,
        "id3a_matrix": True,
        "action_plans": False,
        "bulk_upload": False,
        "custom_skill_matrices": False,
        "data_export": False,
    },
    SubscriptionPlan.STANDARD: {
        "label": "Standard",
        "max_users": 100,
        "max_departments": 15,
        "cohesion_analysis": True,
        "id3a_matrix": True,
        "action_plans": True,
        "bulk_upload": True,
        "custom_skill_matrices": True,
        "data_export": False,
    },
    SubscriptionPlan.PREMIUM: {
        "label": "Premium",
        "max_users": None,  # illimité
        "max_departments": None,
        "cohesion_analysis": True,
        "id3a_matrix": True,
        "action_plans": True,
        "bulk_upload": True,
        "custom_skill_matrices": True,
        "data_export": True,
    },
}

DEFAULT_PASSWORD = "123456"
