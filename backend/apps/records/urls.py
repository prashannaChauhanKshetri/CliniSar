"""URLs of the records app (mounted under /api/v1/)."""

from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("prescriptions", views.PrescriptionViewSet, basename="prescription")
router.register("documents", views.DocumentViewSet, basename="document")

urlpatterns = router.urls
