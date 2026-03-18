# Hirsch Leasing (RealEstateHirsch)

Full-stack demo leasing site that simulates a real property browsing and tour-booking flow, with server-side conflict prevention and a PostgreSQL-backed bookings table.

- **Live demo**: `https://hirsch-leasing.onrender.com/properties.html`
- **Note**: Listings/images are sample content used for demonstration.

## What this repo demonstrates

- A responsive marketing + listings experience (static site served from `public/`)
- API-backed tour scheduling with **double-booking prevention**
- Booking management via a cancellation link (`cancelId`)
- Postgres integration (Neon-compatible) with indexes for fast conflict checks

## Tech stack

- **Backend**: Node.js + Express
- **Database**: PostgreSQL (`pg`)
- **Email**: Nodemailer (SMTP) for confirmations (optional)
- **Hosting**: Render (demo)

## Repo layout

- `server.js`: Express server + API routes
- `public/`: Frontend pages, styles, and client scripts
- `init-db.sql`: Optional SQL to bootstrap the database
- `test-email.js`: Utility script to verify SMTP credentials locally

## Run locally

### Prerequisites

- Node.js 18+
- npm
- A PostgreSQL database (local or hosted)

### Setup

```bash
npm install
```

Create a `.env` file (see `.env.example`) and set:

- `DATABASE_URL` (required): Postgres connection string
- `EMAIL_USER` (optional): SMTP username/email (defaults to `hirschleasing@gmail.com` in code)
- `EMAIL_PASSWORD` (optional): SMTP app password (required if you want emails to send)
- `PORT` (optional): defaults to `3000`

Start the server:

```bash
npm start
```

Then open `http://localhost:3000/`.

## Database notes

On startup, the server will create the `Bookings` table (if it doesn’t exist) and add indexes used for availability + conflict checking.

## Email notes

Email sending is **best-effort**: bookings are saved even if SMTP fails, and the API returns the `cancelId` so the booking can still be managed.

Some hosting environments block outbound SMTP on free tiers. If SMTP is blocked, use an email API provider (SendGrid/Resend) over HTTPS instead.
