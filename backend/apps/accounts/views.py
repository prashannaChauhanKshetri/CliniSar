"""Authentication endpoints. The rules live in services.py; these views stay thin."""

from django.conf import settings
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .cookies import clear_refresh_cookie, set_refresh_cookie
from .serializers import (
    AccessTokenSerializer,
    ChangePasswordSerializer,
    LoginResponseSerializer,
    LoginSerializer,
    UserSerializer,
)
from .throttles import LoginRateThrottle


class LoginView(APIView):
    """POST auth/login/: check email and password, start a session."""

    # No token is needed (or looked at) to log in.
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    @extend_schema(request=LoginSerializer, responses=LoginResponseSerializer)
    def post(self, request) -> Response:
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = services.authenticate_user(**serializer.validated_data)
        access, refresh = services.issue_tokens(user)

        # The access token goes in the body; the refresh token only in the cookie.
        response = Response({"access": access, "user": UserSerializer(user).data})
        set_refresh_cookie(response, refresh)
        return response


class RefreshView(APIView):
    """POST auth/refresh/: use the refresh cookie to get a new access token."""

    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(request=None, responses=AccessTokenSerializer)
    def post(self, request) -> Response:
        old_refresh = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        try:
            access, new_refresh = services.rotate_tokens(old_refresh)
        except services.SessionError as error:
            # Also remove the useless cookie, so the browser stops sending it.
            response = Response({"detail": error.detail}, status=error.status_code)
            clear_refresh_cookie(response)
            return response

        response = Response({"access": access})
        set_refresh_cookie(response, new_refresh)
        return response


class LogoutView(APIView):
    """POST auth/logout/: blacklist the refresh token and remove the cookie."""

    # Works even when the access token has already expired.
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(request=None, responses={204: None})
    def post(self, request) -> Response:
        services.revoke_refresh_token(request.COOKIES.get(settings.REFRESH_COOKIE_NAME))
        response = Response(status=status.HTTP_204_NO_CONTENT)
        clear_refresh_cookie(response)
        return response


class ChangePasswordView(APIView):
    """POST auth/change-password/: set a new password after confirming the current one."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=ChangePasswordSerializer, responses={204: None})
    def post(self, request) -> Response:
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(generics.RetrieveUpdateAPIView):
    """GET, PATCH auth/me/: read or edit the logged-in user's own details."""

    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "patch"]

    def get_object(self):
        """Always the requester: there is no id in the URL to tamper with."""
        return self.request.user
