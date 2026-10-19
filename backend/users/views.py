from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.models import update_last_login
from django.db import IntegrityError
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from .roles import DONOR, HOSPITAL, get_account
from .serializers import (
    AccountTokenRefreshSerializer,
    DonorRegistrationSerializer,
    HospitalRegistrationSerializer,
    LoginSerializer,
    build_account_payload,
)
from .services import normalize_email

User = get_user_model()

INVALID_LOGIN = {"detail": "Invalid email or password."}
DUPLICATE_ACCOUNT = {"detail": "An account with these details already exists."}


class PublicAPIView(APIView):
    """No authentication or token is needed to reach these endpoints."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]  # rates set per view via throttle_scope


class DonorRegisterView(PublicAPIView):
    throttle_scope = "register"

    def post(self, request):
        serializer = DonorRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            donor = serializer.save()
        except IntegrityError:
            # Lost a race with a concurrent registration; nothing was saved.
            return Response(DUPLICATE_ACCOUNT, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {
                "message": "Registration successful. You can now sign in.",
                "user": {"id": donor.user_id, "email": donor.email, "role": DONOR},
                "profile": {
                    "full_name": donor.full_name,
                    "blood_group": donor.blood_group,
                },
            },
            status=status.HTTP_201_CREATED,
        )


class HospitalRegisterView(PublicAPIView):
    throttle_scope = "register"

    def post(self, request):
        serializer = HospitalRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            hospital = serializer.save()
        except IntegrityError:
            return Response(DUPLICATE_ACCOUNT, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {
                "message": (
                    "Registration received. You can sign in now; an administrator "
                    "must verify your hospital before you can raise requests."
                ),
                "user": {"id": hospital.user_id, "email": hospital.email, "role": HOSPITAL},
                "profile": {
                    "hospital_name": hospital.hospital_name,
                    "registration_number": hospital.registration_number,
                    "is_verified": hospital.is_verified,
                },
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(PublicAPIView):
    throttle_scope = "login"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = normalize_email(serializer.validated_data["email"])
        password = serializer.validated_data["password"]

        matches = list(User.objects.filter(email__iexact=email)[:2])
        user = None
        if len(matches) == 1:
            # Django's backend verifies the hash and rejects inactive users.
            user = authenticate(
                request, username=matches[0].get_username(), password=password
            )
        else:
            # Unknown or ambiguous email: spend comparable time, then fail generically.
            User().set_password(password)

        if user is None:
            return Response(INVALID_LOGIN, status=status.HTTP_401_UNAUTHORIZED)

        role, profile = get_account(user)
        if role is None:
            return Response(
                {"detail": "This account has no active LifeLink profile."},
                status=status.HTTP_403_FORBIDDEN,
            )

        update_last_login(None, user)
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "role": role,
                "user": build_account_payload(user, role, profile),
            }
        )


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role, profile = get_account(request.user)
        if role is None:
            return Response(
                {"detail": "This account has no active LifeLink profile."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(build_account_payload(request.user, role, profile))


class AccountTokenRefreshView(TokenRefreshView):
    serializer_class = AccountTokenRefreshSerializer
