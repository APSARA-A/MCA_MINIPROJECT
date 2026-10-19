from django.urls import path
from .donation_views import CompleteDonationView, FulfillRequestView, RequestDonationProgressView, DonorDonationHistoryView, HospitalDonationHistoryView
urlpatterns = [
    path('matches/<int:pk>/complete/', CompleteDonationView.as_view()),
    path('requests/<int:pk>/fulfill/', FulfillRequestView.as_view()),
    path('requests/<int:pk>/progress/', RequestDonationProgressView.as_view()),
    path('donor/history/', DonorDonationHistoryView.as_view()),
    path('hospital/history/', HospitalDonationHistoryView.as_view()),
]
