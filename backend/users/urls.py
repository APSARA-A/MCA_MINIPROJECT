from django.urls import path

from .views import DonorRegisterView, HospitalRegisterView, LoginView, MeView, AccountTokenRefreshView

urlpatterns = [
    path("register/donor/", DonorRegisterView.as_view(), name="register-donor"),
    path("register/hospital/", HospitalRegisterView.as_view(), name="register-hospital"),
    path("login/", LoginView.as_view(), name="login"),
    path("me/", MeView.as_view(), name="me"),
    path("token/refresh/", AccountTokenRefreshView.as_view(), name="token-refresh"),
]
