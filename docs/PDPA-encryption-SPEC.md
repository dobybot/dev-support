# PDPA Field-Level Encryption Plan

## Context

Dobybot stores customer PII (names, phone numbers, national ID numbers, addresses, shipping details) in `PickOrder` and related models entirely in plaintext. The Thai PDPA requires appropriate technical security measures for personal data. Current `DataMaskingService` provides 90-day obfuscation but is not encryption.

This plan adds **Fernet symmetric field-level encryption** to the highest-risk PII columns in `PickOrder`. GCP Secret Manager (already integrated in `settings.py`) stores the encryption key — no new infrastructure needed.

---

## Scope (first iteration)

**PickOrder model only:**
- `order_customer` — customer name
- `order_customerphone` — phone number
- `order_customeridnumber` — national ID / tax ID (most critical)
- `order_json` — entire JSON blob (contains name, phone, email, address duplicates)

**Out of scope for now:** `TaxDocument.buyer`, `PickOrderTrackingNo`, `SmsLog`, `SmsBlock`, `FixCase`

---

## Architecture

### Encryption
- **Fernet** (from `cryptography` package) — symmetric, authenticated, reversible
- Key stored in GCP Secret Manager as `PDPA_FERNET_KEY` (env var, loaded by existing `.env` / Secret Manager flow)
- Second key `PDPA_HMAC_KEY` for deterministic phone/name lookup hashes

### Custom Django fields (new file: `utils/encrypted_fields.py`)
- `EncryptedTextField` — subclasses `TextField`, encrypts in `get_prep_value()`, decrypts in `from_db_value()`
- `EncryptedJSONField` — subclasses `TextField`, JSON-serializes then encrypts; deserializes on read
- Both have a **graceful fallback**: if decryption fails (legacy plaintext row), return value as-is — safe for the data migration window

### HMAC lookup columns
Because `order_customer` and `order_customerphone` currently have `db_index=True` and are used in searches, we add:
- `order_customer_hmac` CharField(max_length=64, null=True, blank=True, db_index=True)
- `order_customerphone_hmac` CharField(max_length=64, null=True, blank=True, db_index=True)

These store `HMAC-SHA256(value, PDPA_HMAC_KEY)` for exact-match DB queries without exposing plaintext.

---

## Critical Files

| File | Change |
|------|--------|
| `pyproject.toml` / `requirements.txt` | Add `cryptography` |
| `core/settings/settings.py` | Add `PDPA_FERNET_KEY`, `PDPA_HMAC_KEY` env reads |
| **NEW** `utils/encryption.py` | `encrypt()`, `decrypt()`, `hmac_hash()` using GCP-managed key |
| **NEW** `utils/encrypted_fields.py` | `EncryptedTextField`, `EncryptedJSONField` |
| `picking/models/models.py` | Swap field types, add HMAC columns, remove db_index from encrypted fields |
| `picking/migrations/XXXX_encrypt_pii.py` | Schema migration (field type + new columns) |
| `picking/migrations/XXXX_encrypt_pii_data.py` | Data migration: encrypt existing rows in batches of 500 |
| `datamasking/services.py` | Minor update: null out HMAC columns when masking |

---

## Step-by-Step Implementation

### Step 1 — Add `cryptography` package
Add `cryptography` to `pyproject.toml` (under `[project.dependencies]`) and regenerate `requirements.txt` via `uv export`.

### Step 2 — Encryption utilities (`utils/encryption.py`)
```python
# encrypt(value: str) -> str          — Fernet encrypt, base64 token
# decrypt(token: str) -> str          — Fernet decrypt
# hmac_hash(value: str) -> str        — HMAC-SHA256 hex digest
# Keys loaded once at import from django.conf.settings
```
Keys are loaded from `settings.PDPA_FERNET_KEY` and `settings.PDPA_HMAC_KEY`. Raise `ImproperlyConfigured` if missing.

