---
type: "always_apply"
description: "Standardized error response guidelines"
---

## Error Response

### Location: `my_utils/response_error.py`

The utils file should be placed in `my_utils/response_error.py` at the **project root** (`my_utils` is a module that I will bring across projects).

**Import using absolute imports:**

```python
from my_utils.response_error import response_error, response_validation_error
```

We use helper functions to make response_error the same format for all projects:

- `code` is unique error code for each error, this will help frontend to show proper error message (using i18n to translate) and handle the error properly
- `message` is the error message for developer to understand the error
- `detail` is the error detail (optional)

### Example: `my_utils/response_error.py`

```python
from rest_framework.response import Response


def response_error(
    status_code: int,
    err_code: str,
    err_message: str,
    err_detail=None
):
    """
    Create a standardized error response.

    Parameters
    ----------
    status_code : int
        HTTP status code
    err_code : str
        Unique error code for frontend handling
    err_message : str
        Error message for developers
    err_detail : any, optional
        Additional error details

    Returns
    -------
    Response
        DRF Response object with error data
    """
    return Response({
        'code': err_code,
        'message': err_message,
        'detail': err_detail,
    }, status=status_code)


def response_validation_error(err_detail):
    """
    Create a validation error response.

    Parameters
    ----------
    err_detail : any
        Validation error details (usually from serializer.errors)

    Returns
    -------
    Response
        DRF Response object with validation error
    """
    return response_error(
        400,
        'INVALID_REQUEST_DATA',
        'The request body is invalid',
        err_detail
    )
```

### Common Error Codes

- `INVALID_REQUEST_DATA` - Validation errors
- `MISSING_TEAM_UUID` - Missing required header/parameter
- `TEAM_NOT_FOUND` - Resource not found
- `UNAUTHORIZED` - Authentication required
- `FORBIDDEN` - Permission denied
