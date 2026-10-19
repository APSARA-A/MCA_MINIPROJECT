from django.contrib import admin, messages

from .models import Hospital


@admin.register(Hospital)
class HospitalAdmin(admin.ModelAdmin):
    list_display = (
        "hospital_name",
        "registration_number",
        "is_verified",
        "is_active",
        "created_at",
    )
    list_filter = ("is_verified", "is_active")
    search_fields = ("hospital_name", "registration_number")
    readonly_fields = ("created_at", "updated_at")
    raw_id_fields = ("user",)
    actions = ["verify_hospitals", "unverify_hospitals"]

    @admin.action(description="Verify selected hospitals", permissions=["change"])
    def verify_hospitals(self, request, queryset):
        updated = queryset.filter(is_verified=False).update(is_verified=True)
        self.message_user(request, f"{updated} hospital(s) verified.", messages.SUCCESS)

    @admin.action(description="Remove verification from selected hospitals", permissions=["change"])
    def unverify_hospitals(self, request, queryset):
        updated = queryset.filter(is_verified=True).update(is_verified=False)
        self.message_user(request, f"{updated} hospital(s) set to unverified.", messages.SUCCESS)
