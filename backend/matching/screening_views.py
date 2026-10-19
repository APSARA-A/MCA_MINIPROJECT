from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from requests_app.views import HospitalRequestMixin, RequestPagination
from donors.models import DonationHistory
from donors.donation_services import donation_for_match, request_progress
from donors.donation_serializers import DonationHistorySerializer

from .models import DonorRequestMatch, MedicalScreening
from .screening_services import (
    mark_arrived,
    start_screening,
    decide_screening,
    WorkflowConflict,
)
from .screening_serializers import (
    ScreeningDecisionSerializer,
    ScreeningRecordSerializer,
)


class HospitalScreeningMixin(HospitalRequestMixin):
    def own_match(self, pk):
        queryset = DonorRequestMatch.objects.select_related(
            'donor',
            'emergency_request__hospital',
        ).filter(
            emergency_request__hospital=self.hospital(),
        )
        return get_object_or_404(queryset, pk=pk)


def screening_data(match):
    record = MedicalScreening.objects.filter(match=match).first()

    if record and (
        record.donor_id != match.donor_id
        or record.hospital_id != match.emergency_request.hospital_id
    ):
        raise WorkflowConflict(
            "Screening ownership is inconsistent; hospital review is required."
        )

    donation = donation_for_match(match)

    active = match.emergency_request.status in (
        'OPEN',
        'MATCHING',
        'DONORS_CONTACTED',
    )
    available = match.donor_response == 'AVAILABLE'

    return {
        'match_id': match.pk,
        'donor_name': match.donor.full_name,
        'blood_group': match.donor.blood_group,
        'hospital_name': match.emergency_request.hospital.hospital_name,
        'match_status': match.match_status,
        'donor_response': match.donor_response,
        'notification_status': match.notification_status,
        'screening': ScreeningRecordSerializer(record).data if record else None,
        'donation': DonationHistorySerializer(donation).data if donation else None,
        'request': request_progress(match.emergency_request),
        'actions': {
            'can_mark_arrived': (
                active
                and available
                and match.match_status == 'AVAILABLE'
            ),
            'can_start_screening': (
                active
                and available
                and match.match_status == 'ARRIVED'
                and (not record or record.screening_status == 'PENDING')
            ),
            'can_decide': (
                active
                and available
                and match.match_status == 'SCREENING'
                and bool(record and record.screening_status == 'PENDING')
            ),
            'can_complete': (
                active
                and available
                and match.match_status == 'APPROVED'
                and bool(record and record.screening_status == 'APPROVED')
                and not donation
            ),
        },
    }


class ScreeningDetailView(HospitalScreeningMixin, APIView):
    def get(self, request, pk):
        return Response(screening_data(self.own_match(pk)))


class MarkArrivedView(HospitalScreeningMixin, APIView):
    def post(self, request, pk):
        match = mark_arrived(self.own_match(pk))
        return Response(screening_data(match))


class StartScreeningView(HospitalScreeningMixin, APIView):
    def post(self, request, pk):
        match = start_screening(self.own_match(pk))
        return Response(screening_data(match))


class ScreeningDecisionView(HospitalScreeningMixin, APIView):
    def post(self, request, pk):
        match = self.own_match(pk)

        serializer = ScreeningDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        match = decide_screening(match, serializer.validated_data)
        return Response(screening_data(match))


class HospitalScreeningSummaryView(HospitalRequestMixin, APIView):
    def get(self, request):
        hospital = self.hospital()
        active_statuses = ['OPEN', 'MATCHING', 'DONORS_CONTACTED']

        counts = MedicalScreening.objects.filter(
            hospital=hospital,
            match__emergency_request__hospital=hospital,
        ).aggregate(
            screening_pending=Count(
                'pk',
                filter=Q(
                    screening_status='PENDING',
                    match__match_status__in=['ARRIVED', 'SCREENING'],
                    match__emergency_request__status__in=active_statuses,
                ),
            ),
            approved_donors=Count(
                'pk',
                filter=Q(
                    screening_status='APPROVED',
                    match__match_status='APPROVED',
                    match__emergency_request__status__in=active_statuses,
                ),
            ),
        )

        counts['completed_donations'] = DonationHistory.objects.filter(
            hospital=hospital,
            status='COMPLETED',
            donation_date__lte=timezone.localdate(),
        ).count()

        return Response(counts)


class HospitalScreeningQueueView(HospitalRequestMixin, APIView):
    def get(self, request):
        rows = DonorRequestMatch.objects.filter(
            emergency_request__hospital=self.hospital(),
            match_status__in=[
                'AVAILABLE',
                'ARRIVED',
                'SCREENING',
                'APPROVED',
                'REJECTED',
                'DONATED',
            ],
        ).select_related(
            'donor',
            'emergency_request',
        ).order_by('-created_at', '-match_id')

        paginator = RequestPagination()
        page = paginator.paginate_queryset(rows, request, view=self)

        return paginator.get_paginated_response([
            {
                'match_id': row.pk,
                'request_id': row.emergency_request_id,
                'request_status': row.emergency_request.status,
                'donor_name': row.donor.full_name,
                'blood_group': row.donor.blood_group,
                'match_status': row.match_status,
            }
            for row in page
        ])