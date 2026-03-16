# 🌙 Luna — Cycle & Wellness PWA

A beautiful, offline-capable Progressive Web App for menstrual health tracking, vaginal health logging, and fasting management — powered by **Supabase**.

---

## ✨ Features

- **Cycle Prediction Engine** — Rolling 3–4 month average for period and ovulation predictions
- **Phase Tracking** — Menstrual, Follicular, Ovulatory, Luteal with daily tips
- **Daily Logging Modal** — Flow, mood, symptoms, pad count, discharge health
- **Interactive Calendar** — Phase colour-coding, flow dots, click-to-log
- **Fasting Tracker** — Missed/compensated ledger with real-time balance
- **30-Day Insights** — Mood charts, symptom heatmaps, flow calendar
- **Web Notifications** — Phase changes, Monday/Thursday fasting reminders
- **Offline-Capable** — Service Worker with Stale-While-Revalidate caching
- **Installable PWA** — Add to home screen on any device
- **Real-time Sync** — Supabase subscriptions keep all devices in sync

---

## 🚀 Quick Start

### 1. Create a Supabase Project

Go to [supabase.com](https://supabase.com) and create a new project.

### 2. Run the Database Schema

In your Supabase **SQL Editor**, run the SQL found in the comments inside `js/supabase-config.js`. This creates:

- `profiles` — user cycle settings
- `daily_logs` — per-day health data
- `vaginal_health` — optional discharge tracking
- `fasting_ledger` — missed/compensated fasts
- `fasting_balance` view — live sum calculation

### 3. Configure Your Credentials

Open `js/supabase-config.js` and replace:

```js
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
```

Find these in your Supabase project → **Settings → API**.

### 4. Serve the App

Use any static file server. Examples:

```bash
# Python
python3 -m http.server 8080

# Node (npx)
npx serve .

# VS Code
# Use the "Live Server" extension
```

> ⚠️ Service Workers require **HTTPS** in production. For local development, `localhost` works fine.

### 5. Deploy (Optional)

Deploy to **Netlify**, **Vercel**, or **GitHub Pages** — just drag and drop the folder, or connect your repo.

---

## 📁 File Structure

```
luna-pwa/
├── index.html              # Main HTML shell
├── offline.html            # Offline fallback page
├── manifest.json           # PWA manifest
├── service-worker.js       # SW — caching & push notifications
├── css/
│   └── styles.css          # All styles (Lunar Baroque theme)
├── js/
│   ├── supabase-config.js  # Supabase client + schema docs
│   ├── cycle-engine.js     # Cycle prediction & phase logic
│   ├── fasting.js          # Fasting ledger module
│   ├── calendar.js         # Interactive calendar renderer
│   ├── analysis.js         # Charts & 30-day insights
│   ├── notifications.js    # Web Notifications API
│   └── app.js              # Main orchestrator
└── icons/
    ├── favicon.svg
    ├── icon-72.png … icon-512.png
    └── badge-72.png
```

---

## 🛡️ Security & Privacy

- All data is isolated via **Row Level Security (RLS)** in Supabase
- Only the authenticated user can read/write their own rows
- No external analytics — zero tracking
- Passwords hashed by Supabase Auth (bcrypt)

---

## 🔔 Notifications Setup

1. Click the bell icon (🔔) in the top-right corner
2. Allow notifications in the browser prompt
3. Luna will automatically:
   - Alert you when you transition into a new cycle phase
   - Send a fasting reminder every **Monday and Thursday at 05:00 AM**

For server-sent push notifications, deploy a **Supabase Edge Function** that triggers on scheduled events using `pg_cron`.

---

## 🌙 Design System

**Theme**: Lunar Baroque — deep cosmos meets organic warmth

| Token | Value |
|---|---|
| Background | `#0d0818` |
| Card | `#150f25` |
| Rose | `#e8708a` |
| Gold | `#d4a853` |
| Violet | `#9b7fe8` |
| Teal | `#5ec4b6` |

**Fonts**: Cormorant Garamond (display) + DM Sans (body)
