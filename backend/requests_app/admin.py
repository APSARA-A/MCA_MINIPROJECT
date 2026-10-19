from django.contrib import admin

from .models import EmergencyRequest


@admin.register(EmergencyRequest)
class EmergencyRequestAdmin(admin.ModelAdmin):
    list_display = (
        "request_id",
        "hospital",
        "required_blood_group",
        "urgency",
        "units_required",
        "status",
    )
    list_filter = ("status", "urgency", "required_blood_group")
    list_select_related = ("hospital",)
    search_fields = ("patient_reference", "hospital__hospital_name")
    autocomplete_fields = ("hospital",)
    readonly_fields = ("created_at", "updated_at")
