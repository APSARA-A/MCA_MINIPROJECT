"""Explicit isolation required before inserting fictional demonstration records."""
from pathlib import Path
from django.conf import settings
from django.core.management.base import CommandError
from django.db import connection


def require_isolated_demo():
    name = str(connection.settings_dict['NAME'])
    if not settings.LIFELINK_DEMO_MODE or connection.vendor != 'sqlite':
        raise CommandError('Set LIFELINK_DEMO_MODE=true and use a separate SQLite demo database.')
    if Path(name).resolve() == (settings.BASE_DIR / 'db.sqlite3').resolve():
        raise CommandError('Demo data must never be written to the application db.sqlite3. Set LIFELINK_SQLITE_PATH to a separate demo file.')
