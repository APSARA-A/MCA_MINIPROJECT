from rest_framework.response import Response
from rest_framework.views import APIView

from users.permissions import IsHospital
from users.roles import get_account

from .serializers import HospitalProfileSerializer, HospitalProfileUpdateSerializer


class HospitalMeView(APIView):
    """The signed-in hospital's own profile, including verification status.

    Editing never touches is_verified. Unverified hospitals may use this
    endpoint; restricted operations added later must use
    users.permissions.IsVerifiedHospital.
    """

    permission_classes = [IsHospital]

    def get(self, request):
        _, hospital = get_account(request.user)
        return Response(HospitalProfileSerializer(hospital).data)

    def patch(self, request):
        _, hospital = get_account(request.user)
        serializer = HospitalProfileUpdateSerializer(hospital, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(HospitalProfileSerializer(hospital).data)
