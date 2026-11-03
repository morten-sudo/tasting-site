// The emails the site sends, in the site's languages (the sender's language is used).

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

type InviteText = { subject: string; hi: string; hiName: string; body: string; more: string };
// {name}, {tasting}: filled in below
const INVITE_HOST: Record<string, InviteText> = {
  da: { subject: 'Du er inviteret som medvært til {tasting}', hi: 'Hej', hiName: 'Hej {name}', body: 'du er inviteret som medvært til {tasting}.', more: 'Klik her for mere info' },
  en: { subject: 'You are invited as co-host of {tasting}', hi: 'Hi', hiName: 'Hi {name}', body: 'you are invited as co-host of {tasting}.', more: 'Click here for more info' },
  is: { subject: 'Þér er boðið að vera meðgestgjafi á {tasting}', hi: 'Hæ', hiName: 'Hæ {name}', body: 'þér er boðið að vera meðgestgjafi á {tasting}.', more: 'Smelltu hér til að fá nánari upplýsingar' },
  fr: { subject: 'Vous êtes invité comme co-hôte de {tasting}', hi: 'Bonjour', hiName: 'Bonjour {name}', body: 'vous êtes invité comme co-hôte de {tasting}.', more: 'Cliquez ici pour en savoir plus' },
  de: { subject: 'Du bist als Mitgastgeber zu {tasting} eingeladen', hi: 'Hallo', hiName: 'Hallo {name}', body: 'du bist als Mitgastgeber zu {tasting} eingeladen.', more: 'Hier klicken für mehr Infos' },
  it: { subject: 'Sei invitato come co-host di {tasting}', hi: 'Ciao', hiName: 'Ciao {name}', body: 'sei invitato come co-host di {tasting}.', more: 'Clicca qui per maggiori informazioni' },
  es: { subject: 'Estás invitado como coanfitrión de {tasting}', hi: 'Hola', hiName: 'Hola {name}', body: 'estás invitado como coanfitrión de {tasting}.', more: 'Haz clic aquí para más información' },
  nl: { subject: 'Je bent uitgenodigd als medegastheer van {tasting}', hi: 'Hoi', hiName: 'Hoi {name}', body: 'je bent uitgenodigd als medegastheer van {tasting}.', more: 'Klik hier voor meer info' },
  pl: { subject: 'Zaproszenie do współprowadzenia: {tasting}', hi: 'Cześć', hiName: 'Cześć {name}', body: 'zapraszamy Cię do współprowadzenia degustacji {tasting}.', more: 'Kliknij tutaj, aby dowiedzieć się więcej' },
};

