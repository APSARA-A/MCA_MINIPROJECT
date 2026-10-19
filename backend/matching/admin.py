from django.contrib import admin

from .models import DonorRequestMatch, MedicalScreening


@admin.register(DonorRequestMatch)
class DonorRequestMatchAdmin(admin.ModelAdmin):
    list_display = (
        "match_id",
        "emergency_request",
        "donor",
        "distance_km",
        "system_eligible",
        "notification_status",
        "donor_response",
        "match_status",
    )
    list_filter = ("match_status", "donor_response")
    list_select_related = ("emergency_request", "donor")
    search_fields = ("donor__full_name", "donor__email")
    autocomplete_fields = ("emergency_request", "donor")
    readonly_fields = ("created_at",)


@admin.register(MedicalScreening)
class MedicalScreeningAdmin(admin.ModelAdmin):
    list_display = (
        "screening_id",
        "match",
        "donor",
        "hospital",
        "screening_date",
        "screening_status",
    )
    list_filter = ("screening_status",)
    list_select_related = ("match", "donor", "hospital")
    search_fields = ("donor__full_name", "hospital__hospital_name")
    autocomplete_fields = ("match", "donor", "hospital")
    readonly_fields = ("created_at",)
