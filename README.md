# SafeCalc

SafeCalc is a dual-state privacy app disguised as a normal calculator.

- Public view: fully functional calculator UI.
- Hidden view: encrypted ledger, security controls, OTP-backed account flow, and optional backend persistence.

The app is built with Expo React Native (frontend) and a Node.js Express backend.

## Project Structure

- Frontend: Expo app in root folder
- Backend: Node service in backend/
- Local data fallback: backend/data/db.json
- Optional managed persistence: Supabase (backend)

## Features

- Calculator cover interface
- Secret and duress PIN flow
- Encrypted local data storage
- Phone OTP auth endpoints (with local demo fallback)
- Demo bank summary and transaction actions
- Presence and panic security hooks
- Goal tracking and journal entries

## Tech Stack

- React Native + Expo SDK 54
- TypeScript
- Express + Node.js
- SQLite (frontend local)
- SecureStore + crypto-based encryption
- Optional Supabase integration

## Prerequisites

Install these before setup:

- Node.js 18+
- npm 9+
- Git
- Expo Go on your mobile phone (if testing on real device)

Optional:

- Android Studio (Android emulator)
- Xcode (iOS simulator, macOS)
- Supabase project (if you want managed backend persistence and real OTP SMS)

## Setup on Any Device

These steps are for a new machine, not tied to the original developer device.

### 1. Clone and install dependencies

Run from a terminal:

git clone https://github.com/Krish-Mathur-21/SafeCalc.git
cd SafeCalc
npm install
cd backend
npm install
cd ..

### 2. Create environment files

Root app env:

Copy .env.example to .env

Set at minimum:

- EXPO_PUBLIC_API_BASE_URL=http://YOUR_COMPUTER_LAN_IP:4000
- SUPABASE_ANON_KEY=your_supabase_anon_key_here (optional for frontend usage)

Backend env:

Copy backend/.env.example to backend/.env

Set required:

- BACKEND_AES_KEY=use_a_long_random_secret_value

Optional Supabase backend keys:

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_PUBLISHABLE_KEY

Important:

- Do not commit .env or backend/.env
- Keep real keys only in local env files

### 3. Start backend and frontend

Open two terminals.

Terminal A:

npm run backend

Terminal B:

npm start

Backend should be available at:

http://localhost:4000/health

## Running on a Different Phone (Physical Device)

If the phone is not your original device, follow this exactly.

1. Connect phone and computer to the same Wi-Fi network.
2. Find your computer LAN IP.
3. Set EXPO_PUBLIC_API_BASE_URL in .env to:
	http://YOUR_LAN_IP:4000
4. Ensure backend/.env has HOST=0.0.0.0 and PORT=4000.
5. Start backend first, then Expo.
6. Open Expo Go on that phone and scan the QR.

If API calls fail from phone:

- Check Windows firewall allows inbound port 4000
- Confirm phone can open http://YOUR_LAN_IP:4000/health in browser

## Emulator and Simulator Notes

- Android emulator base URL commonly uses http://10.0.2.2:4000
- iOS simulator can use http://localhost:4000
- Physical phones must use LAN IP, not localhost

## Useful Scripts

From project root:

- npm start: start Expo dev server
- npm run android: launch Android target
- npm run ios: launch iOS target
- npm run web: run web target
- npm run backend: start backend in dev mode
- npm run backend:start: start backend in node mode
- npm run preflight: app preflight checks
- npm run preflight:backend: backend strict preflight
- npm run preflight:all: run both preflight checks

## Optional: Supabase Setup

If you want managed backend persistence:

1. Create Supabase project
2. Apply schema in backend/supabase-schema.sql
3. Put project URL and keys in backend/.env
4. Enable Phone provider for OTP if real SMS is needed

Without Supabase, backend falls back to local JSON mode for demo usage.

## Troubleshooting

- Port in use: change PORT in backend/.env and update EXPO_PUBLIC_API_BASE_URL
- OTP not sending: verify Supabase phone provider or use local OTP fallback
- App cannot reach backend: verify LAN IP, firewall, same Wi-Fi
- Build warnings: run npm run preflight:all before packaging

## Security Notes

- Keep all real secrets in local env files only
- Never hardcode service role keys in source files
- Rotate keys immediately if exposed
- Use placeholders in example files

