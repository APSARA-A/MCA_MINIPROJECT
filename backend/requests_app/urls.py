from django.urls import path

from .views import (
    EmergencyRequestCancelView,
    EmergencyRequestDetailView,
    EmergencyRequestListCreateView,
    EmergencyRequestSummaryView,
)

urlpatterns = [
    path("", EmergencyRequestListCreateView.as_view(), name="emergency-request-list"),
    path("summary/", EmergencyRequestSummaryView.as_view(), name="emergency-request-summary"),
    path("<int:pk>/", EmergencyRequestDetailView.as_view(), name="emergency-request-detail"),
    path("<int:pk>/cancel/", EmergencyRequestCancelView.as_view(), name="emergency-request-cancel"),
]
