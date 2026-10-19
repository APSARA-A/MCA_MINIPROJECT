from users.permissions import IsDonor, IsVerifiedHospital


class IsActiveDonor(IsDonor):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_active
                    and super().has_permission(request, view))


__all__ = ['IsActiveDonor', 'IsVerifiedHospital']
