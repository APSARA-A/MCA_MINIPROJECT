"""Permissions for the emergency request API.

IsVerifiedHospital lives in users.permissions so every app shares one
definition; it is re-exported here for the requests_app views.
"""
from users.permissions import IsVerifiedHospital

__all__ = ["IsVerifiedHospital"]
