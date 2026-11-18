"""URLs of the lab app (mounted under /api/v1/)."""

from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("lab-tests", views.LabTestViewSet, basename="lab-test")
router.register("lab-orders", views.LabOrderViewSet, basename="lab-order")

urlpatterns = router.urls
