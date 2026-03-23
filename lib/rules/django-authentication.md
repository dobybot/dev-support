---
type: "always_apply"
description: "Custom authentication guidelines"
---

## Custom Authentication

Use custom authentication classes to avoid duplicating header extraction and validation logic across multiple API views.

### Example: `authentication.py`

```python
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from .models import Team


class TeamUUIDAuthentication(BaseAuthentication):
    """
    Authentication that extracts team from X-Team-UUID header.
    Sets request.user to the Team instance.
    """
    def authenticate(self, request):
        """Authenticate request using X-Team-UUID header."""
        team_uuid = request.headers.get('X-Team-UUID')
        if not team_uuid:
            raise AuthenticationFailed({
                'code': 'MISSING_TEAM_UUID',
                'message': 'Missing X-Team-UUID header'
            })

        try:
            team = Team.objects.get(uuid=team_uuid)
        except Team.DoesNotExist:
            raise AuthenticationFailed({
                'code': 'TEAM_NOT_FOUND',
                'message': 'Team not found'
            })

        # Return (user, auth) - we use team as "user"
        return (team, None)
```

### Custom Exception Handler

Create a custom exception handler to format `AuthenticationFailed` exceptions properly:

**`core/exception_handler.py`:**

```python
from rest_framework.views import exception_handler as drf_exception_handler
from rest_framework.exceptions import AuthenticationFailed
from rest_framework import status
from my_utils.response_error import response_error


def custom_exception_handler(exc, context):
    """Custom exception handler for DRF that formats AuthenticationFailed exceptions."""
    if isinstance(exc, AuthenticationFailed):
        # Extract code and message from exception detail
        if isinstance(exc.detail, dict):
            error_code = exc.detail.get('code', 'AUTHENTICATION_FAILED')
            error_message = exc.detail.get('message', str(exc.detail))
        else:
            error_code = 'AUTHENTICATION_FAILED'
            error_message = str(exc.detail)

        # Determine status code based on error code
        if error_code == 'MISSING_TEAM_UUID':
            status_code = status.HTTP_400_BAD_REQUEST
        elif error_code == 'TEAM_NOT_FOUND':
            status_code = status.HTTP_404_NOT_FOUND
        else:
            status_code = status.HTTP_401_UNAUTHORIZED

        return response_error(status_code, error_code, error_message)

    # For all other exceptions, use default DRF handler
    return drf_exception_handler(exc, context)
```

**Register in `settings.py`:**

```python
REST_FRAMEWORK = {
    # ... other settings
    'EXCEPTION_HANDLER': 'core.exception_handler.custom_exception_handler',
}
```

### Usage in API Views

**Before (duplicated code):**

```python
class SubmitCodeAPIView(APIView):
    def post(self, request):
        # Get team UUID from header
        team_uuid = request.headers.get('X-Team-UUID')
        if not team_uuid:
            return response_error(
                status.HTTP_400_BAD_REQUEST,
                'MISSING_TEAM_UUID',
                'Missing X-Team-UUID header'
            )

        # Get team
        try:
            team = Team.objects.get(uuid=team_uuid)
        except Team.DoesNotExist:
            return response_error(
                status.HTTP_404_NOT_FOUND,
                'TEAM_NOT_FOUND',
                'Team not found'
            )

        # ... rest of logic
```

**After (clean with authentication):**

```python
from ..authentication import TeamUUIDAuthentication

class SubmitCodeAPIView(APIView):
    authentication_classes = [TeamUUIDAuthentication]

    def post(self, request):
        # Get team from authentication
        team = request.user

        # ... rest of logic
```

### Benefits

✅ **No duplication** - Header extraction logic in one place
✅ **Cleaner API views** - Just `team = request.user`
✅ **Consistent error handling** - All authentication errors formatted the same way
✅ **Declarative** - `authentication_classes = [TeamUUIDAuthentication]` is clear
✅ **Testable** - Easy to test authentication separately
✅ **Reusable** - Can create different authentication classes for different needs