### Step 3 — Custom fields (`utils/encrypted_fields.py`)
`EncryptedTextField.get_prep_value` → `encrypt(value)`
`EncryptedTextField.from_db_value` → try `decrypt(value)`, except → return as-is (plaintext fallback)
`EncryptedJSONField` — same but wraps `json.dumps` / `json.loads` around encrypt/decrypt

### Step 4 — Settings (`core/settings/settings.py`)
```python
PDPA_FERNET_KEY = env("PDPA_FERNET_KEY")
PDPA_HMAC_KEY = env("PDPA_HMAC_KEY")
```
Add both keys to `.env` (locally generated with `Fernet.generate_key()`) and to GCP Secret Manager `dobybot_settings` payload for prod.

### Step 5 — Model changes (`picking/models/models.py`)
```python
# Before:
order_customer = models.CharField(max_length=400, db_index=True)
order_customerphone = models.CharField(max_length=400, db_index=True)
order_customeridnumber = models.CharField(max_length=200)
order_json = models.JSONField(...)

# After:
order_customer = EncryptedTextField()
order_customerphone = EncryptedTextField()
order_customeridnumber = EncryptedTextField()
order_json = EncryptedJSONField(...)
order_customer_hmac = models.CharField(max_length=64, null=True, blank=True, db_index=True)
order_customerphone_hmac = models.CharField(max_length=64, null=True, blank=True, db_index=True)
```

Also override `save()` to auto-populate HMAC columns before saving:
```python
def save(self, *args, **kwargs):
    if self.order_customer:
        self.order_customer_hmac = hmac_hash(self.order_customer)
    if self.order_customerphone:
        self.order_customerphone_hmac = hmac_hash(self.order_customerphone)
    super().save(*args, **kwargs)
```

### Step 6 — Schema migration
`makemigrations picking` to generate the AlterField + AddField migration.

### Step 7 — Data migration
Write a separate `RunPython` data migration that:
1. Iterates existing `PickOrder` rows in batches of 500
2. For each row: if `order_customer` doesn't look like a Fernet token (doesn't start with `gAAAAA`), encrypts it and populates HMAC columns
3. Uses `bulk_update` on `order_customer, order_customerphone, order_customeridnumber, order_json, order_customer_hmac, order_customerphone_hmac`
4. Skips already-masked rows (already irreversible; encrypt the masked value as-is)

### Step 8 — Update masking service (`datamasking/services.py`)
The masking service reads and writes `order_customer`, `order_customerphone`, `order_json` through the ORM — with custom fields, it automatically receives decrypted values on read and re-encrypts on write. **No change needed for the decrypt/encrypt cycle.**

One required change: when masking (after 90 days), also null out the HMAC columns so the lookup index no longer reveals data:
```python
pick_order.order_customer_hmac = None
pick_order.order_customerphone_hmac = None
```
Add both to the `bulk_update` fields list.

### Step 9 — Audit search query sites
Before deploying, grep for any code that queries `order_customer` or `order_customerphone` directly at the DB level (e.g., `.filter(order_customer__icontains=...)`) and update those to use `order_customer_hmac` for exact match, or accept that substring search is no longer available on encrypted fields.

```bash
rg "order_customer__\|order_customerphone__" --include="*.py" dobybot/
```

---

## Deployment Sequence

1. Add keys to `.env` locally + GCP Secret Manager for prod
2. `uv add cryptography` + regenerate requirements
3. Apply schema migration (adds HMAC columns, changes field definitions)
4. Apply data migration (encrypts existing rows)
5. Deploy application code
6. Verify with a sample read/write cycle

---

## Verification

- Unit test: write a PickOrder with known phone, read it back → plaintext matches
- Unit test: `PickOrder.objects.filter(order_customerphone_hmac=hmac_hash(phone))` returns the correct row
- DB-level check: `SELECT order_customerphone FROM picking_pickorder LIMIT 1` should return a Fernet token (starts with `gAAAAA`)
- Run `DataMaskingService.mask_pick_order_data` on a test company/date, confirm masking still works and HMAC columns are nulled
- Historical records: check `picking_historicalpickorder` has encrypted values for new saves
