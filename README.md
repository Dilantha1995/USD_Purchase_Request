# Dollar Purchase Requests

Internal tool for **ProSynergy Medical Systems Pvt Ltd** and **ProPharma Maldives Pvt Ltd**
to generate USD purchase request letters on each company's official letterhead, with
automatic reference numbers, a searchable history, and per-user audit tracking.

Built with Next.js (App Router) + Prisma + Vercel Postgres (Neon). Deploys to Vercel.

---

## What it does

- **Letterhead-perfect PDFs.** Each request is drawn on top of the real company letterhead
  PDF, so the logo, registration number, and footer match your originals exactly.
- **Automatic reference numbers.** `PSMS/DEX/YYMM/NN` and `PPM/DEX/YYMM/NN`. The serial
  (`NN`) counts up continuously per company and never resets. `YYMM` comes from the
  document date.
- **Multiple transfers.** One purchase can pay several recipients/accounts, and each can be
  split into multiple amounts (e.g. `61,680` + `19,920`).
- **Login + audit.** Individual accounts; every request records who created it. Admins
  manage users and set each company's starting serial.
- **History.** Searchable and filterable by company; mark requests Paid/Pending (the PDF
  gets a PAID stamp when paid).

---

## Reference number logic

`PREFIX / DEX / YY MM / NN`

| Part | Meaning | Example |
|------|---------|---------|
| PREFIX | `PSMS` or `PPM` | `PSMS` |
| `YY` | 2-digit year of the document date | `26` |
| `MM` | 2-digit month of the document date | `06` |
| `NN` | continuous serial for that company, zero-padded to 2 digits | `07` |

→ `PSMS/DEX/2606/07`

The serial is taken from `Company.nextSerial` and incremented inside a transaction when a
request is saved, so concurrent saves can't produce duplicates. Set the starting number in
**Admin → Reference numbering** (seeded to `8` for ProSynergy and `1` for ProPharma).

---

## Deploy to Vercel (step by step)

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<you>/dollar-purchase-tool.git
git push -u origin main
```

### 2. Import into Vercel
- vercel.com → **Add New… → Project** → import the GitHub repo.
- Framework preset: **Next.js** (auto-detected). Don't deploy yet — add the database first.

### 3. Create the database (Vercel Postgres / Neon)
- In the project: **Storage → Create Database → Postgres (Neon)** → connect it to the project.
- Vercel automatically injects `DATABASE_URL` and (for Neon) a direct URL. This app expects
  two variables:
  - `DATABASE_URL` — the **pooled** connection string
  - `DIRECT_URL` — the **direct** (non-pooled) connection string, used for schema changes
- In **Settings → Environment Variables**, make sure both exist. If Vercel only gave you one
  Neon URL, set `DIRECT_URL` to the same value (Neon tolerates this for a small app).

### 4. Add the remaining environment variables
In **Settings → Environment Variables** add:

| Name | Value |
|------|-------|
| `AUTH_SECRET` | a long random string — generate with `openssl rand -base64 32` |
| `SEED_ADMIN_EMAIL` | your admin login email |
| `SEED_ADMIN_NAME` | admin display name |
| `SEED_ADMIN_PASSWORD` | a strong initial admin password |

### 5. Create the tables and seed the data
Run this **once** from your computer, pointing at the production database. Copy the
`DATABASE_URL` and `DIRECT_URL` values from Vercel into a local `.env` file (see
`.env.example`), then:

```bash
npm install
npx prisma db push      # creates the tables in Neon
npm run db:seed         # creates both companies (with letterheads) + the admin user
```

> The seed loads the two letterhead PDFs from `prisma/templates/` into the database, so PDF
> generation works on Vercel's serverless runtime without relying on the filesystem.

### 6. Deploy
Trigger a deploy in Vercel (or `git push`). Open the site, sign in with the admin
credentials, and you're live.

---

## Run locally

```bash
cp .env.example .env     # fill in DATABASE_URL, DIRECT_URL, AUTH_SECRET, SEED_ADMIN_*
npm install
npx prisma db push
npm run db:seed
npm run dev              # http://localhost:3000
```

---

## Updating a letterhead

Replace the file in `prisma/templates/` (`prosynergy.pdf` or `propharma.pdf`), keep the
same filename, then re-run `npm run db:seed`. The `upsert` refreshes the stored letterhead
without touching serial numbers or existing requests.

## Adding a third company later

1. Add its letterhead to `prisma/templates/`.
2. Add a `company.upsert({...})` block in `prisma/seed.ts` with a new `id`, `refPrefix`,
   `brandColor`, and `templatePdf`.
3. Re-run `npm run db:seed`. It will appear automatically in the company picker.

---

## Project layout

```
app/
  login/                     Sign-in page
  (app)/
    dashboard/               History list (search + company filter)
    new/                     Create request form
    requests/[id]/           Detail view, PDF preview, Paid/Pending toggle
    admin/                   Users + reference-number settings (admins only)
  api/
    auth/login | logout
    requests/                POST create (assigns ref no in a transaction)
    requests/[id]/           PATCH status
    requests/[id]/pdf/       GET — generated PDF on the company letterhead
    companies/               GET list, PATCH starting serial (admin)
    users/                   GET/POST/PATCH (admin)
lib/
  db.ts        Prisma client
  auth.ts      Sessions (JWT cookie) + password hashing
  format.ts    Ref-number, amount, date helpers
  pdf.ts       Letterhead overlay PDF generator
prisma/
  schema.prisma
  seed.ts
  templates/   prosynergy.pdf, propharma.pdf
```

## Notes
- Sessions are signed JWTs in an httpOnly cookie (7-day expiry). Changing `AUTH_SECRET`
  signs everyone out.
- The PDF route streams `application/pdf`; add `?download=1` to force a download.
- Letterhead PDFs are stored in the DB as bytes and never exposed through the JSON APIs.
