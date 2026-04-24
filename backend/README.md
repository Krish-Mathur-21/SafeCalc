# SafeCalc Demo Backend

A demo bank-like backend for SafeCalc that supports:
- account summary (balance, totals)
- cash-in (credit)
- cash-out (debit)
- transaction listing and filtering
- phone-based user signup/profile
- AES-encrypted profile persistence
- optional managed persistence via Supabase

## 1. First-time setup

From the project root:

```bash
cd backend
npm install
npm run dev
```

Create env file:

```bash
cp .env.example .env
```

Set at least:
- `BACKEND_AES_KEY` (required, 16+ characters)

Optional managed DB:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PUBLISHABLE_KEY` (required for real SMS OTP)

Server starts at:
- `http://localhost:4000`

Health check:
- `GET /health`

### Production-like reliability features

The backend includes:
- **Graceful fallback**: Local JSON storage when Supabase fails
- **Persistent OTP**: Local demo OTPs survive backend restarts
- **Timeout protection**: 5-second timeout on Supabase calls
- **Comprehensive logging**: Clear logs for debugging
- **Port conflict detection**: Helpful error messages
- **Graceful shutdown**: Clean process termination
- **Standardized responses**: Consistent API format across all endpoints

## 2. API endpoints

### Get account summary
- `GET /api/account/summary?phone=+919999999999`

Response:

```json
{
  "accountId": "demo-primary",
  "currency": "INR",
  "openingBalance": 2000,
  "balance": 2800,
  "totalCredited": 1500,
  "totalDebited": 700,
  "transactionCount": 2
}
```

### Get transactions
- `GET /api/transactions?phone=+919999999999`
- Optional query params:
  - `limit=20`
  - `type=credit|debit`
  - `category=food`

### Add cash (credit)
- `POST /api/transactions/credit`

Body:

```json
{
  "phone": "+919999999999",
  "amount": 1200,
  "category": "cash_deposit",
  "note": "Added cash"
}
```

### Spend cash (debit)
- `POST /api/transactions/debit`

Body:

```json
{
  "phone": "+919999999999",
  "amount": 350,
  "category": "transport",
  "note": "Cab"
}

### Sign up with phone
- `POST /api/auth/signup`

```json
{
  "phone": "+919999999999",
  "name": "Krish"
}
```

### Profile read/update (AES at rest)
- `GET /api/profile/:phone`
- `PUT /api/profile/:phone`

```json
{
  "profile": {
    "name": "Krish",
    "phone": "+919999999999",
    "city": "Mumbai"
  }
}
```

### Send OTP to phone
- `POST /api/auth/otp/send`

```json
{
  "phone": "+919999999999"
}
```

### Verify OTP
- `POST /api/auth/otp/verify`

```json
{
  "phone": "+919999999999",
  "token": "123456",
  "name": "Krish"
}
```
```

If amount is above current balance, API returns HTTP `409` with `INSUFFICIENT_FUNDS`.

## 3. Demo cURL examples

```bash
curl http://localhost:4000/api/account/summary
```

```bash
curl -X POST http://localhost:4000/api/transactions/credit \
  -H "Content-Type: application/json" \
  -d "{\"amount\":500,\"category\":\"cash_deposit\",\"note\":\"Wallet cash\"}"
```

```bash
curl -X POST http://localhost:4000/api/transactions/debit \
  -H "Content-Type: application/json" \
  -d "{\"amount\":200,\"category\":\"food\",\"note\":\"Lunch\"}"
```

```bash
curl "http://localhost:4000/api/transactions?limit=10&type=debit"
```

## 4. Data persistence

Data is stored in:
- `backend/data/db.json`

This is intentionally simple for demo use.

If Supabase env vars are set, backend uses Supabase tables instead of local JSON.

## 5. Supabase schema (optional but recommended)

Run this SQL in Supabase:

```sql
create table if not exists public.bank_users (
  phone text primary key,
  currency text not null default 'INR',
  opening_balance numeric not null default 0,
  profile_enc text,
  created_at timestamptz not null default now()
);

create table if not exists public.bank_transactions (
  id text primary key,
  phone text not null references public.bank_users(phone) on delete cascade,
  type text not null check (type in ('credit', 'debit')),
  amount numeric not null,
  category text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_bank_transactions_phone_created_at
  on public.bank_transactions(phone, created_at desc);
```

## 6. Supabase website changes required for OTP

In Supabase Dashboard:

1. Go to `Authentication` -> `Providers` -> `Phone` and enable Phone provider.
2. Configure SMS provider credentials in Supabase (Twilio Verify, MessageBird, or supported provider).
3. In `Authentication` -> `URL Configuration`, set your allowed redirect URLs (for mobile deep-link flow if used later).
4. Keep rate limits/default OTP expiry as needed for testing.
5. Copy values from `Project Settings` -> `API`:
   - `Project URL` -> `SUPABASE_URL`
   - `service_role` secret key -> `SUPABASE_SERVICE_ROLE_KEY`
   - `publishable` key -> `SUPABASE_PUBLISHABLE_KEY`

If phone provider is not enabled/configured, OTP endpoints automatically fall back to local demo OTPs.

### OTP behavior

- **Supabase configured**: Sends real SMS via configured provider
- **Supabase not configured**: Generates 6-digit demo OTP returned in response
- **Supabase errors**: Automatically falls back to local demo OTP
- **Local OTPs**: Persist on disk for 10 minutes, survive restarts
- **Verification**: Always accepts valid local OTP first, falls back to Supabase

## 7. Validation and smoke tests

### Quick validation commands

```bash
# 1. Health check
curl http://localhost:4000/health

# 2. OTP send (returns local demo token if Supabase not configured)
curl -X POST http://localhost:4000/api/auth/otp/send \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543210"}'

# 3. OTP verify (use token from step 2)
curl -X POST http://localhost:4000/api/auth/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543210", "token": "123456", "name": "Test User"}'

# 4. Complete smoke test
node test-smoke.js
```

### Automated smoke test

Run the comprehensive smoke test suite:

```bash
# Test default localhost:4000
node test-smoke.js

# Test custom URL
node test-smoke.js http://localhost:4001
```

The smoke test validates:
- Health endpoint availability
- OTP send/verify flow (local demo mode)
- User signup
- Profile CRUD operations
- Transaction creation (credit/debit)
- Account summary
- API response format consistency
- Error handling

### Expected test results

- **Without Supabase**: All tests pass using local JSON storage
- **With Supabase**: Tests pass in Supabase mode if configured correctly
- **OTP flow**: Uses local demo OTPs for immediate verification

## 8. Connect from app (demo)

Set API base URL in app helper:
- `src/utils/demoBankApi.ts`

For Android emulator use `10.0.2.2` instead of localhost.
For physical device use your computer's LAN IP.
