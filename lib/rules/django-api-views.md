---
type: "always_apply"
description: "API View guidelines"
---

## API View

Example `xxx_api_views.py`

We will put only 1 APIView class for each file, so that we could add openapi doc (drf-spectacular) later (if needed).

For ...Validator and ...ResponseSerializer, we prefer ModelSerializer if possible.

### Structure of API View File

Each API view file should contain:

1. **Imports** - Including absolute imports for `my_utils`
2. **Validator(s)** - For request validation (self-documenting)
3. **Response Serializer(s)** - For response structure (self-documenting)
4. **APIView class** - Single class per file with concise docstrings

### Docstring Guidelines for API Views

**Keep docstrings concise** - Don't duplicate information already clear from:

- Validator class fields (request body structure)
- ResponseSerializer class fields (response structure)
- Method signatures and type hints

**Focus on:**

- Business logic and purpose
- Special behaviors or side effects
- Required headers (if not obvious from code)
- Important notes or warnings

**Avoid:**

- Listing all request fields (already in Validator)
- Listing all response fields (already in ResponseSerializer)
- Repeating obvious information

### Example: `api_views/xxx_api_views.py`

```python
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, serializers

from ..services.game_services import XXXService
from ..services.schemas import XXXData
from my_utils.response_error import response_error, response_validation_error


class XXXValidator(serializers.Serializer):
    field1 = serializers.CharField(max_length=100)
    field2 = serializers.IntegerField(required=False)

    def validate_field1(self, value):
        """Custom validation for field1"""
        if not value.isdigit():
            raise serializers.ValidationError("Field must be numeric")
        return value


class XXXResponseSerializer(serializers.Serializer):
    result_field = serializers.CharField()
    count = serializers.IntegerField()


class XXXAPIView(APIView):
    """
    POST /api/xxx/
    Description of what this endpoint does (business logic, not field descriptions)
    Headers: X-Team-UUID (if needed)
    """

    def post(self, request):
        """Process XXX request."""
        # Validate request
        validator = XXXValidator(data=request.data)
        if not validator.is_valid():
            return response_validation_error(validator.errors)

        # Get required data from headers/params
        team_uuid = request.headers.get('X-Team-UUID')
        if not team_uuid:
            return response_error(
                status.HTTP_400_BAD_REQUEST,
                'MISSING_TEAM_UUID',
                'Missing X-Team-UUID header'
            )

        # Use service layer for business logic
        # Let exceptions bubble up to global exception handler
        data = XXXData(
            field1=validator.validated_data['field1'],
            field2=validator.validated_data.get('field2', 0)
        )
        result = XXXService.process_data(data)

        # Serialize response
        response_serializer = XXXResponseSerializer({
            'result_field': result.field,
            'count': result.count
        })

        return Response(response_serializer.data, status=status.HTTP_201_CREATED)
```

### Example with Filters (GET endpoint)

```python
from django_filters import rest_framework as filters

class XXXFilters(filters.FilterSet):
    """Filters for XXX list"""
    start_date = filters.DateFilter(field_name='created_at', lookup_expr='gte')
    end_date = filters.DateFilter(field_name='created_at', lookup_expr='lte')

    class Meta:
        model = YourModel
        fields = ['start_date', 'end_date']


class XXXListAPIView(APIView):
    """GET /api/xxx/ - List XXX items with filters"""

    def get(self, request):
        """Get filtered list of XXX items."""
        # Apply filters
        filterset = XXXFilters(request.GET, queryset=YourModel.objects.all())

        if not filterset.is_valid():
            return response_validation_error(filterset.errors)

        # Get filtered data
        data = filterset.qs

        # Serialize response
        serializer = XXXResponseSerializer(data, many=True)

        return Response(serializer.data, status=status.HTTP_200_OK)
```

### Using Shared Serializers

For serializers used across multiple API views, place them in `api_views/serializers.py`:

```python
# api_views/serializers.py
from rest_framework import serializers
from ..models import Team

class TeamStatusSerializer(serializers.ModelSerializer):
    """Serializer for team status response"""
    has_won = serializers.BooleanField(read_only=True)
    collected_clues_count = serializers.SerializerMethodField()

    class Meta:
        model = Team
        fields = ['has_won', 'collected_clues_count']

    def get_collected_clues_count(self, obj):
        return obj.collected_clues.count()
```

Then import in your API view:

```python
from .serializers import TeamStatusSerializer
```
