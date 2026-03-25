# Staff PWA — make it work (checklist)

Do these in order once per environment.

## 1. Vercel project (this repo)

- [ ] Import repo → Framework **Vite**, **Output** `dist`, **Build** `npm run build`.
- [ ] **Environment variables** (Production + Preview if you use previews):

| Variable | Value |
|----------|--------|
| `CRM_BACKEND_URL` | `https://hearing-hope-crm.vercel.app` (your real CRM, **no** trailing slash) |
| `VITE_CRM_URL` | Same as above *or* leave unset if `CRM_BACKEND_URL` is set (proxy fallback only) |
| `VITE_FIREBASE_API_KEY` | From Firebase → Project settings → Web app |
| `VITE_FIREBASE_AUTH_DOMAIN` | e.g. `project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | |
| `VITE_FIREBASE_STORAGE_BUCKET` | |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | |
| `VITE_FIREBASE_APP_ID` | |
| `VITE_FIREBASE_VAPID_KEY` | Firebase → Project settings → Cloud Messaging → Web Push certificates (key pair) — required for PWA notifications |

### CRM (deployed backend) for reminders + notification links

- [ ] **`CRON_SECRET`** — random string; Vercel sends `Authorization: Bearer <CRON_SECRET>` to the cron route (see CRM `vercel.json`).
- [ ] **`STAFF_TELECALLING_PWA_URL`** — public URL of this PWA (no trailing slash), e.g. `https://hearing-hope-staff-telecalling-pwa.vercel.app`, so push notifications can deep-link to `/app`.
- [ ] Redeploy **CRM** after adding `vercel.json` crons so **start-time reminders** run every 5 minutes.

- [ ] **Redeploy** after any env change (client env is baked at build time; proxy reads server env at runtime).

## 2. Firebase

- [ ] **Authentication → Settings → Authorized domains** → add your PWA host, e.g. `your-app.vercel.app` (and custom domain if any).

## 3. CRM (`hearing-hope-crm`)

- [ ] Deployed and reachable at the **same** URL as `CRM_BACKEND_URL`.
- [ ] `POST /api/mobile-login` works (CORS is optional now; the **server** calls the CRM).

## 4. Smoke tests

- [ ] Open the live PWA URL → **Login** with a staff user that has **mobile app** access.
- [ ] **Appointments** list loads (Firestore rules allow that user).
- [ ] iPhone: Safari → **Add to Home Screen** → open installed app → login again.

## 5. Local development

- [ ] Copy `.env.example` → `.env` with `VITE_CRM_URL` and all `VITE_FIREBASE_*`.
- [ ] Run CRM locally **or** point `VITE_CRM_URL` at the deployed CRM.
- [ ] `npm run dev` → login uses Vite’s proxy to `/api/mobile-login` (no Vercel needed).

## If login still fails

1. In the browser **Network** tab, confirm `POST …/api/mobile-login` returns **JSON** (not `index.html`). If you see HTML, redeploy with latest `vercel.json` (excludes `/api/` from SPA rewrite).
2. Vercel → **Functions** / deployment logs → check `api/mobile-login` for `502` / env errors.
3. Confirm `CRM_BACKEND_URL` has **no** typo and **https** for production.
