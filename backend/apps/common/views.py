"""TenantViewSet: the one place where tenant isolation is enforced for the API."""

from rest_framework.viewsets import ModelViewSet


class TenantViewSet(ModelViewSet):
    """Base for every clinic-owned endpoint: users only ever touch their own clinic's rows.

    The clinic always comes from the logged-in user, never from the request data.
    Because detail views look objects up inside this filtered queryset, asking for
    another clinic's object gives 404, exactly as if it did not exist.

    NP: Yo project ko sabai bhanda important class yar. Sabai clinic ko data eutai
        database ma huncha, tara yo class le har request ma "tero clinic ko matra"
        filter lagaucha. Clinic ko id client bata kahile pani linna, login bhako user
        bata matra. Arko clinic ko record magyo bhane 404 (403 haina, kina bhane 403
        le "yo id cha" bhanne kura leak garcha).
    """

    # Path from the model to its clinic. Models without their own clinic column
    # override it, e.g. DoctorProfile uses "user__clinic".
    tenant_field = "clinic"

    def get_queryset(self):
        """Return only the rows of the requester's clinic."""
        queryset = super().get_queryset()
        if getattr(self, "swagger_fake_view", False):
            # The API docs generator calls this without a logged-in user.
            return queryset.none()
        return queryset.filter(**{self.tenant_field: self.request.user.clinic})

    def perform_create(self, serializer) -> None:
        """Stamp the requester's clinic on every new row."""
        serializer.save(clinic=self.request.user.clinic)
