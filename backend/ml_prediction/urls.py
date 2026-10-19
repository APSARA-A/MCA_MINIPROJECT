from django.urls import path
from .views import RequestPredictionsView

urlpatterns = [path('requests/<int:pk>/predictions/', RequestPredictionsView.as_view(), name='request-predictions')]
