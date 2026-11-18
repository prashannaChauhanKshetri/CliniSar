"""URLs of the pharmacy app (mounted under /api/v1/)."""

from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("medicines", views.MedicineViewSet, basename="medicine")
router.register("batches", views.BatchViewSet, basename="batch")

urlpatterns = router.urls