/** "Hej Anna, du er inviteret som medvært til Portvin 2026. Klik her for mere info." */
export function inviteHostMail(lang: string, v: { name: string | null; tasting: string; link: string; inviter: string | null }) {
  const x = INVITE_HOST[lang] ?? INVITE_HOST.en;
  const fill = (s: string, html = false) => s
    .replace('{name}', html ? esc(v.name ?? '') : v.name ?? '')
    .replace('{tasting}', html ? `<b>${esc(v.tasting)}</b>` : v.tasting);
  const hi = v.name ? x.hiName : x.hi;
  const text = `${fill(hi)}, ${fill(x.body)}\n\n${x.more}: ${v.link}\n`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f8f5f1;font-family:Helvetica,Arial,sans-serif;color:#231a17">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e6ddd5;border-radius:12px;padding:28px">
<p style="margin:0 0 16px;font-size:16px;line-height:1.5">${fill(hi, true)}, ${fill(x.body, true)}</p>
<p style="margin:0"><a href="${esc(v.link)}" style="display:inline-block;background:#6e0f1f;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-size:15px">${esc(x.more)}</a></p>
</div>
<p style="max-width:520px;margin:12px auto 0;font-size:12px;color:#8a7d75;text-align:center">Winetastr</p>
</body></html>`;
  return { subject: fill(x.subject), text, html };
}

type WorkspaceText = { subject: string; hi: string; hiName: string; body: string; button: string };
// {name}, {account}, {inviter}: filled in below
const INVITE_WORKSPACE: Record<string, WorkspaceText> = {
  da: { subject: 'Du er inviteret som vært på {account}', hi: 'Hej', hiName: 'Hej {name}', body: '{inviter} har tilføjet dig som vært på kontoen {account} på Winetastr. Du kan se og rette alle kontoens smagninger, vine og gæster.', button: 'Åbn kontoen' },
  en: { subject: 'You are invited as a host on {account}', hi: 'Hi', hiName: 'Hi {name}', body: '{inviter} has added you as a host on the account {account} on Winetastr. You can see and edit all the account\'s tastings, wines and guests.', button: 'Open the account' },
  is: { subject: 'Þér er boðið að vera gestgjafi á {account}', hi: 'Hæ', hiName: 'Hæ {name}', body: '{inviter} hefur bætt þér við sem gestgjafa á reikningnum {account} á Winetastr. Þú getur séð og breytt öllum smökkunum, vínum og gestum reikningsins.', button: 'Opna reikninginn' },
  fr: { subject: 'Vous êtes invité comme hôte sur {account}', hi: 'Bonjour', hiName: 'Bonjour {name}', body: '{inviter} vous a ajouté comme hôte sur le compte {account} sur Winetastr. Vous pouvez voir et modifier toutes les dégustations, tous les vins et tous les invités du compte.', button: 'Ouvrir le compte' },
  de: { subject: 'Du bist als Gastgeber zu {account} eingeladen', hi: 'Hallo', hiName: 'Hallo {name}', body: '{inviter} hat dich als Gastgeber zum Konto {account} auf Winetastr hinzugefügt. Du kannst alle Verkostungen, Weine und Gäste des Kontos sehen und bearbeiten.', button: 'Konto öffnen' },
  it: { subject: 'Sei invitato come host su {account}', hi: 'Ciao', hiName: 'Ciao {name}', body: '{inviter} ti ha aggiunto come host all\'account {account} su Winetastr. Puoi vedere e modificare tutte le degustazioni, i vini e gli ospiti dell\'account.', button: 'Apri l\'account' },
  es: { subject: 'Estás invitado como anfitrión en {account}', hi: 'Hola', hiName: 'Hola {name}', body: '{inviter} te ha añadido como anfitrión en la cuenta {account} de Winetastr. Puedes ver y editar todas las catas, vinos e invitados de la cuenta.', button: 'Abrir la cuenta' },
  nl: { subject: 'Je bent uitgenodigd als gastheer bij {account}', hi: 'Hoi', hiName: 'Hoi {name}', body: '{inviter} heeft je als gastheer toegevoegd aan het account {account} op Winetastr. Je kunt alle proeverijen, wijnen en gasten van het account zien en bewerken.', button: 'Open het account' },
  pl: { subject: 'Zaproszenie do konta {account}', hi: 'Cześć', hiName: 'Cześć {name}', body: '{inviter} dodał(a) Cię jako gospodarza konta {account} w Winetastr. Możesz przeglądać i edytować wszystkie degustacje, wina i gości tego konta.', button: 'Otwórz konto' },
};

/** "Hej Anna, Morten har tilføjet dig som vært på kontoen Holte Vinklub på Winetastr." – with a button to the account */
export function inviteWorkspaceMail(lang: string, v: { name: string | null; account: string; link: string; inviter: string | null }) {
  const x = INVITE_WORKSPACE[lang] ?? INVITE_WORKSPACE.en;
  const fill = (s: string, html = false) => s
    .replace('{name}', html ? esc(v.name ?? '') : v.name ?? '')
    .replace('{inviter}', html ? esc(v.inviter ?? 'Winetastr') : v.inviter ?? 'Winetastr')
    .replace('{account}', html ? `<b>${esc(v.account)}</b>` : v.account);
  const hi = v.name ? x.hiName : x.hi;
  const text = `${fill(hi)}, ${fill(x.body)}\n\n${x.button}: ${v.link}\n`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f8f5f1;font-family:Helvetica,Arial,sans-serif;color:#231a17">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e6ddd5;border-radius:12px;padding:28px">
<p style="margin:0 0 16px;font-size:16px;line-height:1.5">${fill(hi, true)}, ${fill(x.body, true)}</p>
<p style="margin:0"><a href="${esc(v.link)}" style="display:inline-block;background:#6e0f1f;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-size:15px">${esc(x.button)}</a></p>
</div>
<p style="max-width:520px;margin:12px auto 0;font-size:12px;color:#8a7d75;text-align:center">Winetastr</p>
</body></html>`;
  return { subject: fill(x.subject), text, html };
}

