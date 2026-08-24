# ColorStack at GSU Admin Portal

Internal officer portal for managing sponsors, sponsor contacts, invoices, and Zeffy
payments that could not be matched automatically. It is the back office behind
[`cs-gsu_sponsor_portal`](../cs-gsu_sponsor_portal) and talks to the same Spring API
and the same Supabase project.

## Local development

Start the local Supabase stack and Spring API from `../cs-gsu_backend`, then run the
portal:

```sh
cp .env.example .env.local
npm install
npm run dev
```

The frontend needs `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_URL`.
Missing any of them renders a setup screen naming the one that is missing rather than a
blank page (see [`src/lib/env.ts`](src/lib/env.ts)).

In a dev build only, the sign-in page offers one-click access as
`official@colorstackatgsu.com` through `/auth/admin/dev-login`. That button is not
compiled into a production bundle, and the endpoint itself 404s unless the backend has
`app.admin.dev-auto-login` enabled.

## Design system

**Neo-brutalist, ported from the sponsor portal.** Hard black rules, solid offset
shadows that never blur, flat loud fills, uppercase display type, zero corner radius, no
gradients. The two apps are one chapter product and are set in the same type on the same
tokens — an officer who has just looked at what a sponsor sees should not feel like they
changed companies.

The source of truth is the `:root` block in [`src/index.css`](src/index.css), **not**
`tailwind.config.js`. It is kept in step with
[`cs-gsu_sponsor_portal/src/index.css`](../cs-gsu_sponsor_portal/src/index.css); change
one and change the other.

- Ink `#14110D` is every border, every rule and all body text. One weight, `--bw` (3px),
  for structure and `--bw-thin` (2px) for chips and small controls
- Cream canvas `#FBF4E4` under a dot grid, white card bodies on top
- Shadows are solid and offset down-right (`3px 3px 0`, `5px 5px 0`, `8px 8px 0`), never
  blurred. Interactive things press into their shadow on hover, travelling exactly as far
  as the shadow is offset
- The loud set (yellow `#FFDD33`, lime, mint, sky, pink, coral, orange, violet) is chosen
  so every one of them carries ink-black text
- Archivo Black for display, Space Grotesk for interface text, Space Mono for money,
  dates and IDs

Four rules keep it a working back office rather than a poster:

1. **Colour sits on frames, header bars, status chips and one hero block per page.** Card
   bodies stay white, so a table of invoices stays readable
2. **Every border is the same ink at the same weight.** Consistency is what makes heavy
   borders read as a system instead of as noise
3. **Text on a coloured fill is always ink black,** and colour never carries meaning
   alone: every pill and every block also spells its state out
4. **Required and optional are words, not asterisks.** Every field says which it is, and
   says it in the label

Custom classes deliberately live **outside** `@layer components`. Tailwind tree-shakes
that layer against the content files, and `statusPillClass()` builds `pill-paid` at
runtime from a template string, so those rules get dropped from the build. Do not move
them back.

Two deliberate differences from the sponsor portal:

- **No per-sponsor brand theming.** `--brand` stays GSU blue. An officer works across
  every sponsor at once, so recolouring the chrome per sponsor would only make the page
  harder to read
- **A wider `.wrap` (1180px).** Admin tables carry more columns than sponsor-facing ones

Signed-out pages are a two-panel split, matching the sponsor portal but with copy that
makes it obvious which of the two apps you have opened.

## Backend contract

Every call goes through [`src/lib/api.ts`](src/lib/api.ts) with the Supabase JWT as a
bearer. Resource types and request-body builders are in
[`src/lib/admin.ts`](src/lib/admin.ts) and mirror the records in
`../cs-gsu_backend/.../admin/AdminPortalController.java` one for one.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/admin/tiers` | Active tiers, for every picker |
| `GET` | `/admin/sponsors` | All sponsors |
| `POST` | `/admin/sponsors` | `SponsorBody`; `name`, `slug`, `status` required |
| `GET` | `/admin/sponsors/{id}` | Sponsor plus its contacts |
| `PATCH` | `/admin/sponsors/{id}` | `SponsorBody` again — a full replace, not a partial |
| `POST` | `/admin/sponsors/{id}/contacts` | `ContactBody`; `email` and `role` required |
| `PATCH` | `/admin/sponsors/{sponsorId}/contacts/{id}` | `ContactBody` |
| `POST` | `/admin/sponsors/{id}/logo` | multipart, field name `file`, 1 MB max |
| `DELETE` | `/admin/sponsors/{id}/logo` | Clears `logo_path` |
| `GET` | `/admin/invoices?status=` | Filters on the stored status only |
| `POST` | `/admin/invoices` | `InvoiceBody`; amount comes from the tier, never from us |
| `GET` | `/admin/invoices/{id}` | |
| `POST` | `/admin/invoices/{id}/issue` | Draft only, and only with a Zeffy id on file |
| `POST` | `/admin/invoices/{id}/void` | Anything not already void |
| `GET` | `/admin/unmatched-payments` | Unresolved Zeffy payments |
| `POST` | `/admin/unmatched-payments/{id}/dismiss` | **200 with an empty body**, not 204 |
| `POST` | `/admin/unmatched-payments/{id}/link` | `{ invoiceId }`; draft invoice, exact amount match |

Rules the UI enforces before sending, because the backend enforces them after:

- `slug` must match `^[a-z0-9]+(-[a-z0-9]+)*$` and be unique
- `brandHex` must match `^#[0-9A-F]{6}$` or be null
- An invoice needs a `zeffyInvoiceId` before it can leave draft
  (`invoices_issued_has_zeffy_link`)
- A payment can only be linked to a **draft** invoice whose amount matches **exactly**

### What "slug" is

A short, unique, URL-safe id for a sponsor — `acme-corporation`. Nothing public links to
it today; it exists so a sponsor can be referred to by something stable and readable
instead of a UUID, and the database enforces its shape and uniqueness. The create form
fills it in from the company name and you can usually leave it alone.

## Verification

```sh
npm run lint
npm run build
```

Backend migrations and tests run from `../cs-gsu_backend`:

```sh
npx supabase migration up --local
./mvnw test
```

## Deployment

Deploy this directory as its own Vercel project with the three frontend environment
variables configured for the production Supabase project and API. The included
`vercel.json` handles SPA routes. The backend CORS allowlist includes
`https://admin.colorstackatgsu.com`.

Note that `app.admin.dev-auto-login` defaults to **on** in the backend's
`application.yml`. The dev sign-in button is not built into this app's production bundle,
but the endpoint stays reachable until that flag is turned off in the production
environment — worth doing.
