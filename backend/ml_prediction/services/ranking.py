"""Experimental lexicographic priority; no purported clinical combined score.

COMBINED: contact-rule candidates first; then 5-km geographic band; within a
band, scored donors first and descending propensity, followed by exact distance
and match ID. Unscored donors stay visible. History cannot become a candidate.
"""
from math import floor

RANKINGS = ('NEAREST', 'PROPENSITY', 'COMBINED')


def rank_predictions(rows, ranking):
    def distance(row):
        return row.get('_distance') if row.get('_distance') is not None else float('inf')

    def score(row):
        return -row['donation_probability'] if row['prediction_available'] else 0

    def key(row):
        tail = (distance(row), row['match_id'])
        if ranking == 'NEAREST':
            return tail
        if ranking == 'PROPENSITY':
            return (not row['eligible_for_contact'], not row['prediction_available'], score(row), *tail)
        d = distance(row)
        band = floor(d / 5) if d != float('inf') else float('inf')
        return (not row['eligible_for_contact'], band, not row['prediction_available'], score(row), *tail)

    return sorted(rows, key=key)
