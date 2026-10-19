"""Emergency request status workflow.

Single source of truth for which transitions are allowed. Later iterations
(matching, notifications, donation recording) must consult these helpers so a
cancelled or finished request can never receive new matches.
"""
from .models import EmergencyRequest

Status = EmergencyRequest.Status

# A hospital may edit a request only before any matching work has started.
EDITABLE_STATUSES = frozenset({Status.OPEN})

# A hospital may cancel any request that is still active.
CANCELLABLE_STATUSES = frozenset({Status.OPEN, Status.MATCHING, Status.DONORS_CONTACTED})

# Statuses in which the matching engine (Iteration 6) may add donor matches.
MATCHABLE_STATUSES = frozenset({Status.OPEN, Status.MATCHING})

# Statuses that count as "still active" for dashboard summaries.
ACTIVE_STATUSES = frozenset({Status.OPEN, Status.MATCHING, Status.DONORS_CONTACTED})


def is_editable(emergency_request):
    return emergency_request.status in EDITABLE_STATUSES


def is_cancellable(emergency_request):
    return emergency_request.status in CANCELLABLE_STATUSES


def can_create_matches(emergency_request):
    """False for CANCELLED, FULFILLED and CLOSED requests."""
    return emergency_request.status in MATCHABLE_STATUSES
