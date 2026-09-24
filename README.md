# Hirsch Properties

Full-stack demo leasing site: browse listings, book tours, and cancel bookings. Server-side conflict checks prevent double-booking. Bookings are stored in PostgreSQL.

Live demo is currently offline (Render free tier). Clone and run locally.

Listings and images are sample content for demonstration.

## What it shows

- Static marketing and listings pages from `public/`
- Tour scheduling API with double-booking prevention
- Cancellation via a `cancelId` link
- Postgres indexes for availability checks

## Stack

- Node.js + Express
- PostgreSQL (`pg`)
- Nodemailer (optional confirmations)
- Render (when hosted)

## Layout

- `server.js`: Express server and API routes
- `public/`: Frontend
- `init-db.sql`: Optional bootstrap SQL
- `test-email.js`: Local SMTP check

## Run locally

Needs Node 18+, npm, and a Postgres database.

```bash
npm install
```

Create a `.env` (see `.env.example` if present):

- `DATABASE_URL` (required)
- `EMAIL_USER` / `EMAIL_PASSWORD` (optional; for confirmations)
- `PORT` (optional, default 3000)

```bash
npm start
```

Open `http://localhost:3000/`.

On startup the server creates the `Bookings` table if needed and adds indexes used for conflict checks.

## Email

Bookings are saved even if SMTP fails. The API still returns `cancelId`. Some free hosts block outbound SMTP; use an HTTPS email API (Resend, SendGrid) in that case.
