from rest_framework.permissions import BasePermission

from .roles import ADMIN, DONOR, HOSPITAL, get_account


class HasRole(BasePermission):
    required_role = None

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        return get_account(user)[0] == self.required_role


class IsDonor(HasRole):
    required_role = DONOR


class IsHospital(HasRole):
    required_role = HOSPITAL


class IsAdminRole(HasRole):
    required_role = ADMIN


class IsVerifiedHospital(BasePermission):
    """Restricted hospital operations (emergency requests and later workflows).

    Requires, all checked on the server:
      * a valid JWT for an active Django user,
      * an active Hospital profile owned by that user,
      * Hospital.is_verified is True.
    Staff and superusers do NOT qualify; they use Django Admin. Unverified
    hospitals can still use /api/auth/me/ and /api/hospitals/me/.
    """

    default_message = "You do not have permission to perform this action."
    unverified_message = (
        "Your hospital must be verified by an administrator before it can manage emergency requests."
    )

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and user.is_active):
            return False
        role, hospital = get_account(user)  # role/profile resolved server-side
        if role != HOSPITAL or hospital is None or not hospital.is_active:
            self.message = self.default_message
            return False
        if not hospital.is_verified:
            self.message = self.unverified_message
            return False
        return True
