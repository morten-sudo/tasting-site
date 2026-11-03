// Where a signed-in user belongs: only a host (no tastings as a guest) → admin; everyone else → home, which is
// also the guest's own page (the next tasting, what is waiting, the wine book – src/lib/guest-home.ts).
export function landingUrl(guestTastings: { slug: string }[], isHost: boolean, isAdmin: boolean): string | null {
  if (isAdmin) return '/home/';
  if (isHost && guestTastings.length === 0) return '/admin/';
  if (isHost || guestTastings.length > 0) return '/home/';
  return null;
}
