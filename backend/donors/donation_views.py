from django.db.models import Count, Sum, Max
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from requests_app.views import HospitalRequestMixin, RequestPagination
from notifications_app.permissions import IsActiveDonor
from users.roles import get_account
from matching.screening_views import HospitalScreeningMixin, screening_data
from .models import DonationHistory
from .donation_serializers import DonationCompleteSerializer, FulfillSerializer, DonationHistorySerializer, HospitalDonationHistorySerializer
from .donation_services import complete_donation, fulfill_request, request_progress


class CompleteDonationView(HospitalScreeningMixin, APIView):
    def post(self, request, pk):
        match = self.own_match(pk)
        serializer = DonationCompleteSerializer(data=request.data); serializer.is_valid(raise_exception=True)
        match, _, created = complete_donation(match, serializer.validated_data)
        return Response(screening_data(match), status=201 if created else 200)


class FulfillRequestView(HospitalRequestMixin, APIView):
    def post(self, request, pk):
        emergency = self.own_request_or_404(pk)
        serializer = FulfillSerializer(data=request.data); serializer.is_valid(raise_exception=True)
        return Response(request_progress(fulfill_request(emergency)))


class RequestDonationProgressView(HospitalRequestMixin, APIView):
    def get(self, request, pk):
        return Response(request_progress(self.own_request_or_404(pk)))


class DonorDonationHistoryView(APIView):
    permission_classes = [IsActiveDonor]
    def get(self, request):
        rows = DonationHistory.objects.filter(donor=get_account(request.user)[1], status='COMPLETED',
            donation_date__lte=timezone.localdate()).select_related('hospital').order_by('-donation_date','-donation_id')
        summary = rows.aggregate(total_completed=Count('pk'), total_units=Sum('units_donated'), most_recent=Max('donation_date'))
        summary['total_units'] = summary['total_units'] or 0
        paginator = RequestPagination(); page = paginator.paginate_queryset(rows, request, view=self)
        response = paginator.get_paginated_response(DonationHistorySerializer(page, many=True).data)
        response.data['summary'] = summary
        return response


class HospitalDonationHistoryView(HospitalRequestMixin, APIView):
    def get(self, request):
        rows = DonationHistory.objects.filter(hospital=self.hospital()).select_related('hospital','donor').order_by('-donation_date','-donation_id')
        request_id = request.query_params.get('request_id')
        if request_id:
            if not request_id.isdigit() or int(request_id) <= 0:
                raise ValidationError({'request_id': 'Enter a positive emergency request ID.'})
            emergency = self.own_request_or_404(int(request_id))
            rows = rows.filter(emergency_request=emergency)
        paginator = RequestPagination(); page = paginator.paginate_queryset(rows, request, view=self)
        return paginator.get_paginated_response(HospitalDonationHistorySerializer(page, many=True).data)
