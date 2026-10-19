from django.db import transaction
from django.db.models import Count, F, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from matching.models import DonorRequestMatch
from matching.services.compatibility import is_blood_compatible
from matching.services.eligibility import evaluate_donor_prescreening
from requests_app.models import EmergencyRequest
from requests_app.views import HospitalRequestMixin, conflict
from requests_app.workflow import ACTIVE_STATUSES
from users.roles import get_account
from .permissions import IsActiveDonor
from .serializers import DonorResponseSerializer, MatchResponseSerializer, RESPONDABLE_STATUSES
from .services.whatsapp import generate_whatsapp_link


def match_query():
    return DonorRequestMatch.objects.select_related('donor__user', 'emergency_request__hospital')


def reserve_active_request(emergency):
    # SQLite ignores select_for_update. Acquire a write reservation before rereading
    # match state; concurrent cancellation and response writes cannot be lost.
    return EmergencyRequest.objects.filter(pk=emergency.pk, status__in=ACTIVE_STATUSES).update(updated_at=F('updated_at'))


def contact_allowed(match):
    emergency, donor = match.emergency_request, match.donor
    try:
        compatible = is_blood_compatible(donor.blood_group, emergency.required_blood_group)
    except ValueError:
        compatible = False
    return (emergency.status in ACTIVE_STATUSES and match.system_eligible
            and match.match_status in {'IDENTIFIED', 'CONTACTED', 'AVAILABLE'}
            and compatible
            and evaluate_donor_prescreening(donor, timezone.localdate())['eligible_for_contact'])


class HospitalMatchMixin(HospitalRequestMixin):
    def own_match(self, pk):
        return get_object_or_404(match_query().filter(emergency_request__hospital=self.hospital()), pk=pk)


class WhatsAppLinkView(HospitalMatchMixin, APIView):
    def get(self, request, pk):
        match = self.own_match(pk)
        if not contact_allowed(match):
            return conflict('This match is not currently contactable. Review the donor and request status.')
        try:
            return Response(generate_whatsapp_link(match))
        except ValueError as exc:
            raise ValidationError({'detail': str(exc)}) from exc


class MarkContactedView(HospitalMatchMixin, APIView):
    def post(self, request, pk):
        match = self.own_match(pk)
        with transaction.atomic():
            if not reserve_active_request(match.emergency_request):
                return conflict('Contact confirmation is only allowed for active requests.')
            match = self.own_match(pk)
            if match.match_status == 'IDENTIFIED':
                if not contact_allowed(match):
                    return conflict('This match is not currently contactable. Review the donor and request status.')
                match.match_status = 'CONTACTED'
                match.save(update_fields=['match_status'])
                EmergencyRequest.objects.filter(pk=match.emergency_request_id, status__in=['OPEN', 'MATCHING']).update(
                    status='DONORS_CONTACTED', updated_at=timezone.now())
                match.emergency_request.refresh_from_db()
            # Retries and advanced stages return existing state without replacing it.
            return Response(MatchResponseSerializer(match).data)


class DonorRespondView(APIView):
    permission_classes = [IsActiveDonor]

    def own_match(self, pk):
        return get_object_or_404(match_query().filter(donor=get_account(self.request.user)[1]), pk=pk)

    def post(self, request, pk):
        serializer = DonorResponseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        match = self.own_match(pk)
        with transaction.atomic():
            if not reserve_active_request(match.emergency_request):
                return conflict('This blood request is no longer active.')
            match = self.own_match(pk)
            if match.match_status not in RESPONDABLE_STATUSES:
                return conflict('The match has progressed beyond availability responses.')
            response = serializer.validated_data['response']
            target = 'AVAILABLE' if response == 'AVAILABLE' else 'UNAVAILABLE'
            if match.donor_response != response or match.match_status != target:
                match.donor_response, match.match_status = response, target
                match.responded_at = timezone.now()
                match.save(update_fields=['donor_response', 'match_status', 'responded_at'])
            return Response(MatchResponseSerializer(match).data)


class DonorRequestsView(APIView):
    permission_classes = [IsActiveDonor]

    def get(self, request):
        rows = list(match_query().filter(donor=get_account(request.user)[1]).order_by('-created_at', '-match_id'))
        active = [m for m in rows if m.emergency_request.status in ACTIVE_STATUSES]
        history = [m for m in rows if m.emergency_request.status not in ACTIVE_STATUSES]
        return Response({'active_requests': MatchResponseSerializer(active, many=True).data,
                         'historical_requests': MatchResponseSerializer(history, many=True).data,
                         'pending_count': sum(m.donor_response == 'PENDING' and m.match_status in RESPONDABLE_STATUSES for m in active)})


class RequestResponsesView(HospitalRequestMixin, APIView):
    def get(self, request, pk):
        emergency = self.own_request_or_404(pk)
        rows = match_query().filter(emergency_request=emergency)
        counts = rows.aggregate(total_matched=Count('pk'),
            awaiting_response=Count('pk', filter=Q(donor_response='PENDING')),
            available=Count('pk', filter=Q(donor_response='AVAILABLE')),
            not_available=Count('pk', filter=Q(donor_response='NOT_AVAILABLE')),
            contacted=Count('pk', filter=Q(match_status='CONTACTED')))
        # The current schema has no contact-attempt timestamp. Count only known
        # contact workflow states; donor responses alone do not prove contact.
        details = []
        for match in rows.order_by('match_id'):
            details.append({**MatchResponseSerializer(match).data, 'donor_name': match.donor.full_name})
        return Response({'request_id': emergency.pk, 'request_status': emergency.status, **counts, 'matches': details,
                         'count_definitions': {'total_matched': 'All stored matches, including history.',
                         'awaiting_response': 'All matches whose donor_response is PENDING.',
                         'available': 'All matches whose donor_response is AVAILABLE; not medical approval.',
                         'not_available': 'All matches whose donor_response is NOT_AVAILABLE.',
                         'contacted': 'Matches currently at CONTACTED; later responses are not proof of contact.'}})
