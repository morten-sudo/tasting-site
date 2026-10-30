# Winetastr

Wine tastings for hosts and their guests: invitations, wines, orders and a quiz.
Started as the site for the port wine tasting on 21 November 2026.

- **Frontend:** Astro (static site), hosted on Cloudflare Pages
- **Data:** Supabase (`supabase/schema.sql` plus `supabase/migrations/`)
- **Address:** portvin.krusesoendergaard.dk

## Run locally

```bash
npm install
npm run dev
```

## Pages

| Path | Purpose |
| --- | --- |
| `/` | Front page |
| `/login/` | Sign in with an email code (guests and hosts) |
| `/become-host/` | Host sign-up |
| `/profile/` | Guest RSVP, email and tasting fee |
| `/wines/`, `/wine/?id=` | Wines of the guest's tasting |
| `/cart/` | Cart and orders |
| `/quiz/` | Quiz |
| `/leaderboard/?t=slug` | Big-screen leaderboard |
| `/admin/` | Host admin: tastings, wines, guests, orders |

## Database

`supabase/schema.sql` is the base schema; the files in `supabase/migrations/`
are applied on top, in order.

Guests have no direct table access. They call security-definer functions
(`get_invite`, `respond_invite`, `place_order`, `submit_answer`, …) with the
invite code from their personal link (`?k=CODE`) or sign in with an email code.
Hosts only see and edit their own tastings (`is_tasting_host`).