type GuestText = { subject: string; subjectFrom: string; hi: string; hiName: string; body: string; when: string; where: string; button: string; reply: string };
// {name}, {tasting}, {inviter}: filled in below
const INVITE_GUEST: Record<string, GuestText> = {
  da: { subject: 'Invitation: {tasting}', subjectFrom: '{inviter} inviterer dig til {tasting}', hi: 'Hej', hiName: 'Hej {name}', body: 'du er inviteret til {tasting}.', when: 'Hvornår', where: 'Hvor', button: 'Se invitationen og svar', reply: 'Linket er personligt – det er din adgang til smagningen.' },
  en: { subject: 'Invitation: {tasting}', subjectFrom: '{inviter} invites you to {tasting}', hi: 'Hi', hiName: 'Hi {name}', body: 'you are invited to {tasting}.', when: 'When', where: 'Where', button: 'See the invitation and reply', reply: 'The link is personal – it is your access to the tasting.' },
  is: { subject: 'Boð: {tasting}', subjectFrom: '{inviter} býður þér á {tasting}', hi: 'Hæ', hiName: 'Hæ {name}', body: 'þér er boðið á {tasting}.', when: 'Hvenær', where: 'Hvar', button: 'Sjá boðið og svara', reply: 'Hlekkurinn er persónulegur – hann er aðgangur þinn að smökkuninni.' },
  fr: { subject: 'Invitation : {tasting}', subjectFrom: '{inviter} vous invite à {tasting}', hi: 'Bonjour', hiName: 'Bonjour {name}', body: 'vous êtes invité à {tasting}.', when: 'Quand', where: 'Où', button: 'Voir l’invitation et répondre', reply: 'Ce lien est personnel – c’est votre accès à la dégustation.' },
  de: { subject: 'Einladung: {tasting}', subjectFrom: '{inviter} lädt dich zu {tasting} ein', hi: 'Hallo', hiName: 'Hallo {name}', body: 'du bist zu {tasting} eingeladen.', when: 'Wann', where: 'Wo', button: 'Einladung ansehen und antworten', reply: 'Der Link ist persönlich – er ist dein Zugang zur Verkostung.' },
  it: { subject: 'Invito: {tasting}', subjectFrom: '{inviter} ti invita a {tasting}', hi: 'Ciao', hiName: 'Ciao {name}', body: 'sei invitato a {tasting}.', when: 'Quando', where: 'Dove', button: 'Vedi l’invito e rispondi', reply: 'Il link è personale – è il tuo accesso alla degustazione.' },
  es: { subject: 'Invitación: {tasting}', subjectFrom: '{inviter} te invita a {tasting}', hi: 'Hola', hiName: 'Hola {name}', body: 'estás invitado a {tasting}.', when: 'Cuándo', where: 'Dónde', button: 'Ver la invitación y responder', reply: 'El enlace es personal: es tu acceso a la cata.' },
  nl: { subject: 'Uitnodiging: {tasting}', subjectFrom: '{inviter} nodigt je uit voor {tasting}', hi: 'Hoi', hiName: 'Hoi {name}', body: 'je bent uitgenodigd voor {tasting}.', when: 'Wanneer', where: 'Waar', button: 'Bekijk de uitnodiging en antwoord', reply: 'De link is persoonlijk – het is je toegang tot de proeverij.' },
  pl: { subject: 'Zaproszenie: {tasting}', subjectFrom: '{inviter} zaprasza Cię na {tasting}', hi: 'Cześć', hiName: 'Cześć {name}', body: 'zapraszamy Cię na {tasting}.', when: 'Kiedy', where: 'Gdzie', button: 'Zobacz zaproszenie i odpowiedz', reply: 'Link jest osobisty – to Twój dostęp do degustacji.' },
};
export const INVITE_LANGS = Object.keys(INVITE_GUEST);

