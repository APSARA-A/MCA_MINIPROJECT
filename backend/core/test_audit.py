import io
import json
import tempfile
from pathlib import Path
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase

class ReadOnlyAuditTests(SimpleTestCase):
    def test_empty_database_is_reported_without_changes(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'empty.sqlite3';path.touch();before=path.read_bytes()
            output=io.StringIO();call_command('audit_database',path=str(path),stdout=output)
            report=json.loads(output.getvalue())
            self.assertEqual(report['status'],'REVIEW REQUIRED')
            self.assertTrue(report['missing_tables']);self.assertEqual(path.read_bytes(),before)

    def test_missing_file_is_never_created(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'missing.sqlite3'
            with self.assertRaises(CommandError):call_command('audit_database',path=str(path),stdout=io.StringIO())
            self.assertFalse(path.exists())

    def test_corrupt_database_fails_without_repair(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'corrupt.sqlite3';path.write_bytes(b'not a sqlite database')
            with self.assertRaises(CommandError):call_command('audit_database',path=str(path),stdout=io.StringIO())
            self.assertEqual(path.read_bytes(),b'not a sqlite database')
