"""Preliminary red-cell ABO/RhD compatibility; hospital crossmatching is required."""
COMPATIBILITY = {
    'O-': ('O-',), 'O+': ('O-', 'O+'),
    'A-': ('A-', 'O-'), 'A+': ('A-', 'A+', 'O-', 'O+'),
    'B-': ('B-', 'O-'), 'B+': ('B-', 'B+', 'O-', 'O+'),
    'AB-': ('AB-', 'A-', 'B-', 'O-'),
    'AB+': ('O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'),
}


def get_compatible_donor_groups(recipient_blood_group):
    if recipient_blood_group not in COMPATIBILITY:
        raise ValueError('Unknown recipient blood group.')
    return list(COMPATIBILITY[recipient_blood_group])


def is_blood_compatible(donor_blood_group, recipient_blood_group):
    if donor_blood_group not in COMPATIBILITY:
        raise ValueError('Unknown donor blood group.')
    return donor_blood_group in get_compatible_donor_groups(recipient_blood_group)
