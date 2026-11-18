"""Small date helpers shared by the scheduling tests."""

import datetime

from django.utils import timezone


def next_date_for(weekday: int) -> datetime.date:
    """A date 7 to 13 days from today (Nepal time) that falls on the given weekday.

    Being at least a week ahead means no slot on it is ever "in the past".
    """
    today = timezone.localdate()
    days_ahead = 7 + (weekday - today.weekday()) % 7
    return today + datetime.timedelta(days=days_ahead)
