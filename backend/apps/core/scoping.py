"""Portée hiérarchique d'un encadrant.

Une direction est composée de services (`Department.parent`). Un directeur
encadre donc les membres de sa direction **et** ceux de ses services, tandis
qu'un chef de service n'encadre que le sien. Toutes les vues qui bornaient leur
requête à `department__manager=user` doivent passer par ici : dupliquer la
règle, c'est prendre le risque qu'un module l'applique et pas un autre — au
mieux un directeur qui ne voit plus la moitié de sa direction, au pire une
fuite de portée.
"""
from apps.core.models import Department


def managed_department_ids(user) -> list[int]:
    """Départements encadrés par `user` : ceux dont il est le manager, plus les
    services qui en dépendent. Une seule requête, la profondeur étant limitée à
    un niveau par construction."""
    own = list(Department.objects.filter(manager=user).values_list("id", flat=True))
    if not own:
        return []
    services = list(
        Department.objects.filter(parent_id__in=own).values_list("id", flat=True)
    )
    return own + services


def manages_department(user, department) -> bool:
    """Vrai si `user` encadre ce département — directement, ou parce qu'il
    dirige la direction dont ce service dépend."""
    if department is None:
        return False
    if department.manager_id == user.id:
        return True
    parent_id = department.parent_id
    if parent_id is None:
        return False
    return Department.objects.filter(pk=parent_id, manager=user).exists()


def manages_user(actor, target) -> bool:
    """Vrai si `actor` encadre `target` par son département de rattachement."""
    if target.department_id is None:
        return False
    return target.department_id in managed_department_ids(actor)
