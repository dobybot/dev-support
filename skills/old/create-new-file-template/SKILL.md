# Create New File Template Skill

Automates the creation of new file import templates for dobybot order data. This skill guides you through adding a new template for importing orders from a specific source (e.g., Shopee, Lazada).

## Input Parameters

1. **template-name**: Name of the template (e.g., `shopee`, `lazada`, `tiktok`)
2. **file-type**: File format - `csv`

---

## Complete Workflow

### ✅ Step 1: Determine Template Number

1. Check `@dobybot/importdata/urls.py` to find the **latest template number**
2. Increment by 1 to get `{number-template}`
3. Example: If latest is `2`, new number is `3`

### ✅ Step 2: Add URL Routes

Edit `@dobybot/importdata/urls.py` and add two new URL patterns:

```
URL Pattern 1: orders/upload/{number-template}-{template-name}
  → Points to OrderUploadAPI view

URL Pattern 2: orders/import/{number-template}-{template-name}
  → Points to OrderImportAPI view
```

**Reference existing URLs** in the file to match the pattern exactly.

### ✅ Step 3: Create View File

Create new file: `@dobybot/importdata/views/{template-name}.py`

The file must contain these components:

#### 3.1: FIELD_MAPS (Required)

Maps customer file columns (from CSV row 2) to dobybot order fields:

```python
FIELD_MAPS = {
    "Thai column name from row 2": "dobybot_field_name",
    ...
}
```

**How to populate:**
1. Examine the CSV file structure:
   - Row 1 = English/default column names (used to define field structure)
   - Row 2 = Thai column names (what you map FROM)
2. Extract **exact** Thai text from row 2 - preserve full text, don't truncate words
3. Map each Thai column name to the corresponding dobybot field name
4. Example mapping:
   ```python
   "วันที่สร้าง": "createdatetimeString",
   "หมายเลขคำสั่งซื้อ": "number",
   "Origin District": "shippingdistrict",  # English names as-is
   ```

**Available dobybot fields** - Reference:
- File: `@dobybot/importdata/views/generics.py`
- Class: `OrderImportGenericAPI`
- Method: `row_to_order` (shows all supported fields like: `number`, `list__sku`, `list__name`, `list__totalprice`, `paymentamount`, `shippingaddress`, `shippingdistrict`, etc.)

#### 3.2: Naming Constants (Required)

Define three constants for the template:

```python
# All caps with underscores, descriptive variable names
PLAYBOY_FIELD_MAPS = { ... }
PLAYBOY_IMPORT_TYPE = "055-playboy"
```

**Naming rules:**
- Format: `{TEMPLATE_NAME_UPPERCASE}_FIELD_MAPS`
- Format: `{TEMPLATE_NAME_UPPERCASE}_IMPORT_TYPE`
- Import type value: `"{number-template}-{template-name}"` (kebab-case)
- Example:
  ```python
  PLAYBOY_FIELD_MAPS = { ... }
  PLAYBOY_IMPORT_TYPE = "055-playboy"
  ```

#### 3.3: Serializer Class (Required)

Create a DRF serializer with all fields from your FIELD_MAPS:

```python
class PlayboyOrderSerializer(serializers.Serializer):
    # Include all fields mapped in FIELD_MAPS above
    number = serializers.CharField(max_length=100)
    list__sku = serializers.CharField(max_length=100)
    list__name = serializers.CharField(max_length=255)
    paymentamount = serializers.DecimalField(max_digits=12, decimal_places=2)
    # ... etc for all mapped fields
```

**Guidelines:**
- Include ONLY the fields from FIELD_MAPS values (right side of mapping)
- Use appropriate types: CharField, IntegerField, DecimalField
- Set `required=False, allow_blank=True` for optional fields
- Use `max_digits=12, decimal_places=2` for currency fields

#### 3.4: CONVERTERS Dictionary (Optional)

Use for data transformation. Common use case: preserve leading zeros in phone numbers.

```python
CONVERTERS = {
    "phone": lambda x: str(x),  # Convert to string
    "date": parse_date,          # Custom function
}
```

Only include if you need type conversion.

#### 3.5: OrderUploadAPI Class (Required)

Handles file upload endpoint:

```python
class {TemplateNameTitle}OrderUploadAPI(OrderUploadAPI):
    import_type = TYPE
    field_maps = FIELD_MAPS
    converters = CONVERTERS
    serializer_class = {TemplateNameTitle}OrderSerializer
```

#### 3.6: OrderImportAPI Class (Required)

Handles import/processing endpoint:

```python
class {TemplateNameTitle}OrderImportAPI(OrderImportAPI):
    import_type = TYPE
    field_maps = FIELD_MAPS
    converters = CONVERTERS
    serializer_class = {TemplateNameTitle}OrderSerializer
```

**Find examples** in existing view files in `@dobybot/importdata/views/`

### ✅ Step 4: Register Import Type

Edit `@dobybot/importdata/views/__init__.py` (or wherever `ImportTypeListAPIView` is defined):

Add your new import type to the list so it appears in the import type selector.

---

## Validation Checklist

- [ ] URLs added to `urls.py` with correct template number
- [ ] View file created with template name
- [ ] FIELD_MAPS defined (column mappings correct)
- [ ] TYPE constant matches URL pattern
- [ ] Serializer class created with mapped fields
- [ ] CONVERTERS added if needed (optional)
- [ ] OrderUploadAPI class implemented
- [ ] OrderImportAPI class implemented
- [ ] Import type registered in ImportTypeListAPIView

---

## Quick Reference

| Component | File | Example |
|-----------|------|---------|
| URLs | `@dobybot/importdata/urls.py` | `orders/upload/3-shopee` |
| View Logic | `@dobybot/importdata/views/{template-name}.py` | `shopee.py` |
| Base Classes | `@dobybot/importdata/views/generics.py` | `OrderUploadAPI`, `OrderImportAPI` |
| Available Fields | `@dobybot/importdata/views/generics.py:row_to_order` | `customer_name`, `phone`, `address` |
