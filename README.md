# Portvin 2026

Website til portvinssmagningen lørdag 21. november 2026 kl. 17:
tilmelding, vine, bestilling og quiz.

- **Frontend:** Astro (statisk site), hostet på Cloudflare Pages
- **Data:** Supabase (`supabase/schema.sql`)
- **Adresse:** portvin.krusesoendergaard.dk

## Kom i gang lokalt

```bash
npm install
npm run dev
```

## Database

Kør `supabase/schema.sql` i Supabase → SQL Editor. Filen kan køres igen uden datatab.

Gæster har ingen direkte adgang til tabellerne. De kalder funktioner
(`get_invite`, `respond_invite`, `set_order`, `submit_answer` …) med
deres personlige invitationskode fra linket `/invitation/?k=KODE`.
