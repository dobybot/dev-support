---
type: "always_apply"
description: "Project structure and key principles for Django projects"
---

For django project, use the following coding style:

## Project Structure

```
project_root/
├── my_utils/                    # Shared utilities across all apps
│   ├── __init__.py
│   └── response_error.py        # Standardized error responses
├── django_app/
│   ├── __init__.py
│   ├── admin.py
│   ├── apps.py
│   ├── migrations/
│   ├── models.py
│   ├── urls.py
│   ├── tests/                   # Test files (split by feature)
│   │   ├── __init__.py
│   │   ├── test_xxx_views.py
│   │   └── test_xxx_api_views.py
│   ├── views/                   # Traditional Django views (if needed)
│   │   ├── __init__.py
│   │   └── xxx_views.py
│   ├── templates/               # Django templates (if needed)
│   │   └── django_app/
│   │       ├── base.html
│   │       └── xxx.html
│   ├── api_views/               # DRF API endpoints
│   │   ├── __init__.py
│   │   ├── filters.py           # Shared filters
│   │   ├── serializers.py       # Shared serializers
│   │   └── xxx_api_views.py     # One APIView per file
│   └── services/                # Business logic layer
│       ├── __init__.py
│       ├── schemas.py           # Pydantic models for type safety
│       └── xxx_services.py      # Service classes with business logic
└── manage.py
```

## Key Principles

1. **Separation of Concerns**: Business logic in services, HTTP handling in views
2. **One APIView per file**: Each API endpoint gets its own file for better organization
3. **Type Safety**: Use type hints everywhere (services, utilities, schemas)
4. **Shared Utilities**: Place cross-app utilities in `my_utils/` at project root
5. **Absolute Imports**: Use absolute imports for project-level modules (e.g., `from my_utils.response_error import ...`)
6. **Clean Up**: Remove unused files after refactoring (old views, tests, serializers)
7. **Small Try-Catch Blocks**: Keep try-catch blocks small and use custom exception classes for better error tracking
8. **Simple Queries in Views**: Use Django ORM directly in views for simple database queries - don't wrap them in service methods
9. **DRY with Authentication**: Use custom authentication classes to avoid duplicating header extraction and validation logic
