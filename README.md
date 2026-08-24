# ColorStack at GSU Admin Portal

Internal officer portal for managing sponsors, sponsor contacts, invoices, and Zeffy payments that could not be matched automatically.

## Local development

Start the local Supabase stack and Spring API from `../cs-gsu_backend`, then run the portal:

```sh
cp .env.example .env.local
npm install
npm run dev
```

The frontend needs `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_URL`. The sign-in page includes one-click access as `official@colorstackatgsu.com` through `/auth/admin/dev-login`.

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

Deploy this directory as its own Vercel project with the three frontend environment variables configured for the production Supabase project and API. The included `vercel.json` handles SPA routes. The backend CORS allowlist includes `https://admin.colorstackatgsu.com`, and one-click sign-in is enabled by default.
