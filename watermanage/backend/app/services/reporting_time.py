from datetime import datetime, time, timezone
from zoneinfo import ZoneInfo

SHOP_TIMEZONE = ZoneInfo("Asia/Shanghai")


def start_of_day_utc(day):
    """Reports use shop calendar dates; database timestamps are stored in UTC."""
    return datetime.combine(day, time.min, tzinfo=SHOP_TIMEZONE).astimezone(timezone.utc).replace(tzinfo=None)
