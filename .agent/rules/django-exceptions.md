---
type: "always_apply"
description: "Custom exceptions and error handling guidelines"
---

## Custom Exceptions

Create custom exception classes for better error tracking in Sentry and easier debugging.

### Benefits of Custom Exceptions

1. **Better error tracking** - Sentry can group errors by exception type
2. **Easier debugging** - Know exactly where the error originated
3. **Small try-catch blocks** - Catch specific exceptions at the API layer
4. **Clear error messages** - Custom exceptions can carry context
5. **Visible error handling** - When revisiting code, you can see where errors are handled

### Example: `services/exceptions.py`

```python
class GameServiceException(Exception):
    """Base exception for game service errors"""
    pass


class NoActiveCodeSetsError(GameServiceException):
    """Raised when no active code sets are available"""
    pass


class TeamLockedException(GameServiceException):
    """Raised when team is locked due to too many incorrect attempts"""
    def __init__(self, remaining_seconds: int):
        self.remaining_seconds = remaining_seconds
        super().__init__(f"Team is locked for {remaining_seconds} more seconds")


class InvalidCodeError(GameServiceException):
    """Raised when submitted code is invalid"""
    pass
```

### Example: Using Custom Exceptions in Services

```python
from .exceptions import NoActiveCodeSetsError, TeamLockedException

class GameService:
    @staticmethod
    def register_team(player1_name: str, player2_name: str = "", player3_name: str = "") -> TeamRegistrationResult:
        """Register a new team."""
        # Randomly select an active SecretCodeSet
        active_code_sets = SecretCodeSet.objects.filter(is_active=True)
        if not active_code_sets.exists():
            raise NoActiveCodeSetsError('No active code sets available')

        code_set = random.choice(active_code_sets)

        # Create Team record - no try-catch, let exceptions bubble up
        team = Team.objects.create(
            code_set=code_set,
            player1_name=player1_name,
            player2_name=player2_name,
            player3_name=player3_name
        )

        return TeamRegistrationResult(
            team_uuid=str(team.uuid),
            code_set_id=code_set.id
        )

    @staticmethod
    def submit_code(team: Team, submitted_code: str) -> CodeSubmissionResult:
        """Submit a code attempt."""
        # Check if team is locked (small, specific check)
        if team.is_locked:
            remaining = (team.locked_until - timezone.now()).total_seconds()
            raise TeamLockedException(int(remaining))

        # Rest of the logic - no try-catch
        is_correct = (submitted_code == team.code_set.secret_code)
        # ... more logic
```

### Example: Handling Custom Exceptions in API Views

**Handle exceptions at the API layer** - This makes it clear where errors are caught when revisiting code.

```python
from ..services.exceptions import NoActiveCodeSetsError, TeamLockedException
from my_utils.response_error import response_error

class RegisterTeamAPIView(APIView):
    def post(self, request):
        """Register a new team."""
        # Validate request
        validator = RegisterTeamValidator(data=request.data)
        if not validator.is_valid():
            return response_validation_error(validator.errors)

        # Call service with small try-catch block
        try:
            result = GameService.register_team(
                player1_name=validator.validated_data['player1_name'],
                player2_name=validator.validated_data.get('player2_name', ''),
                player3_name=validator.validated_data.get('player3_name', '')
            )
        except NoActiveCodeSetsError:
            return response_error(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                'NO_ACTIVE_CODE_SETS',
                'No active code sets available'
            )

        # Serialize response
        response_serializer = RegisterTeamResponseSerializer({
            'team_uuid': result.team_uuid,
            'code_set_id': result.code_set_id
        })

        return Response(response_serializer.data, status=status.HTTP_201_CREATED)
```

### Best Practices

1. **Keep try-catch blocks small** - Only wrap the specific line that might fail
2. **Use custom exceptions** - Create specific exception classes for different error types
3. **Let exceptions bubble up** - Don't catch exceptions in services unless you need to add context
4. **Handle at the API layer** - Catch exceptions in API views where they're visible when revisiting code
5. **Add context to exceptions** - Include relevant data (e.g., `remaining_seconds` in `TeamLockedException`)
6. **Group related exceptions** - Use base exception class (e.g., `GameServiceException`) for easier catching
7. **No global exception handlers** - Handle errors explicitly at the API layer for better code visibility
