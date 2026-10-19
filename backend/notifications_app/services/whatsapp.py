"""Manual click-to-chat only; a link is never evidence of contact or delivery."""
import re
from django.conf import settings
from urllib.parse import urlencode
import phonenumbers


def normalize_phone(value):
    raw = (value or '').strip()
    if not raw or not re.fullmatch(r'[+0-9 ()-]+', raw):
        raise ValueError('Provide a valid WhatsApp number in international format.')
    compact = re.sub(r'[ ()-]', '', raw)
    if compact.startswith('00'):
        compact = '+' + compact[2:]
    if not compact.startswith('+'):
        # Only unambiguous Indian mobiles may omit the international prefix.
        if re.fullmatch(r'[6-9][0-9]{9}', compact):
            compact = '+91' + compact
        elif re.fullmatch(r'91[6-9][0-9]{9}', compact):
            compact = '+' + compact
        else:
            raise ValueError('Use +country code for international numbers, or a valid 10-digit Indian mobile number.')
    try:
        number = phonenumbers.parse(compact, None)
    except phonenumbers.NumberParseException as exc:
        raise ValueError('The registered contact number is invalid.') from exc
    if number.extension or not phonenumbers.is_valid_number(number):
        raise ValueError('The registered contact number is invalid.')
    return phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164)[1:]


def generate_whatsapp_link(match):
    donor, emergency = match.donor, match.emergency_request
    # Fall back only when WhatsApp is blank, not when a supplied number is invalid.
    phone = normalize_phone(donor.whatsapp_number or donor.phone_number)
    hospital = emergency.hospital
    address = f'\nHospital address: {hospital.address}' if hospital.address.strip() else ''
    message = (
        'Hello,\n\nThis is an emergency blood donation request from LifeLink.\n\n'
        f'Hospital: {hospital.hospital_name}\nBlood Group Required: {emergency.required_blood_group}\n'
        f'Urgency: {emergency.urgency}\nRequest Reference: LL-{emergency.pk}{address}\n\n'
        'A patient requires blood donation assistance.\n\n'
        'If you are willing and potentially available, please log in to LifeLink to respond.\n\n'
        'Final eligibility will be confirmed by the hospital.\n\nThank you for helping save lives.'
    )
    return {'match_id': match.pk, 'whatsapp_url': f'https://wa.me/{phone}?{urlencode({"text": message})}', 'message': message, 'demo_only': settings.LIFELINK_DEMO_MODE}
