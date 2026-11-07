// WIN-197: links in the emails the site sends (invitations, host invitations, notices) always point to the app
// address, wherever the call came from: the site's address (winetastr.com, and the database's /api/notify call, which
// goes there), the app's address, or a preview of the build's own pair. On any other address (a branch's
// *.pages.dev preview, localhost – one site with relative links, see src/lib/hosts.ts) the links stay on the address
// the call came from, so a preview's mails lead back to that preview.
import { SITE_ORIGIN, APP_ORIGIN } from '../lib/config';

export function mailOrigin(requestUrl: string, pair: { site: string; app: string } = { site: SITE_ORIGIN, app: APP_ORIGIN }): string {
  const origin = new URL(requestUrl).origin;
  return origin === pair.site || origin === pair.app ? pair.app : origin;
}
