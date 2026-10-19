from urllib.parse import parse_qs, urlparse
from django.test import TestCase, SimpleTestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from core.testing import make_donor, make_hospital, make_match, make_request, client_for
from matching.models import DonorRequestMatch
from donors.models import DonationHistory
from .services.whatsapp import normalize_phone, generate_whatsapp_link


class PhoneTests(SimpleTestCase):
    def test_indian_mobile_formats(self):
        for raw in ('9876543210', '91 9876543210', '+91-98765-43210', '0091 98765 43210'):
            self.assertEqual(normalize_phone(raw), '919876543210')

    def test_explicit_international_formats(self):
        self.assertEqual(normalize_phone('+1 (202) 555-0123'), '12025550123')
        self.assertEqual(normalize_phone('0044 20 7946 0018'), '442079460018')

    def test_invalid_or_ambiguous_numbers_rejected(self):
        for raw in ('', '123', '1234567890', '2025550123', '442079460018', '+000123456789', '9876543210 ext 1', '+91+9876543210', 'javascript:123', '9999999999999999'):
            with self.subTest(raw=raw), self.assertRaises(ValueError): normalize_phone(raw)


class NotificationAPITests(TestCase):
    def setUp(self):
        self.hospital = make_hospital(is_verified=True, hospital_name='City & Care', address='Street A, Kochi')
        self.emergency = make_request(hospital=self.hospital, latitude=0, longitude=0, urgency='CRITICAL', patient_reference='SECRET-PATIENT')
        self.donor = make_donor(latitude=0, longitude=0, whatsapp_number='+919876543210')
        self.match = make_match(request=self.emergency, donor=self.donor, system_eligible=True, distance_km=0)
        self.h = client_for(self.hospital.user); self.d = client_for(self.donor.user)
        self.base = f'/api/notifications/matches/{self.match.pk}/'
        self.summary = f'/api/notifications/requests/{self.emergency.pk}/responses/'

    def post_response(self, response='AVAILABLE', client=None):
        return (client or self.d).post(self.base+'respond/', {'response': response}, format='json')

    def test_link_message_encoding_privacy_and_read_only(self):
        before = list(DonorRequestMatch.objects.values()); updated = self.emergency.updated_at
        response = self.h.get(self.base+'whatsapp-link/')
        self.assertEqual(response.status_code, 200)
        link = urlparse(response.data['whatsapp_url'])
        self.assertEqual(link.netloc, 'wa.me'); self.assertEqual(link.path, '/919876543210')
        self.assertEqual(parse_qs(link.query)['text'][0], response.data['message'])
        for text in ('LifeLink', 'City & Care', 'O+', 'CRITICAL', f'LL-{self.emergency.pk}', 'Street A, Kochi', 'log in', 'Final eligibility'):
            self.assertIn(text, response.data['message'])
        self.assertNotIn('SECRET-PATIENT', str(response.data))
        self.assertNotIn(self.donor.email, str(response.data))
        self.h.get(self.base+'whatsapp-link/')
        self.assertEqual(list(DonorRequestMatch.objects.values()), before)
        self.emergency.refresh_from_db(); self.assertEqual(self.emergency.updated_at, updated)

    def test_blank_whatsapp_uses_phone(self):
        self.donor.whatsapp_number = ''; self.donor.phone_number = '9876543210'; self.donor.save()
        self.assertEqual(self.h.get(self.base+'whatsapp-link/').status_code, 200)

    def test_invalid_whatsapp_does_not_silently_fallback(self):
        self.donor.whatsapp_number = '123'; self.donor.save()
        self.assertEqual(self.h.get(self.base+'whatsapp-link/').status_code, 400)
        self.donor.whatsapp_number = ''; self.donor.phone_number = ''; self.donor.save()
        self.assertEqual(self.h.get(self.base+'whatsapp-link/').status_code, 400)

    def test_link_blocked_for_terminal_request_or_restricted_donor(self):
        for state in ('CANCELLED', 'FULFILLED', 'CLOSED'):
            self.emergency.status = state; self.emergency.save()
            self.assertEqual(self.h.get(self.base+'whatsapp-link/').status_code, 409)
        self.emergency.status = 'OPEN'; self.emergency.save()
        self.donor.medical_condition = 'Private condition'; self.donor.save()
        response = self.h.get(self.base+'whatsapp-link/')
        self.assertEqual(response.status_code, 409); self.assertNotIn('Private condition', str(response.data))

    def test_hospital_endpoints_roles_and_ownership(self):
        for client, code in ((APIClient(),401), (self.d,403), (client_for(make_hospital().user),403), (client_for(make_hospital(is_verified=True).user),404)):
            self.assertEqual(client.get(self.base+'whatsapp-link/').status_code, code)
            self.assertEqual(client.post(self.base+'mark-contacted/').status_code, code)
            self.assertEqual(client.get(self.summary).status_code, code)

    def test_hospital_and_user_must_be_active(self):
        self.hospital.is_active = False; self.hospital.save()
        self.assertEqual(self.h.get(self.base+'whatsapp-link/').status_code, 403)
        self.hospital.is_active = True; self.hospital.save()
        delattr(self.hospital.user, '_lifelink_account')
        self.hospital.user.is_active = False
        self.assertEqual(self.h.post(self.base+'mark-contacted/').status_code, 403)

    def test_real_jwt_access(self):
        client = APIClient(); client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(self.hospital.user).access_token}')
        self.assertEqual(client.get(self.base+'whatsapp-link/').status_code,200)
        donor = APIClient(); donor.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(self.donor.user).access_token}')
        self.assertEqual(self.post_response(client=donor).status_code,200)

    def test_confirm_contact_preserves_response_and_notification(self):
        self.match.donor_response = 'AVAILABLE'; self.match.notification_status = 'FAILED'; self.match.save()
        response = self.h.post(self.base+'mark-contacted/')
        self.assertEqual(response.status_code,200)
        self.match.refresh_from_db(); self.emergency.refresh_from_db()
        self.assertEqual((self.match.match_status,self.match.donor_response,self.match.notification_status), ('CONTACTED','AVAILABLE','FAILED'))
        self.assertIsNone(self.match.responded_at)
        self.assertEqual(self.emergency.status,'DONORS_CONTACTED')

    def test_confirmation_idempotent(self):
        self.h.post(self.base+'mark-contacted/')
        before = list(DonorRequestMatch.objects.values()); self.emergency.refresh_from_db(); updated=self.emergency.updated_at
        self.h.post(self.base+'mark-contacted/')
        self.assertEqual(list(DonorRequestMatch.objects.values()), before)
        self.emergency.refresh_from_db(); self.assertEqual(self.emergency.updated_at,updated)

    def test_all_advanced_contact_states_preserved(self):
        for state in ('AVAILABLE','UNAVAILABLE','ARRIVED','SCREENING','APPROVED','REJECTED','DONATED','CANCELLED'):
            self.match.match_status=state; self.match.donor_response='NOT_AVAILABLE'; self.match.notification_status='SENT'; self.match.save()
            response=self.h.post(self.base+'mark-contacted/')
            self.assertEqual(response.status_code,200)
            self.match.refresh_from_db(); self.emergency.refresh_from_db()
            self.assertEqual((self.match.match_status,self.match.donor_response,self.match.notification_status),(state,'NOT_AVAILABLE','SENT'))
            self.assertEqual(self.emergency.status,'OPEN')

    def test_confirm_terminal_request_rejected_without_writes(self):
        for state in ('CANCELLED','CLOSED','FULFILLED'):
            self.emergency.status=state;self.emergency.save()
            self.assertEqual(self.h.post(self.base+'mark-contacted/').status_code,409)
            self.match.refresh_from_db();self.assertEqual(self.match.match_status,'IDENTIFIED')

    def test_current_contact_rules_enforced(self):
        for field, value in (('is_active',False),('medical_condition','Needs review'),('blood_group','A-')):
            original=getattr(self.donor,field); setattr(self.donor,field,value);self.donor.save()
            self.assertEqual(self.h.post(self.base+'mark-contacted/').status_code,409)
            setattr(self.donor,field,original);self.donor.save()
        self.match.system_eligible=False;self.match.save()
        self.assertEqual(self.h.get(self.base+'whatsapp-link/').status_code,409)

    def test_available_response_and_change_not_available(self):
        self.match.notification_status='SENT';self.match.save()
        self.assertEqual(self.post_response().status_code,200)
        self.match.refresh_from_db(); timestamp=self.match.responded_at
        self.assertEqual((self.match.donor_response,self.match.match_status,self.match.notification_status),('AVAILABLE','AVAILABLE','SENT'))
        self.assertIsNotNone(timestamp)
        self.assertEqual(self.post_response('NOT_AVAILABLE').status_code,200)
        self.match.refresh_from_db();self.assertEqual((self.match.donor_response,self.match.match_status),('NOT_AVAILABLE','UNAVAILABLE'))
        self.assertGreaterEqual(self.match.responded_at,timestamp)
        self.assertEqual(self.post_response().status_code,200)

    def test_same_response_idempotent(self):
        self.post_response(); before=list(DonorRequestMatch.objects.values())
        self.post_response();self.assertEqual(list(DonorRequestMatch.objects.values()),before)

    def test_response_rejects_later_stages_even_identical(self):
        for state in ('ARRIVED','SCREENING','APPROVED','REJECTED','DONATED','CANCELLED'):
            self.match.match_status=state;self.match.donor_response='AVAILABLE';self.match.save()
            before=list(DonorRequestMatch.objects.values())
            self.assertEqual(self.post_response().status_code,409)
            self.assertEqual(list(DonorRequestMatch.objects.values()),before)

    def test_response_closed_requests_rejected(self):
        for state in ('CANCELLED','CLOSED','FULFILLED'):
            self.emergency.status=state;self.emergency.save()
            self.assertEqual(self.post_response().status_code,409)
        self.assertIsNone(DonorRequestMatch.objects.get(pk=self.match.pk).responded_at)

    def test_response_active_states_accepted(self):
        for state in ('OPEN','MATCHING','DONORS_CONTACTED'):
            self.emergency.status=state;self.emergency.save()
            self.assertEqual(self.post_response().status_code,200)

    def test_response_ownership_role_and_body_validation(self):
        self.assertEqual(self.post_response(client=client_for(make_donor().user)).status_code,404)
        self.assertEqual(self.post_response(client=self.h).status_code,403)
        self.assertEqual(self.post_response(client=APIClient()).status_code,401)
        for body in ({'response':'NO_RESPONSE'}, {'response':'AVAILABLE','donor_id':self.donor.pk}, {}, {'response':'DONATED'}):
            self.assertEqual(self.d.post(self.base+'respond/',body,format='json').status_code,400)

    def test_inactive_donor_or_user_cannot_respond(self):
        self.donor.is_active=False;self.donor.save()
        self.assertEqual(self.post_response().status_code,403)
        self.donor.is_active=True;self.donor.save();delattr(self.donor.user,'_lifelink_account')
        self.donor.user.is_active=False
        self.assertEqual(self.post_response().status_code,403)

    def test_donor_list_only_own_active_and_history_no_patient_data(self):
        make_match(donor=make_donor())
        historical=make_match(donor=self.donor,request=make_request(status='CANCELLED'))
        response=self.d.get('/api/notifications/donor/requests/')
        self.assertEqual(response.status_code,200)
        self.assertEqual([r['match_id'] for r in response.data['active_requests']],[self.match.pk])
        self.assertEqual([r['match_id'] for r in response.data['historical_requests']],[historical.pk])
        self.assertTrue(response.data['active_requests'][0]['can_respond'])
        self.assertFalse(response.data['historical_requests'][0]['can_respond'])
        self.assertEqual(response.data['pending_count'],1)
        self.assertNotIn('SECRET-PATIENT',str(response.data));self.assertNotIn('phone_number',str(response.data))
        self.assertEqual(self.h.get('/api/notifications/donor/requests/').status_code,403)

    def test_pending_count_excludes_advanced_and_history(self):
        self.match.match_status='ARRIVED';self.match.save()
        make_match(donor=self.donor,request=make_request(status='CLOSED'))
        self.assertEqual(self.d.get('/api/notifications/donor/requests/').data['pending_count'],0)

    def test_real_summary_counts_and_response_refresh(self):
        make_match(request=self.emergency,donor_response='AVAILABLE',match_status='AVAILABLE')
        make_match(request=self.emergency,donor_response='NOT_AVAILABLE',match_status='UNAVAILABLE')
        make_match(request=self.emergency,donor_response='NO_RESPONSE',match_status='CONTACTED')
        counts=self.h.get(self.summary).data
        self.assertEqual(tuple(counts[k] for k in ('total_matched','awaiting_response','available','not_available','contacted')),(4,1,1,1,1))
        self.h.post(self.base+'mark-contacted/');self.assertEqual(self.h.get(self.summary).data['contacted'],2)
        self.post_response();counts=self.h.get(self.summary).data
        self.assertEqual((counts['available'],counts['awaiting_response'],counts['contacted']),(2,0,1))
        self.assertEqual(len(counts['matches']),4)
        self.assertNotIn('SECRET-PATIENT',str(counts))

    def test_no_new_matches_histories_or_logs(self):
        from django.apps import apps
        before={model._meta.label: model.objects.count() for model in apps.get_models()}
        self.h.get(self.base+'whatsapp-link/');self.h.post(self.base+'mark-contacted/');self.post_response();self.post_response('NOT_AVAILABLE')
        self.assertEqual({model._meta.label: model.objects.count() for model in apps.get_models()},before)

    def test_wrong_methods_rejected(self):
        self.assertEqual(self.h.post(self.base+'whatsapp-link/').status_code,405)
        self.assertEqual(self.d.get(self.base+'respond/').status_code,405)
