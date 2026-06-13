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

## Deploy — beginner friendly, no terminal needed

You do **not** need to install anything on your computer or use a command line. The tables
and starting data are created automatically the first time the site builds on Vercel.

You need two free accounts: **GitHub** (github.com) and **Vercel** (vercel.com). Sign up
for both first (you can click "Continue with GitHub" on Vercel to link them).

### Step 1 — Put the code on GitHub (using the GitHub Desktop app)

1. Download and install **GitHub Desktop** from desktop.github.com. Sign in with your
   GitHub account.
2. Unzip the project so you have a folder called `dollar-purchase-tool`.
3. In GitHub Desktop: **File → Add local repository** → choose that folder. If it says
   "this isn't a Git repository," click **create a repository** and then **Create**.
4. Click **Publish repository** (top right). Untick "Keep this code private" only if you
   want it public — private is fine. Click **Publish repository**.

Your code is now on GitHub. (If you prefer, you can instead go to github.com → New
repository → "uploading an existing file" and drag the unzipped files in — but GitHub
Desktop is easier.)

### Step 2 — Create the project on Vercel

1. Go to vercel.com → **Add New… → Project**.
2. Find `dollar-purchase-tool` in the list and click **Import**.
3. Leave everything as-is (it detects Next.js) and click **Deploy**.
4. **This first build will fail with a database error. That is expected** — we connect the
   database next. Just continue.

### Step 3 — Connect the database (fully automatic, nothing to copy)

1. In your new Vercel project, open the **Storage** tab.
2. Click **Create Database** (or **Connect Database**), choose **Neon** (Serverless
   Postgres), and follow the prompts to create it. Accept the defaults.
3. When asked, **connect it to this project** and to **all environments**
   (Production, Preview, Development).

That's it for the database — Vercel automatically adds the connection settings
(`DATABASE_URL` and `DATABASE_URL_UNPOOLED`) to your project. You don't copy or paste
anything.

> Make sure you pick **Neon**, not "Prisma Postgres" — Neon provides the direct connection
> the app uses to create its tables.

### Step 4 — Add four settings

In the project: **Settings → Environment Variables**. Add these four, one at a time. For
each, type the **Key** (left) and **Value** (right), leave all three environment boxes
ticked, and click **Save**.

| Key | Value |
|-----|-------|
| `AUTH_SECRET` | a long random string (see the value provided to you in chat, or make up 40+ random characters) |
| `SEED_ADMIN_EMAIL` | the email you'll log in with, e.g. `admin@propharmamaldives.com` |
| `SEED_ADMIN_NAME` | your name, e.g. `Administrator` |
| `SEED_ADMIN_PASSWORD` | a strong password you'll use to log in the first time |

### Step 5 — Deploy again (this time it works)

1. Open the **Deployments** tab.
2. On the most recent (failed) deployment, click the **⋯** menu → **Redeploy** → confirm.
3. Wait for it to finish (a couple of minutes). During this build the app automatically
   creates the database tables, loads both company letterheads, and creates your admin
   login.

### Step 6 — Sign in

Open your site's address (the `*.vercel.app` link at the top of the project) and log in
with the **SEED_ADMIN_EMAIL** and **SEED_ADMIN_PASSWORD** you set in Step 4.

You're live. Create users for your team under **Admin**, and confirm the starting serial
numbers under **Admin → Reference numbering**.

> **Troubleshooting:** if a build ever fails saying `DATABASE_URL_UNPOOLED` is missing, go
> to **Settings → Environment Variables**, add a variable named `DATABASE_URL_UNPOOLED` and
> paste the same value as `DATABASE_URL`, then redeploy.

---

## Making changes later (also no terminal)

Any change you push to GitHub triggers Vercel to rebuild and redeploy automatically. With
GitHub Desktop: edit/replace files in the folder, write a short summary, click **Commit to
main**, then **Push origin**. Vercel does the rest.

### Updating a letterhead
Replace the file in `prisma/templates/` (`prosynergy.pdf` or `propharma.pdf`) — keep the
same filename — then commit and push. The new letterhead is loaded on the next deploy;
existing requests and serial numbers are untouched.

### Adding a third company later
Tell me and I'll add it, or: drop its letterhead into `prisma/templates/`, copy one of the
`company.upsert({...})` blocks in `prisma/seed.ts` and change the `id`, `refPrefix`,
`brandColor`, and filename, then commit and push.

---

## For developers: running locally (optional)

```bash
cp .env.example .env     # fill DATABASE_URL, DATABASE_URL_UNPOOLED, AUTH_SECRET, SEED_ADMIN_*
npm install
npx prisma db push       # create tables
npm run db:seed          # load companies + admin
npm run dev              # http://localhost:3000
```

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
