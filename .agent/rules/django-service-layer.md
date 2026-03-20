---
type: "always_apply"
description: "Business logic and service layer guidelines"
---

## Business Logic (Services Layer)

The business logic should be in the services layer. This helps us:

- Test logic easily without HTTP layer
- Reuse logic in different views, api views, tasks, commands, websockets, etc.
- Maintain clear separation of concerns

### Requirements for Service Methods

1. **Strong type annotations** with primitive types, Pydantic models, or Django models
2. **Numpy-style docstrings** for all methods
3. **Static methods** when possible (unless state is needed)
4. **Use primitive types for 2-3 parameters** - Only use Pydantic models for 4+ parameters or complex data structures

### Example: `services/schemas.py`

```python
from pydantic import BaseModel
from typing import Optional

class TeamRegistrationData(BaseModel):
    """Schema for team registration data"""
    player1_name: str
    player2_name: str = ""
    player3_name: str = ""

class TeamRegistrationResult(BaseModel):
    """Schema for team registration result"""
    team_uuid: str
    code_set_id: int
```

### Example: `services/xxx_services.py`

```python
from typing import List
from datetime import datetime
from pydantic import BaseModel

class XXXModel(BaseModel):
    field1: str
    field2: int

class XXXService:
    @staticmethod
    def get_data(start_date: datetime, end_date: datetime) -> List[XXXModel]:
        """
        Get data from start_date to end_date.

        Parameters
        ----------
        start_date : datetime
            Start date for data retrieval
        end_date : datetime
            End date for data retrieval

        Returns
        -------
        List[XXXModel]
            List of data matching the date range

        Raises
        ------
        ValueError
            If start_date is after end_date
        """
        if start_date > end_date:
            raise ValueError("start_date must be before end_date")

        # Your business logic here
        return ...

    @staticmethod
    def register_team(player1_name: str, player2_name: str = "", player3_name: str = "") -> TeamRegistrationResult:
        """
        Register a new team with 1-3 players.

        Use primitive types for simple parameters (2-3 params) instead of Pydantic models.
        This makes the code easier to read without jumping to other files.

        Parameters
        ----------
        player1_name : str
            Name of the first player (required)
        player2_name : str, optional
            Name of the second player (default: "")
        player3_name : str, optional
            Name of the third player (default: "")

        Returns
        -------
        TeamRegistrationResult
            Registration result with team UUID and code set ID

        Raises
        ------
        ValueError
            If no active code sets are available
        """
        # Your logic here
        return TeamRegistrationResult(team_uuid="...", code_set_id=1)
```

**When to use Pydantic models vs primitive types:**

- **2-3 simple parameters** → Use primitive types (str, int, bool, datetime, etc.)

  - Example: `register_team(player1: str, player2: str = "", player3: str = "")`
  - Easier to read, no need to jump to schemas.py

- **4+ parameters or complex data** → Use Pydantic models
  - Example: `create_order(order_data: OrderData)` where OrderData has 10+ fields
  - Better organization, validation, and type safety

**When to create service methods vs use Django ORM directly:**

- **Simple database queries** → Use Django ORM directly in views

  - Example: `Team.objects.get(uuid=team_uuid)` in API view
  - Don't wrap simple queries in service methods
  - Keeps service layer focused on real business logic

- **Complex business logic** → Create service methods
  - Example: `GameService.submit_code(team, code)` - handles validation, locking, attempts
  - Multiple database operations, calculations, or business rules
  - Logic that needs to be reused across views, tasks, commands, etc.
  - NOT for simple wrapper methods like `get_instance()` that just call `get_or_create()`
