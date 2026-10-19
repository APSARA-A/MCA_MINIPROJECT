"""Read-only SQLite integrity and LifeLink relationship audit; never corrects data."""
import json
import sqlite3
from pathlib import Path
from urllib.parse import quote
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db.migrations.loader import MigrationLoader

class Command(BaseCommand):
    help = 'Read-only SQLite audit. Reports counts and inconsistencies without patient or medical values.'

    def add_arguments(self, parser):
        parser.add_argument('--path', help='SQLite file to inspect; defaults to configured database.')

    def handle(self, *args, **options):
        path = Path(options['path'] or settings.DATABASES['default']['NAME']).resolve()
        if not path.is_file():
            raise CommandError('Database file does not exist. No file was created.')
        db = sqlite3.connect('file:'+quote(str(path))+'?mode=ro', uri=True)
        try:
            db.execute('PRAGMA query_only=ON')
            integrity = [row[0] for row in db.execute('PRAGMA integrity_check')]
            foreign_keys = list(db.execute('PRAGMA foreign_key_check'))
            tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            expected = {'donors_donor','hospitals_hospital','requests_app_emergencyrequest','matching_donorrequestmatch','matching_medicalscreening','donors_donationhistory','django_migrations'}
            missing=sorted(expected-tables)
            report={'integrity_check':integrity,'foreign_key_violation_count':len(foreign_keys),'missing_tables':missing,'read_only':True,'counts':{},'findings':{}}
            if not missing:
                report['counts']={table:db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0] for table in sorted(expected) if table!='django_migrations'}
                queries={
                    'duplicate_donor_request_pairs': 'SELECT COUNT(*) FROM (SELECT donor_id, emergency_request_id FROM matching_donorrequestmatch GROUP BY donor_id, emergency_request_id HAVING COUNT(*)>1)',
                    'screening_owner_mismatch': 'SELECT COUNT(*) FROM matching_medicalscreening s JOIN matching_donorrequestmatch m ON s.match_id=m.match_id JOIN requests_app_emergencyrequest r ON r.request_id=m.emergency_request_id WHERE s.donor_id!=m.donor_id OR s.hospital_id!=r.hospital_id',
                    'donation_request_hospital_mismatch': 'SELECT COUNT(*) FROM donors_donationhistory d JOIN requests_app_emergencyrequest r ON d.emergency_request_id=r.request_id WHERE d.hospital_id!=r.hospital_id',
                    'duplicate_linked_completed_events': "SELECT COUNT(*) FROM (SELECT donor_id,hospital_id,emergency_request_id FROM donors_donationhistory WHERE status='COMPLETED' AND emergency_request_id IS NOT NULL GROUP BY donor_id,hospital_id,emergency_request_id HAVING COUNT(*)>1)",
                    'invalid_donation_dates': 'SELECT COUNT(*) FROM donors_donationhistory WHERE date(donation_date) IS NULL',
                    'invalid_donation_units': 'SELECT COUNT(*) FROM donors_donationhistory WHERE units_donated<1',
                    'future_completed_donations': "SELECT COUNT(*) FROM donors_donationhistory WHERE status='COMPLETED' AND donation_date>?",
                    'donated_match_missing_completed_event': "SELECT COUNT(*) FROM matching_donorrequestmatch m JOIN requests_app_emergencyrequest r ON m.emergency_request_id=r.request_id WHERE m.match_status='DONATED' AND NOT EXISTS (SELECT 1 FROM donors_donationhistory d WHERE d.donor_id=m.donor_id AND d.hospital_id=r.hospital_id AND d.emergency_request_id=r.request_id AND d.status='COMPLETED')",
                    'screening_status_mismatch': "SELECT COUNT(*) FROM matching_medicalscreening s JOIN matching_donorrequestmatch m ON s.match_id=m.match_id WHERE (s.screening_status='APPROVED' AND m.match_status NOT IN ('APPROVED','DONATED','CANCELLED')) OR (s.screening_status='REJECTED' AND m.match_status NOT IN ('REJECTED','CANCELLED'))",
                }
                from django.utils import timezone
                for key,query in queries.items():
                    report['findings'][key]=db.execute(query,(str(timezone.localdate()),) if '?' in query else ()).fetchone()[0]
                from donors.models import DonationHistory
                from matching.models import DonorRequestMatch, MedicalScreening
                from requests_app.models import EmergencyRequest
                for model,field,values in [(DonationHistory,'status',DonationHistory.Status.values),(EmergencyRequest,'status',EmergencyRequest.Status.values),(MedicalScreening,'screening_status',MedicalScreening.ScreeningStatus.values),(DonorRequestMatch,'match_status',DonorRequestMatch.MatchStatus.values)]:
                    marks=','.join('?' for _ in values)
                    report['findings'][model.__name__+'_invalid_status']=db.execute(f'SELECT COUNT(*) FROM {model._meta.db_table} WHERE {field} NOT IN ({marks})',values).fetchone()[0]
                report['indexes']={table: [row[1] for row in db.execute(f'PRAGMA index_list({table})')] for table in sorted(expected) if table!='django_migrations'}
                applied=set(db.execute('SELECT app,name FROM django_migrations'))
                report['unapplied_migrations']=['.'.join(key) for key in sorted(set(MigrationLoader(None).disk_migrations)-applied)]
            report['status']='PASS' if integrity==['ok'] and not foreign_keys and not missing and not any(report['findings'].values()) and not report.get('unapplied_migrations') else 'REVIEW REQUIRED'
            self.stdout.write(json.dumps(report,sort_keys=True,indent=2))
        except sqlite3.DatabaseError as exc:
            raise CommandError('SQLite audit could not complete; the file requires manual review.') from exc
        finally:
            db.close()
