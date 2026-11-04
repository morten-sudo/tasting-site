// Which database the site talks to: 'live' or 'test'. Rewritten by scripts/db-target.mjs at build time – this
// committed value (live) is what a local `astro dev` uses unless DB=test is set.
export const DB_TARGET: 'live' | 'test' = 'live';
