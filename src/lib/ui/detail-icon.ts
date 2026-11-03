// The icon for a heading in a wine's details ("Label: text" lines written by the host or fetched): the heading's
// words decide (Danish, English, Icelandic), the info icon when none fits. Used by the wine page and the host's
// wine page, so a heading has the same icon everywhere.
import type { IconName } from './icons';

// First match wins: "Duft og smag" is taste, "Lagring · Holdbarhed" is ageing
const RULES: [RegExp, IconName][] = [
  [/hjemmeside|website|vefs/, 'globe'],
  [/adresse|address|heimilisfang/, 'pin'],
  [/smag|taste|palate|finish|bragð/, 'taste'],
  [/duft|næse|aroma|nose|bouquet|ilm/, 'wind'],
  [/drue|grape|þrúg/, 'grapes'],
  [/vinmark|mark\b|vineyard|parcel|terroir|jordbund|soil|víngarð/, 'vineyard'],
  [/producent|huset|producer|house|winery|quinta|framleiðand/, 'winery'],
  [/oprindelse|område|region|origin|appellation|uppruni|svæði/, 'map'],
  [/året|årgang|\byear\b|vintage|høst|harvest|klima|weather|árgang/, 'sun'],
  [/farve|colou?r|litur/, 'drop'],
  [/balance|struktur|structure|syre|acid|tannin|sødme|sweetness/, 'scale'],
  [/fremstilling|produktion|vinifi|production|making|framleiðsl/, 'barrel-grapes'],
  [/lagring|holdbar|modning|ageing|aging|cellar|drikkevindue|geymsl/, 'barrel'],
  [/udvikling|potentiale|development|potential|þróun/, 'trend'],
  [/alkohol|alcohol|abv|áfengi/, 'percent'],
  [/flaske|bottle|flask/, 'bottle'],
  [/anmeldelse|point|score|review|rating|bedømmelse|umsögn/, 'star'],
  [/sammenlign|compared|comparison|samanbur/, 'compare'],
  [/sjælden|rarity|\brare\b|fágæt/, 'gem'],
  [/\bmad\b|food|pairing|matur/, 'food'],
  [/servering|serving|serve|temperatur|framreiðsl/, 'serving'],
  [/stil|hvad er det|style|\btype\b|what it is|tegund/, 'glass'],
];

export function detailIcon(label: string): IconName {
  const l = label.toLowerCase();
  for (const [re, icon] of RULES) if (re.test(l)) return icon;
  return 'info';
}
