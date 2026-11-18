"""URLs of the billing app (mounted under /api/v1/)."""

from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("invoices", views.InvoiceViewSet, basename="invoice")

urlpatterns = router.urls
