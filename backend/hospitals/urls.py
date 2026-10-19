from django.urls import path

from .views import HospitalMeView

urlpatterns = [path("me/", HospitalMeView.as_view(), name="me")]
