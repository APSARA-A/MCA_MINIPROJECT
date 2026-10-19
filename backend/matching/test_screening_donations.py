from datetime import timedelta
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from core.testing import make_hospital, make_donor, make_request, make_match, client_for
from matching.models import MedicalScreening, DonorRequestMatch
from donors.models import DonationHistory
from ml_prediction.services.features import extract_donor_features, with_donation_features
from ml_prediction.services.predictor import predict_donation_propensity


class ScreeningDonationTests(TestCase):
    def setUp(self):
        self.hospital=make_hospital(is_verified=True)
        self.emergency=make_request(hospital=self.hospital, units_required=2, status='DONORS_CONTACTED', latitude=0, longitude=0)
        self.donor=make_donor(latitude=0, longitude=0)
        self.match=make_match(request=self.emergency,donor=self.donor,match_status='AVAILABLE',donor_response='AVAILABLE',notification_status='PENDING',system_eligible=True)
        self.h=client_for(self.hospital.user);self.d=client_for(self.donor.user)
        self.screen=f'/api/screening/matches/{self.match.pk}/'
        self.complete=f'/api/donations/matches/{self.match.pk}/complete/'
        self.fulfill=f'/api/donations/requests/{self.emergency.pk}/fulfill/'
        self.payload={'donation_date':str(timezone.localdate()),'units_donated':1,'confirmed_completed':True,'blood_group':'O+'}

    def approve(self, **data):
        self.assertEqual(self.h.post(self.screen+'mark-arrived/').status_code,200)
        self.assertEqual(self.h.post(self.screen+'start/').status_code,200)
        return self.h.post(self.screen+'decision/', {'screening_status':'APPROVED','screened_by':'QA staff',**data},format='json')

    def test_arrival_requires_available_and_preserves_fields_idempotently(self):
        before=(self.match.donor_response,self.match.notification_status,self.match.responded_at)
        self.assertEqual(self.h.post(self.screen+'mark-arrived/').status_code,200)
        self.assertEqual(self.h.post(self.screen+'mark-arrived/').status_code,200)
        self.match.refresh_from_db();self.assertEqual(self.match.match_status,'ARRIVED')
        self.assertEqual((self.match.donor_response,self.match.notification_status,self.match.responded_at),before)
        self.assertFalse(MedicalScreening.objects.exists());self.assertFalse(DonationHistory.objects.exists())

    def test_invalid_arrival_transitions(self):
        for state in ('IDENTIFIED','CONTACTED','UNAVAILABLE','SCREENING','APPROVED','REJECTED','DONATED','CANCELLED'):
            self.match.match_status=state;self.match.save()
            self.assertEqual(self.h.post(self.screen+'mark-arrived/').status_code,409)
        self.match.match_status='AVAILABLE';self.match.donor_response='NOT_AVAILABLE';self.match.save()
        self.assertEqual(self.h.post(self.screen+'mark-arrived/').status_code,409)

    def test_start_requires_arrival_and_creates_one_pending_record(self):
        self.assertEqual(self.h.post(self.screen+'start/').status_code,409)
        self.h.post(self.screen+'mark-arrived/');self.h.post(self.screen+'start/')
        before=list(MedicalScreening.objects.values());self.h.post(self.screen+'start/')
        self.assertEqual(list(MedicalScreening.objects.values()),before)
        record=MedicalScreening.objects.get(match=self.match)
        self.assertEqual((record.donor_id,record.hospital_id,record.screening_status),(self.donor.pk,self.hospital.pk,'PENDING'))
        self.assertIsNone(record.hemoglobin);self.assertEqual(record.blood_pressure,'')
        self.match.refresh_from_db();self.assertEqual(self.match.match_status,'SCREENING')

    def test_missing_screening_get_is_readonly_envelope(self):
        response=self.h.get(self.screen)
        self.assertEqual(response.status_code,200);self.assertIsNone(response.data['screening'])
        self.assertTrue(response.data['actions']['can_mark_arrived'])
        self.assertEqual(MedicalScreening.objects.count(),0)

    def test_approve_records_supplied_measurements_without_automatic_decision(self):
        response=self.approve(hemoglobin=13.5,blood_pressure='120/80',pulse=76,temperature=36.8,weight=60,medical_notes='QA measurement')
        self.assertEqual(response.status_code,200)
        self.match.refresh_from_db();record=MedicalScreening.objects.get(match=self.match)
        self.assertEqual(self.match.match_status,'APPROVED');self.assertEqual(record.screening_status,'APPROVED')
        self.assertEqual(float(record.hemoglobin),13.5);self.assertEqual(record.medical_notes,'QA measurement')
        self.assertFalse(DonationHistory.objects.exists())

    def test_missing_measurements_remain_null(self):
        self.assertEqual(self.approve().status_code,200)
        record=MedicalScreening.objects.get(match=self.match)
        self.assertIsNone(record.hemoglobin);self.assertIsNone(record.weight);self.assertIsNone(record.pulse)

    def test_rejected_requires_reason_and_cannot_complete(self):
        self.h.post(self.screen+'mark-arrived/');self.h.post(self.screen+'start/')
        body={'screening_status':'REJECTED','screened_by':'QA staff'}
        self.assertEqual(self.h.post(self.screen+'decision/',body,format='json').status_code,400)
        body['rejection_reason']='Hospital decision'
        self.assertEqual(self.h.post(self.screen+'decision/',body,format='json').status_code,200)
        self.match.refresh_from_db();self.assertEqual(self.match.match_status,'REJECTED')
        self.assertEqual(self.h.post(self.complete,self.payload,format='json').status_code,409)
        self.assertFalse(DonationHistory.objects.exists())

    def test_finalized_screening_cannot_be_changed_or_restarted(self):
        self.approve();before=list(MedicalScreening.objects.values())
        self.assertEqual(self.h.post(self.screen+'decision/',{'screening_status':'REJECTED','screened_by':'QA','rejection_reason':'Changed'},format='json').status_code,409)
        self.assertEqual(self.h.post(self.screen+'start/').status_code,409)
        self.assertEqual(list(MedicalScreening.objects.values()),before)

    def test_screening_input_validation_and_protected_ownership(self):
        self.h.post(self.screen+'mark-arrived/');self.h.post(self.screen+'start/')
        base={'screening_status':'APPROVED','screened_by':'QA'}
        for field,value in [('hemoglobin',0),('hemoglobin','NaN'),('pulse',-1),('pulse',76.2),('pulse',True),('temperature',50),('weight',0),('blood_pressure','invalid'),('screened_by',''),('screening_status','PENDING'),('donor',999),('hospital',999),('screening_date','2020-01-01')]:
            with self.subTest(field=field,value=value):self.assertEqual(self.h.post(self.screen+'decision/',{**base,field:value},format='json').status_code,400)
        self.assertEqual(MedicalScreening.objects.get(match=self.match).screening_status,'PENDING')

    def test_hospital_permissions_all_screening_and_completion_endpoints(self):
        for client,code in ((APIClient(),401),(self.d,403),(client_for(make_hospital().user),403),(client_for(make_hospital(is_verified=True).user),404)):
            self.assertEqual(client.get(self.screen).status_code,code)
            for endpoint in ('mark-arrived/','start/','decision/'):
                self.assertEqual(client.post(self.screen+endpoint,{},format='json').status_code,code)
            self.assertEqual(client.post(self.complete,self.payload,format='json').status_code,code)
            self.assertEqual(client.post(self.fulfill,{'confirmed_fulfillment':True},format='json').status_code,code)

    def test_active_hospital_and_user_required(self):
        self.hospital.is_active=False;self.hospital.save()
        self.assertEqual(self.h.get(self.screen).status_code,403)
        self.hospital.is_active=True;self.hospital.save();self.hospital.user.is_active=False
        self.assertEqual(self.h.post(self.complete,self.payload,format='json').status_code,403)

    def test_real_jwt_access(self):
        client=APIClient();client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(self.hospital.user).access_token}')
        self.assertEqual(client.get(self.screen).status_code,200)

    def test_terminal_requests_block_all_new_work(self):
        self.approve()
        for state in ('CANCELLED','CLOSED','FULFILLED'):
            self.emergency.status=state;self.emergency.save()
            self.assertEqual(self.h.post(self.screen+'mark-arrived/').status_code,409)
            self.assertEqual(self.h.post(self.screen+'start/').status_code,409)
            self.assertEqual(self.h.post(self.complete,self.payload,format='json').status_code,409)
            self.assertFalse(self.h.get(self.screen).data['actions']['can_complete'])
        self.assertFalse(DonationHistory.objects.exists())

    def test_decision_on_cancelled_request_is_rejected(self):
        self.h.post(self.screen+'mark-arrived/');self.h.post(self.screen+'start/')
        self.emergency.status='CANCELLED';self.emergency.save()
        self.assertEqual(self.h.post(self.screen+'decision/',{'screening_status':'APPROVED','screened_by':'QA'},format='json').status_code,409)
        self.assertEqual(MedicalScreening.objects.get(match=self.match).screening_status,'PENDING')

    def test_completion_requires_both_approval_and_available_response(self):
        self.assertEqual(self.h.post(self.complete,self.payload,format='json').status_code,409)
        self.match.match_status='APPROVED';self.match.save()
        self.assertEqual(self.h.post(self.complete,self.payload,format='json').status_code,409)
        MedicalScreening.objects.create(match=self.match,donor=self.donor,hospital=self.hospital,screening_date=timezone.now(),screening_status='APPROVED')
        self.match.donor_response='NOT_AVAILABLE';self.match.save()
        self.assertEqual(self.h.post(self.complete,self.payload,format='json').status_code,409)

    def test_actual_completion_creates_linked_history_preserves_other_data(self):
        other=make_match(request=self.emergency)
        self.approve();screen_before=list(MedicalScreening.objects.values())
        response=self.h.post(self.complete,self.payload,format='json');self.assertEqual(response.status_code,201)
        record=DonationHistory.objects.get()
        self.assertEqual((record.donor_id,record.hospital_id,record.emergency_request_id,record.status,record.units_donated),(self.donor.pk,self.hospital.pk,self.emergency.pk,'COMPLETED',1))
        self.match.refresh_from_db();other.refresh_from_db();self.emergency.refresh_from_db()
        self.assertEqual((self.match.match_status,self.match.donor_response,self.match.notification_status),('DONATED','AVAILABLE','PENDING'))
        self.assertEqual(other.match_status,'IDENTIFIED');self.assertEqual(self.emergency.status,'DONORS_CONTACTED')
        self.assertEqual(list(MedicalScreening.objects.values()),screen_before)
        self.assertEqual(response.data['request']['completed_units'],1);self.assertEqual(response.data['request']['remaining_units'],1)

    def test_repeated_completion_no_duplicate_or_changed_history(self):
        self.approve();self.h.post(self.complete,self.payload,format='json');before=list(DonationHistory.objects.values())
        self.assertEqual(self.h.post(self.complete,self.payload,format='json').status_code,200)
        self.assertEqual(list(DonationHistory.objects.values()),before)
        self.assertEqual(self.h.post(self.complete,{**self.payload,'units_donated':2},format='json').status_code,409)

    def test_completion_requires_explicit_true_confirmation(self):
        self.approve()
        for value in (False,'true',1,None):
            self.assertEqual(self.h.post(self.complete,{**self.payload,'confirmed_completed':value},format='json').status_code,400)
        body={k:v for k,v in self.payload.items() if k!='confirmed_completed'}
        self.assertEqual(self.h.post(self.complete,body,format='json').status_code,400)
        self.assertFalse(DonationHistory.objects.exists())

    def test_donation_input_validation(self):
        self.approve()
        for field,value in [('units_donated',0),('units_donated',-1),('units_donated',1.5),('units_donated',True),('units_donated',51),('donation_date','bad'),('donation_date',str(timezone.localdate()+timedelta(days=1))),('donor_id',999),('status','COMPLETED')]:
            with self.subTest(field=field):self.assertEqual(self.h.post(self.complete,{**self.payload,field:value},format='json').status_code,400)
        self.assertFalse(DonationHistory.objects.exists())

    def test_blood_group_and_screening_date_consistency(self):
        self.approve()
        self.assertEqual(self.h.post(self.complete,{**self.payload,'blood_group':'A+'},format='json').status_code,409)
        self.assertEqual(self.h.post(self.complete,{**self.payload,'donation_date':str(timezone.localdate()-timedelta(days=1))},format='json').status_code,409)

    def test_existing_and_ambiguous_history_rejected_not_duplicated(self):
        self.approve()
        record=DonationHistory.objects.create(donor=self.donor,hospital=self.hospital,emergency_request=self.emergency,donation_date=timezone.localdate(),blood_group='O+',units_donated=1,status='COMPLETED')
        self.assertEqual(self.h.post(self.complete,self.payload,format='json').status_code,409)
        record.pk=None;record.save()
        self.assertEqual(self.h.post(self.complete,self.payload,format='json').status_code,409)
        self.assertEqual(DonationHistory.objects.count(),2)

    def test_atomic_rollback_on_history_insert_failure(self):
        self.approve()
        with patch('donors.donation_services.DonationHistory.save',side_effect=RuntimeError('QA failure')):
            with self.assertRaises(RuntimeError):self.h.post(self.complete,self.payload,format='json')
        self.match.refresh_from_db();self.assertEqual(self.match.match_status,'APPROVED')
        self.assertFalse(DonationHistory.objects.exists())

    def test_fulfillment_requires_units_and_explicit_confirmation(self):
        self.assertEqual(self.h.post(self.fulfill,{'confirmed_fulfillment':True},format='json').status_code,409)
        self.approve();self.h.post(self.complete,self.payload,format='json')
        self.assertEqual(self.h.post(self.fulfill,{'confirmed_fulfillment':True},format='json').status_code,409)
        DonationHistory.objects.create(donor=make_donor(),hospital=self.hospital,emergency_request=self.emergency,donation_date=timezone.localdate(),blood_group='O+',units_donated=1,status='COMPLETED')
        self.assertEqual(self.h.post(self.fulfill,{},format='json').status_code,400)
        self.assertEqual(self.h.post(self.fulfill,{'confirmed_fulfillment':True},format='json').status_code,200)
        self.emergency.refresh_from_db();self.assertEqual(self.emergency.status,'FULFILLED')
        self.assertEqual(self.h.post(self.fulfill,{'confirmed_fulfillment':True},format='json').status_code,200)
        self.assertEqual(self.h.post(self.complete,self.payload,format='json').status_code,200)

    def test_cancelled_closed_fulfillment_denied_and_invalid_records_not_counted(self):
        for state in ('CANCELLED','CLOSED'):
            self.emergency.status=state;self.emergency.save()
            self.assertEqual(self.h.post(self.fulfill,{'confirmed_fulfillment':True},format='json').status_code,409)
        self.emergency.status='OPEN';self.emergency.save()
        for status,day in [('REJECTED',0),('CANCELLED',0),('COMPLETED',1)]:
            DonationHistory.objects.create(donor=self.donor,hospital=self.hospital,emergency_request=self.emergency,donation_date=timezone.localdate()+timedelta(days=day),blood_group='O+',units_donated=3,status=status)
        progress=self.h.get(f'/api/donations/requests/{self.emergency.pk}/progress/').data
        self.assertEqual(progress['completed_units'],0)

    def test_donor_history_scoped_completed_paginated_summary(self):
        self.approve();self.h.post(self.complete,self.payload,format='json')
        DonationHistory.objects.create(donor=make_donor(),hospital=self.hospital,donation_date=timezone.localdate(),blood_group='O+',status='COMPLETED')
        result=self.d.get('/api/donations/donor/history/?donor_id=999')
        self.assertEqual(result.status_code,200);self.assertEqual(result.data['count'],1)
        self.assertEqual((result.data['summary']['total_completed'],result.data['summary']['total_units']),(1,1))
        self.assertNotIn('medical_notes',str(result.data));self.assertNotIn('screened_by',str(result.data))
        self.assertEqual(self.h.get('/api/donations/donor/history/').status_code,403)

    def test_new_donor_empty_history_and_inactive_denied(self):
        result=self.d.get('/api/donations/donor/history/').data
        self.assertEqual(result['results'],[]);self.assertEqual(result['summary']['total_units'],0)
        self.assertIsNone(result['summary']['most_recent'])
        self.donor.is_active=False;self.donor.save();self.assertEqual(client_for(type(self.donor.user).objects.get(pk=self.donor.user.pk)).get('/api/donations/donor/history/').status_code,403)

    def test_hospital_history_scope_filters_and_roles(self):
        self.approve();self.h.post(self.complete,self.payload,format='json')
        other=make_hospital(is_verified=True);other_request=make_request(hospital=other)
        DonationHistory.objects.create(donor=make_donor(),hospital=other,emergency_request=other_request,donation_date=timezone.localdate(),blood_group='O+',status='COMPLETED')
        self.assertEqual(self.h.get('/api/donations/hospital/history/').data['count'],1)
        self.assertEqual(self.h.get('/api/donations/hospital/history/',{'request_id':self.emergency.pk}).data['count'],1)
        self.assertEqual(self.h.get('/api/donations/hospital/history/',{'request_id':other_request.pk}).status_code,404)
        self.assertEqual(self.h.get('/api/donations/hospital/history/',{'request_id':'bad'}).status_code,400)
        self.assertEqual(self.d.get('/api/donations/hospital/history/').status_code,403)

    def test_dashboard_counts_and_queue_owned_nonmedical(self):
        self.h.post(self.screen+'mark-arrived/');self.h.post(self.screen+'start/')
        summary=self.h.get('/api/screening/hospital/summary/').data
        self.assertEqual((summary['screening_pending'],summary['approved_donors'],summary['completed_donations']),(1,0,0))
        self.h.post(self.screen+'decision/',{'screening_status':'APPROVED','screened_by':'QA'},format='json')
        self.assertEqual(self.h.get('/api/screening/hospital/summary/').data['approved_donors'],1)
        self.h.post(self.complete,self.payload,format='json');summary=self.h.get('/api/screening/hospital/summary/').data
        self.assertEqual((summary['approved_donors'],summary['completed_donations']),(0,1))
        queue=self.h.get('/api/screening/hospital/queue/').data
        self.assertEqual(queue['count'],1);self.assertNotIn('medical_notes',str(queue))
        self.assertEqual(client_for(make_hospital(is_verified=True).user).get('/api/screening/hospital/queue/').data['count'],0)

    def test_screening_medical_details_not_in_other_apis(self):
        self.approve(medical_notes='CONFIDENTIAL-QA')
        self.assertIn('CONFIDENTIAL-QA',str(self.h.get(self.screen).data))
        for url in (f'/api/matching/requests/{self.emergency.pk}/',f'/api/ml/requests/{self.emergency.pk}/predictions/',f'/api/notifications/requests/{self.emergency.pk}/responses/', '/api/donations/hospital/history/'):
            self.assertNotIn('CONFIDENTIAL-QA',str(self.h.get(url).data))
        self.assertEqual(self.d.get(self.screen).status_code,403)

    def test_ml_history_features_refresh_after_completion(self):
        before=extract_donor_features(self.donor,timezone.localdate());self.assertFalse(before['features_available'])
        self.approve();self.h.post(self.complete,self.payload,format='json')
        fresh=with_donation_features(type(self.donor).objects.filter(pk=self.donor.pk),timezone.localdate()).get()
        features=extract_donor_features(fresh,timezone.localdate())['features']
        self.assertEqual(features,{'Recency':0,'Frequency':1,'Time':0})
        prediction=predict_donation_propensity(fresh,timezone.localdate())
        self.assertTrue(prediction['prediction_available']);self.assertGreaterEqual(prediction['donation_probability'],0)
        self.assertEqual(DonationHistory.objects.count(),1)
