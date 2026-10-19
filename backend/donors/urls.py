from django.urls import path

from .views import DonorMeView

urlpatterns = [path("me/", DonorMeView.as_view(), name="me")]
