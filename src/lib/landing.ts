// Where a signed-in user belongs. Home only appears when there is something to choose between:
// only a host → admin; only a guest with one tasting → that tasting; otherwise home.
import { tastingUrl } from './guest';

export function landingUrl(guestTastings: { slug: string }[], isHost: boolean, isAdmin: boolean): string | null {
  if (isAdmin) return '/home/';
  if (isHost && guestTastings.length === 0) return '/admin/';
  if (!isHost && guestTastings.length === 1) return tastingUrl(guestTastings[0].slug);
  if (isHost || guestTastings.length > 0) return '/home/';
  return null;
}
