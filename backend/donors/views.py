from rest_framework.response import Response
from rest_framework.views import APIView

from users.permissions import IsDonor
from users.roles import get_account

from .serializers import DonorDetailSerializer, DonorProfileUpdateSerializer


class DonorMeView(APIView):
    """The signed-in donor's own profile.

    The donor is always derived from request.user. No id is accepted from the
    client, so another donor's profile can never be read or changed here.
    """

    permission_classes = [IsDonor]

    def get(self, request):
        _, donor = get_account(request.user)
        return Response(DonorDetailSerializer(donor).data)

    def patch(self, request):
        _, donor = get_account(request.user)
        serializer = DonorProfileUpdateSerializer(donor, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(DonorDetailSerializer(donor).data)
