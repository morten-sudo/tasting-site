// "What's new in Winetastr" (/admin/news/): a few short lines per release about what hosts and guests notice, newest
// first. Each release adds one entry at the top: its date and 3–6 lines in Danish, English and Icelandic. Plain words
// only – no issue numbers, no technical details. The other languages show the English lines.
import { lang } from '../i18n';

type Lines = { da: string[]; en: string[]; is: string[] };
export type Release = { date: string; lines: Lines };

export const RELEASES: Release[] = [
  {
    date: '2026-11-07',
    lines: {
      da: [
        'Alt, du logger ind til, ligger nu på app.winetastr.com. Gamle links, invitationer og bogmærker sender dig videre, og du er stadig logget ind.',
        'Kontoen står i adressen, så et link til en af dine konti åbner den rigtige.',
        'En blind vin viser kun sit nummer, indtil du afslører den.',
        'Betalingsboksen siger, om prisen er fast eller delt, og uden MobilePay står kun beløbet.',
        'En mængdepris kan ikke være højere end gæsteprisen.',
        'Kortene har bynavne på alle ni sprog.',
      ],
      en: [
        'Everything you sign in to is now on app.winetastr.com. Old links, invitations and bookmarks take you there, and you stay signed in.',
        'The account is in the address, so a link to one of your accounts opens the right one.',
        'A blind wine shows only its number until you reveal it.',
        'The payment box says whether the price is fixed or shared, and without MobilePay it shows only the amount.',
        'A quantity price cannot be higher than the guest price.',
        'The maps have town names in all nine languages.',
      ],
      is: [
        'Allt sem þú skráir þig inn í er nú á app.winetastr.com. Gamlir tenglar, boð og bókamerki vísa þér þangað og þú ert áfram innskráð(ur).',
        'Reikningurinn stendur í slóðinni, svo tengill á einn af reikningunum þínum opnar þann rétta.',
        'Blint vín sýnir aðeins númerið sitt þar til þú afhjúpar það.',
        'Greiðsluboxið segir hvort verðið er fast eða deilt, og án MobilePay sýnir það aðeins upphæðina.',
        'Magnverð getur ekki verið hærra en verðið fyrir gesti.',
        'Kortin eru með bæjarnöfnum á öllum níu tungumálum.',
      ],
    },
  },
  {
    date: '2026-11-07',
    lines: {
      da: [
        'MobilePay sættes op på hver smagning under Indstillinger: slå det til, og skriv nummer og navn på den, der får pengene.',
        'Gæsten ser kun MobilePay-nummer, modtager og beløb, så pengene går til den rigtige.',
        'Overblikket viser gæster og vine som almindelige rækker med links videre.',
        'Kortet, når du redigerer en vin, er det samme som på vinens side, med byer.',
        'En blyant betyder Rediger, et tandhjul betyder Administrer.',
        '"Nye spørgsmål fra AI" i quizzen: vælg sværhed og antal, og vælg derefter, hvilke forslag der kommer med.',
      ],
      en: [
        'MobilePay is set up on each tasting under Settings: turn it on and enter the number and the name of the person who gets the money.',
        'Guests see only the MobilePay number, the recipient and the amount, so the money goes to the right person.',
        'The overview shows guests and wines as plain rows with links onwards.',
        'The map when you edit a wine is the same as on the wine’s page, with towns.',
        'A pencil means Edit, a gear means Manage.',
        '"New questions from AI" in the quiz: choose difficulty and number, then choose which suggestions to add.',
      ],
      is: [
        'MobilePay er sett upp á hverri smökkun undir Stillingar: kveiktu á því og skrifaðu númerið og nafn þess sem fær peningana.',
        'Gestir sjá aðeins MobilePay-númerið, viðtakandann og upphæðina, svo peningarnir fari til rétts aðila.',
        'Yfirlitið sýnir gesti og vín sem venjulegar línur með tenglum áfram.',
        'Kortið þegar þú breytir víni er það sama og á síðu vínsins, með bæjum.',
        'Blýantur þýðir Breyta, tannhjól þýðir Stjórna.',
        '„Nýjar spurningar frá gervigreind“ í spurningakeppninni: veldu erfiðleika og fjölda, og veldu síðan hvaða tillögur fara inn.',
      ],
    },
  },
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
