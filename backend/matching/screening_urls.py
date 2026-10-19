from django.urls import path
from .screening_views import ScreeningDetailView, MarkArrivedView, StartScreeningView, ScreeningDecisionView, HospitalScreeningSummaryView, HospitalScreeningQueueView
urlpatterns = [
    path('matches/<int:pk>/', ScreeningDetailView.as_view()),
    path('matches/<int:pk>/mark-arrived/', MarkArrivedView.as_view()),
    path('matches/<int:pk>/start/', StartScreeningView.as_view()),
    path('matches/<int:pk>/decision/', ScreeningDecisionView.as_view()),
    path('hospital/summary/', HospitalScreeningSummaryView.as_view()),
    path('hospital/queue/', HospitalScreeningQueueView.as_view()),
]
