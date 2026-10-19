from django.urls import path
from .views import GenerateMatchesView, RequestMatchesView

urlpatterns = [
    path('requests/<int:pk>/generate/', GenerateMatchesView.as_view(), name='generate-matches'),
    path('requests/<int:pk>/', RequestMatchesView.as_view(), name='request-matches'),
]