/** "Hej Anna, du er inviteret til Portvin 2026." – with when, where and a button to the guest's own invitation */
export function inviteGuestMail(lang: string, v: { name: string | null; tasting: string; link: string; inviter: string | null; when: string | null; where: string | null }) {
  const x = INVITE_GUEST[lang] ?? INVITE_GUEST.en;
  const fill = (s: string, html = false) => s
    .replace('{name}', html ? esc(v.name ?? '') : v.name ?? '')
    .replace('{inviter}', html ? esc(v.inviter ?? '') : v.inviter ?? '')
    .replace('{tasting}', html ? `<b>${esc(v.tasting)}</b>` : v.tasting);
  const hi = v.name ? x.hiName : x.hi;
  const facts: [string, string][] = [];
  if (v.when) facts.push([x.when, v.when]);
  if (v.where) facts.push([x.where, v.where]);
  const text = `${fill(hi)}, ${fill(x.body)}\n\n${facts.map(([k, val]) => `${k}: ${val}`).join('\n')}${facts.length ? '\n\n' : ''}`
    + `${x.button}: ${v.link}\n\n${x.reply}\n`;
  const rows = facts.map(([k, val]) => `<tr><td style="padding:2px 14px 2px 0;color:#8a7d75;vertical-align:top">${esc(k)}</td><td style="padding:2px 0">${esc(val)}</td></tr>`).join('');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f8f5f1;font-family:Helvetica,Arial,sans-serif;color:#231a17">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e6ddd5;border-radius:12px;padding:28px">
<p style="margin:0 0 16px;font-size:16px;line-height:1.5">${fill(hi, true)}, ${fill(x.body, true)}</p>
${rows ? `<table style="margin:0 0 20px;font-size:15px;line-height:1.5;border-collapse:collapse">${rows}</table>` : ''}
<p style="margin:0 0 18px"><a href="${esc(v.link)}" style="display:inline-block;background:#6e0f1f;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-size:15px">${esc(x.button)}</a></p>
<p style="margin:0;font-size:13px;color:#8a7d75">${esc(x.reply)}</p>
</div>
<p style="max-width:520px;margin:12px auto 0;font-size:12px;color:#8a7d75;text-align:center">Winetastr</p>
</body></html>`;
  return { subject: fill(v.inviter ? x.subjectFrom : x.subject), text, html };
}

// ---------- Updates to hosts (what they chose under Profile) ----------
type Item = { kind: string; guest: string | null; detail: Record<string, unknown> };
type UpdateText = {
  subject: string; intro: string; button: string; footer: string; settings: string;
  yes: string; waitlist: string; promoted: string; no: string; note: string; diet: string; chat: string; order: string; someone: string;
};
const UPDATES: Record<string, UpdateText> = {
  da: { subject: 'Nyt fra {tasting}', intro: 'Det her er sket i {tasting}:', button: 'Åbn smagningen', footer: 'Du får denne mail, fordi du har valgt det i din profil.', settings: 'Ret hvad du får mail om',
    yes: '{guest} kommer', waitlist: '{guest} er på ventelisten', promoted: '{guest} er rykket op fra ventelisten og kommer', no: '{guest} kommer ikke',
    note: '{guest} skrev', diet: 'Kost', chat: '{guest} i chatten', order: '{guest} bestilte', someone: 'En gæst' },
  en: { subject: 'News from {tasting}', intro: 'This happened in {tasting}:', button: 'Open the tasting', footer: 'You get this email because you chose it in your profile.', settings: 'Change what you get emails about',
    yes: '{guest} is coming', waitlist: '{guest} is on the waiting list', promoted: '{guest} moved up from the waiting list and is coming', no: '{guest} is not coming',
    note: '{guest} wrote', diet: 'Diet', chat: '{guest} in the chat', order: '{guest} ordered', someone: 'A guest' },
};

/** One email to a host about what happened in one tasting: answers, notes, chat messages and orders */
export function updatesMail(lang: string, v: { tasting: string; items: Item[]; link: string; settings: string; money: (n: number) => string }) {
  const x = UPDATES[lang] ?? UPDATES.en;
  const lines = v.items.map((it) => {
    const who = it.guest || x.someone;
    const d = it.detail ?? {};
    const say = (s: string) => s.replace('{guest}', who);
    switch (it.kind) {
      case 'yes': return say(d.status === 'waitlist' ? x.waitlist : d.from === 'waitlist' ? x.promoted : x.yes);
      case 'no': return say(x.no);
      case 'note': return [d.note ? `${say(x.note)}: “${d.note}”` : '', d.diet ? `${d.note ? '' : who + ' – '}${x.diet}: ${d.diet}` : ''].filter(Boolean).join(' · ');
      case 'chat': return `${say(x.chat)}: “${d.body}”`;
      case 'order': {
        const ls = (d.lines as { qty: number; wine: string; price: number }[] | undefined) ?? [];
        const total = ls.reduce((s, l) => s + l.qty * Number(l.price), 0);
        return `${say(x.order)}: ${ls.map((l) => `${l.qty} × ${l.wine}`).join(', ')}${total ? ` (${v.money(total)})` : ''}`;
      }
      default: return '';
    }
  }).filter(Boolean);
  const fill = (s: string, html = false) => s.replace('{tasting}', html ? `<b>${esc(v.tasting)}</b>` : v.tasting);
  const text = `${fill(x.intro)}\n\n${lines.map((l) => `• ${l}`).join('\n')}\n\n${x.button}: ${v.link}\n\n${x.footer} ${x.settings}: ${v.settings}\n`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f8f5f1;font-family:Helvetica,Arial,sans-serif;color:#231a17">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e6ddd5;border-radius:12px;padding:28px">
<p style="margin:0 0 12px;font-size:16px;line-height:1.5">${fill(x.intro, true)}</p>
<ul style="margin:0 0 20px;padding-left:20px;font-size:15px;line-height:1.55">${lines.map((l) => `<li style="margin:4px 0">${esc(l)}</li>`).join('')}</ul>
<p style="margin:0"><a href="${esc(v.link)}" style="display:inline-block;background:#6e0f1f;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-size:15px">${esc(x.button)}</a></p>
</div>
<p style="max-width:520px;margin:12px auto 0;font-size:12px;color:#8a7d75;text-align:center">${esc(x.footer)} <a href="${esc(v.settings)}" style="color:#8a7d75">${esc(x.settings)}</a></p>
</body></html>`;
  return { subject: fill(x.subject), text, html };
}
