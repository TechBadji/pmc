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


SAFE_METHODS = ("GET", "HEAD", "OPTIONS")
PEER_PARAM = "peer_direction"


def peer_directions(user, rubrics=None):
    """Directions que le CEO a autorisé `user` (un directeur) à consulter en
    lecture seule — toutes rubriques confondues, ou l'une des `rubrics` données.
    Sans autorisation explicite, la liste est vide."""
    from apps.core.models import PeerAccess

    granted = [
        a.department_id
        for a in PeerAccess.objects.filter(viewer=user)
        if rubrics is None or set(a.rubrics) & set(rubrics)
    ]
    own = set(managed_department_ids(user))
    return Department.objects.filter(
        pk__in=granted, company_id=user.company_id, manager__role=user.Role.MANAGER
    ).exclude(id__in=own).select_related("manager")


def _peer_direction(request, rubrics=None):
    """Direction pair demandée (`?peer_direction=<id>`), si le lecteur est un
    directeur, que la requête est en lecture et que le CEO l'y autorise."""
    user = request.user
    raw = request.query_params.get(PEER_PARAM)
    if user.role != user.Role.MANAGER or request.method not in SAFE_METHODS or not raw or not str(raw).isdigit():
        return None
    return peer_directions(user, rubrics).filter(pk=int(raw)).first()


def viewing_peer(request, rubrics=None) -> bool:
    """Vrai quand la requête consulte une autre direction : la vue prend alors
    la place de la sienne (on ne mélange pas les deux équipes)."""
    return _peer_direction(request, rubrics) is not None


def readable_department_ids(request, rubrics=None) -> list[int]:
    """Périmètre de LECTURE d'un directeur : le sien, ou — s'il le demande
    (`?peer_direction=<id>`), en lecture seulement et avec l'accord du CEO pour
    la rubrique concernée — celui d'une autre direction, services compris. Les
    écritures restent bornées à `managed_department_ids` : consulter un pair ne
    donne aucun droit d'édition."""
    peer = _peer_direction(request, rubrics)
    if peer is None:
        return managed_department_ids(request.user)
    services = list(Department.objects.filter(parent_id=peer.id).values_list("id", flat=True))
    return [peer.id] + services
