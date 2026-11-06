// "What's new in Winetastr" (/admin/news/): a few short lines per release about what hosts and guests notice, newest
// first. Each release adds one entry at the top: its date and 3–6 lines in Danish, English and Icelandic. Plain words
// only – no issue numbers, no technical details. The other languages show the English lines.
import { lang } from '../i18n';

type Lines = { da: string[]; en: string[]; is: string[] };
export type Release = { date: string; lines: Lines };

export const RELEASES: Release[] = [
  {
    date: '2026-11-06',
    lines: {
      da: ['Forsiden har fået sit eget billede: et langbord dækket til vinsmagning.'],
      en: ['The front page has its own picture: a long table set for a wine tasting.'],
      is: ['Forsíðan hefur fengið sína eigin mynd: langborð dúkað fyrir vínsmökkun.'],
    },
  },
  {
    date: '2026-11-06',
    lines: {
      da: [
        'Kortet på smagningens side har en fane pr. region og fremhæver vinens område i hele regionen.',
        'Flaskestørrelsen står ved vinen overalt, også i bestillinger og CSV, når den ikke er 75 cl.',
        'Vin fra et link i euro regnes om til kroner, og der står hvordan, så du kan rette prisen.',
        'Tv-tavlen viser kun fornavne, og quizzens indstillinger ligger nu på Quiz-siden.',
        'Login og oprettelse afslører ikke længere, om en mail er kendt.',
        'Bedre læsbarhed: større tekst, skærmlæser og tastatur virker bedre i hele sitet.',
      ],
      en: [
        'The map on the tasting’s page has a tab for each region and highlights the wine’s area within the whole region.',
        'The bottle size is shown by the wine everywhere, also in orders and the CSV, when it is not 75 cl.',
        'A wine from a link priced in euros is converted to kroner, with a note on how, so you can correct the price.',
        'The TV board shows first names only, and the quiz settings are now on the Quiz page.',
        'Signing in and signing up no longer reveal whether an email address is known.',
        'Easier to read: larger text, and screen readers and keyboards work better across the whole site.',
      ],
      is: [
        'Kortið á síðu smökkunarinnar hefur flipa fyrir hvert hérað og sýnir svæði vínsins innan alls héraðsins.',
        'Flöskustærðin stendur við vínið alls staðar, líka í pöntunum og CSV-skránni, þegar hún er ekki 75 cl.',
        'Vín úr tengli með verði í evrum er umreiknað í danskar krónur, og þar stendur hvernig, svo þú getir leiðrétt verðið.',
        'Stigataflan á sjónvarpinu sýnir aðeins fornöfn, og stillingar spurningakeppninnar eru nú á síðunni Spurningakeppni.',
        'Innskráning og nýskráning sýna ekki lengur hvort netfang sé þekkt.',
        'Betri læsileiki: stærri texti, og skjálesarar og lyklaborð virka betur á allri síðunni.',
      ],
    },
  },
];

/** A release's lines in the reader's language: Danish, Icelandic, or English for everyone else */
export const linesOf = (r: Release) => {
  const l = lang();
  return l === 'da' ? r.lines.da : l === 'is' ? r.lines.is : r.lines.en;
};

/** Releases on the same day shown together under that day, newest first (the order of RELEASES) */
export function byDay(list: Release[] = RELEASES): { date: string; lines: string[] }[] {
  const days: { date: string; lines: string[] }[] = [];
  for (const r of list) {
    const last = days[days.length - 1];
    if (last?.date === r.date) last.lines.push(...linesOf(r));
    else days.push({ date: r.date, lines: [...linesOf(r)] });
  }
  return days;
}
