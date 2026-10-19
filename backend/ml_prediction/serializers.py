from rest_framework import serializers
from matching.serializers import RadiusSerializer
from .services.ranking import RANKINGS


class PredictionQuerySerializer(RadiusSerializer):
    ranking = serializers.ChoiceField(choices=RANKINGS, default='NEAREST')
