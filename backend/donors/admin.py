from django.contrib import admin

from .models import DonationHistory, Donor


@admin.register(Donor)
class DonorAdmin(admin.ModelAdmin):
    list_display = (
        "donor_id",
        "full_name",
        "blood_group",
        "phone_number",
        "is_active",
        "created_at",
    )
    list_filter = ("blood_group", "gender", "is_active")
    search_fields = ("full_name", "email", "phone_number")
    readonly_fields = ("created_at", "updated_at")
    raw_id_fields = ("user",)


@admin.register(DonationHistory)
class DonationHistoryAdmin(admin.ModelAdmin):
    list_display = ("donation_id", "donor", "hospital", "donation_date", "status")
    list_filter = ("status", "donation_date")
    list_select_related = ("donor", "hospital")
    search_fields = ("donor__full_name", "hospital__hospital_name")
    autocomplete_fields = ("donor", "hospital", "emergency_request")
    readonly_fields = ("created_at",)
