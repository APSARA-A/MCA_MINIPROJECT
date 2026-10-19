from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status as http
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from core.choices import BloodGroup
from users.roles import get_account

from . import workflow
from .models import EmergencyRequest
from .permissions import IsVerifiedHospital
from .serializers import (
    EmergencyRequestDetailSerializer,
    EmergencyRequestListSerializer,
    EmergencyRequestWriteSerializer,
)

Status = EmergencyRequest.Status


class RequestPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 50


class HospitalRequestMixin:
    """Every query is scoped to the signed-in hospital, so another hospital's
    request is simply not found (404) and never disclosed."""

    permission_classes = [IsVerifiedHospital]

    def hospital(self):
        return get_account(self.request.user)[1]

    def own_requests(self):
        return EmergencyRequest.objects.filter(hospital=self.hospital()).select_related("hospital")

    def own_request_or_404(self, pk):
        return get_object_or_404(self.own_requests(), pk=pk)


def conflict(message):
    return Response({"detail": message}, status=http.HTTP_409_CONFLICT)


class EmergencyRequestListCreateView(HospitalRequestMixin, APIView):
    FILTERS = {
        "status": Status.values,
        "urgency": EmergencyRequest.Urgency.values,
        "required_blood_group": BloodGroup.values,
    }

    def get(self, request):
        queryset = self.own_requests()
        filters = {}
        for field, allowed in self.FILTERS.items():
            value = request.query_params.get(field)
            if value:
                if value not in allowed:
                    raise ValidationError({field: [f"Choose one of: {', '.join(allowed)}."]})
                filters[field] = value
        queryset = queryset.filter(**filters).order_by("-created_at", "-request_id")

        paginator = RequestPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(EmergencyRequestListSerializer(page, many=True).data)

    def post(self, request):
        serializer = EmergencyRequestWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Ownership and the initial status come from the server, never the client.
        created = serializer.save(hospital=self.hospital(), status=Status.OPEN)
        return Response(EmergencyRequestDetailSerializer(created).data, status=http.HTTP_201_CREATED)


class EmergencyRequestDetailView(HospitalRequestMixin, APIView):
    def get(self, request, pk):
        return Response(EmergencyRequestDetailSerializer(self.own_request_or_404(pk)).data)

    def patch(self, request, pk):
        instance = self.own_request_or_404(pk)
        if not workflow.is_editable(instance):
            return conflict("Only open requests can be edited.")

        serializer = EmergencyRequestWriteSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        # Compare-and-swap: the UPDATE only applies while the row is still OPEN,
        # so a concurrent status change (matching, cancel) cannot be overwritten.
        with transaction.atomic():
            changed = EmergencyRequest.objects.filter(
                pk=instance.pk, hospital=instance.hospital, status__in=workflow.EDITABLE_STATUSES
            ).update(**serializer.validated_data, updated_at=timezone.now())
        if not changed:
            return conflict("This request is no longer open, so it cannot be edited.")

        return Response(EmergencyRequestDetailSerializer(self.own_request_or_404(pk)).data)


class EmergencyRequestCancelView(HospitalRequestMixin, APIView):
    def post(self, request, pk):
        instance = self.own_request_or_404(pk)

        with transaction.atomic():
            changed = EmergencyRequest.objects.filter(
                pk=instance.pk, hospital=instance.hospital, status__in=workflow.CANCELLABLE_STATUSES
            ).update(status=Status.CANCELLED, updated_at=timezone.now())

        current = self.own_request_or_404(pk)
        if changed or current.status == Status.CANCELLED:
            # Already-cancelled requests succeed too, so retries are safe.
            return Response(EmergencyRequestDetailSerializer(current).data)
        return conflict(f"A {current.get_status_display().lower()} request cannot be cancelled.")


class EmergencyRequestSummaryView(HospitalRequestMixin, APIView):
    """Real aggregates for the signed-in hospital, computed in one query."""

    def get(self, request):
        counts = EmergencyRequest.objects.filter(hospital=self.hospital()).aggregate(
            total_requests=Count("pk"),
            open_requests=Count("pk", filter=Q(status=Status.OPEN)),
            # Critical requests that are still active (cancelled or finished ones are excluded).
            critical_requests=Count(
                "pk",
                filter=Q(urgency=EmergencyRequest.Urgency.CRITICAL, status__in=workflow.ACTIVE_STATUSES),
            ),
        )
        return Response(counts)
