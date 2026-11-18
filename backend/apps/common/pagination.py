"""How every list endpoint splits its results into pages."""

from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """20 rows per page by default; a screen may ask for up to 100 with ?page_size=.

    Dropdowns (e.g. "choose a doctor") ask for more rows so short lists fit in one call.
    """

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100
