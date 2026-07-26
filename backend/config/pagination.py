from rest_framework.pagination import PageNumberPagination


class PMCPageNumberPagination(PageNumberPagination):
    """Pagination par défaut (50/page) mais surchargeable via ?page_size=,
    utile pour les listes complètes (équipe d'une entreprise, référentiels)
    que le frontend doit charger en une seule requête."""

    page_size_query_param = "page_size"
    max_page_size = 1000
