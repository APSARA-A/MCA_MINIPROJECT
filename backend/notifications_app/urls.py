from django.urls import path
from .views import WhatsAppLinkView, MarkContactedView, DonorRespondView, DonorRequestsView, RequestResponsesView

urlpatterns = [
    path('matches/<int:pk>/whatsapp-link/', WhatsAppLinkView.as_view(), name='whatsapp-link'),
    path('matches/<int:pk>/mark-contacted/', MarkContactedView.as_view(), name='mark-contacted'),
    path('matches/<int:pk>/respond/', DonorRespondView.as_view(), name='donor-respond'),
    path('donor/requests/', DonorRequestsView.as_view(), name='donor-requests'),
    path('requests/<int:pk>/responses/', RequestResponsesView.as_view(), name='request-responses'),
]
