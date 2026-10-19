"""Server-side role resolution. Roles are never taken from client input."""
from donors.models import Donor
from hospitals.models import Hospital

ADMIN = "ADMIN"
DONOR = "DONOR"
HOSPITAL = "HOSPITAL"


def get_account(user):
    """Return (role, profile) for an authenticated user.

    ADMIN wins for staff and superusers. Donor and hospital roles require an
    active profile. Returns (None, None) when the user has no LifeLink role.
    The result is cached on the user object for the lifetime of the request.
    """
    cached = getattr(user, "_lifelink_account", None)
    if cached is not None:
        return cached

    if user.is_staff or user.is_superuser:
        result = (ADMIN, None)
    else:
        donor = Donor.objects.filter(user=user, is_active=True).first()
        if donor:
            result = (DONOR, donor)
        else:
            hospital = Hospital.objects.filter(user=user, is_active=True).first()
            result = (HOSPITAL, hospital) if hospital else (None, None)

    user._lifelink_account = result
    return result
