# Hearing Hope Staff — Telecalling (PWA)

Progressive Web App for telecalling and scheduling staff: **same login as `hearing-hope-mobile` / `hearing-hope-staff-pwa`** (phone + password → CRM **`/api/mobile-login`** → Firebase custom token).

## Features

- **Appointment Scheduler (CRM parity)** — Full **FullCalendar** views (month / week / day / list), **filters** by center and home-visit executive, **create** (slot select or “New appointment”), **edit**, **delete**, **cancel visit**, **mark completed**, **reschedule same day**, **schedule another visit**, **export** upcoming list as **PNG** or **PDF**, **refresh**. Patient picker loads from **enquiries** like the CRM. New home visits trigger **`/api/send-appointment-notification`** (proxied to the CRM) for Expo push when the assignee has a token.
- **Enquiries** — Read-only list and detail (create in CRM). Search, **log call** / **`followUps`** same shape as CRM.
- **Calls** — Flattened telecalling history across enquiries.
- **Install to Home Screen** — PWA shell (see **`VERCEL.md`** / **`hearing-hope-staff-pwa`** for env vars).

### Firestore access for this app

When you **turn off** the permissive `match /{document=**}` rule in production, enable the **Staff Telecalling PWA** for each user in **CRM → Staff → Mobile** section: turn on **“Staff Telecalling PWA — full scheduler & enquiries”** (`staffAppSchedulerAccess: true` on `staff/{staffId}`). That unlocks, for that staff login:

- Read/write **all appointments** (scheduler), read/update **enquiries** (follow-ups), read **centers**, read **all staff** (dropdowns), per **`firestore.rules`** in this repo.

**PWA push (FCM Web):** After login, the app asks for notification permission and registers **Firebase Cloud Messaging** (needs **`VITE_FIREBASE_VAPID_KEY`**). Tokens are stored on **`staff/{uid}.fcmWebPushTokens`**. The **CRM** sends web pushes when a **new appointment** is created (same API as Expo) and runs a **Vercel cron** every 5 minutes for **start-time reminders** (see CRM `vercel.json` and env **`CRON_SECRET`**). Set **`STAFF_TELECALLING_PWA_URL`** on the CRM (e.g. `https://your-telecalling-pwa.vercel.app`) so notification taps open the app.

## Setup

```bash
cd hearing-hope-staff-telecalling-pwa
cp .env.example .env
# Fill VITE_* values (mirror EXPO_PUBLIC_* from the mobile app / CRM).
npm install
npm run dev
```

Open the URL shown (e.g. `http://localhost:5173`). Use the same credentials as the mobile app.

## Deploy

**Vercel (recommended):** **[VERCEL.md](./VERCEL.md)** (import + env vars) and **[DEPLOY_CHECKLIST.md](./DEPLOY_CHECKLIST.md)** (copy-paste checklist).

Any static host:

```bash
npm run build
# Upload `dist/`, or connect CI with build `npm run build` and output directory `dist`.
```

Set the same **`VITE_*`** environment variables in the host’s dashboard; **redeploy** after changing them (values are inlined at build time).

**CORS:** The CRM route **`/api/mobile-login`** allows cross-origin `POST` from any origin (`Access-Control-Allow-Origin: *`). Your Firestore security rules still enforce data access.

**Optional same-origin deploy:** You can also serve this app under a path on the CRM domain (e.g. reverse proxy `/staff` → `dist`) to avoid cross-origin for login only; Firebase client still talks to Google directly.

## “Failed to fetch” on login

The app posts to **same-origin** `/api/mobile-login`. That route is **proxied** to your CRM (no cross-origin login from the browser).

| Where | What to do |
|--------|------------|
| **Local `npm run dev`** | Set `VITE_CRM_URL` in `.env`, restart Vite. The dev server proxies `/api/mobile-login` → CRM. |
| **Vercel** | Set **`CRM_BACKEND_URL`** to your CRM origin (e.g. `https://hearing-hope-crm.vercel.app`) in the PWA project’s env vars, then **redeploy**. Optional fallback: `VITE_CRM_URL` (server reads it if `CRM_BACKEND_URL` is empty). |
| **`vite preview`** | There is no proxy or serverless — `/api/mobile-login` will not work. Use `npm run dev` locally or test on Vercel. |

If login returns HTML or 404, confirm **`vercel.json`** excludes `/api/` from the SPA rewrite and that **`api/mobile-login.ts`** is in the repo root.

---

## iPhone

1. Open the deployed HTTPS URL in **Safari**.
2. **Share** → **Add to Home Screen**.
3. Launch from the icon; it runs standalone like an app.

Use **iOS 16.4+** for the best PWA behavior.
