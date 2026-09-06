"""Public facade for dashboard overview and metadata search services."""

from app.services.dashboard_overview import build_dashboard
from app.services.dashboard_search import search_messages

__all__ = ["build_dashboard", "search_messages"]
