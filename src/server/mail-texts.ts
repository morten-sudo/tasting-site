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
