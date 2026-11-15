"""The store profile the UI needs to render its forms: the settings row plus the
allowed values for order fields and the categories actually in use."""
from backend import db
from backend.services.route_models import analytics, orders, products


def payload() -> dict:
    return {**db.get("settings", 1),
            "statuses": analytics.STATUSES,
            "channels": orders.CHANNELS,
            "payment_methods": orders.PAYMENTS,
            "categories": products.categories()}
