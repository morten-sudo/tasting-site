// The four guest personas shown on /dev/personas/: the basis for working on the value for the guest. Fictional people
// and hypotheses (not research): only "today" describes the product as it is, checked against the code on 4 Nov 2026.
// The text is Danish (the page is for Morten). Not used on any guest page, and not part of the app.

export interface Persona {
  id: string;
  name: string;
  age: number;
  archetype: string;
  quote: string;
  /** One line for the overview map */
  short: string;
  story: string;
  facts: [string, string][];
  goals: string[];
  frustrations: string[];
  evening: { before: string; during: string; after: string };
  /** What the product already gives this person (checked against the code) */
  today: string[];
  /** Needs the product does not meet yet – needs, not solutions */
  gaps: string[];
  /** What it looks like when the guest gets value */
  signal: string;
  /** What to ask a real guest, to check the persona */
  check: string;
  /** The rows of the comparison table */
  compare: { comesFor: string; knowledge: string; prepares: string; phone: string; moment: string; fears: string };
}

export const PERSONAS: Persona[] = [
  {
    id: 'camilla',
    name: 'Camilla Holm',
    age: 38,
    archetype: 'Den sociale gæst',
    quote: 'Jeg kommer for selskabets skyld. Vinen er en god undskyldning.',
    short: 'Kommer for selskabet og vil ikke udstilles',
    story: 'Camilla er projektleder i en kommune og har to børn i skolealderen. Hun er inviteret af en veninde og kender kun halvdelen af gæsterne. Hun glæder sig til en aften uden for hverdagen, men er lidt nervøs for at blive spurgt om, hvad hun smager.',
    facts: [
      ['Vinvaner', 'Et glas i weekenden. Køber i supermarkedet og vælger efter tilbud og etiket.'],
      ['Pris pr. flaske', '60–120 kr.'],
      ['Viden', 'Lav. Kender rød, hvid og ”den fra Spanien, vi fik i ferien”.'],
      ['Apps', 'Messenger, Instagram og MobilePay. Ingen vin-app.'],
      ['Telefonen', 'Bruger den tit, men lader den ligge i tasken ved bordet.'],
    ],
    goals: [
      'Have en god aften og lære de andre gæster at kende',
      'Føle sig med uden at skulle kunne noget',
      'Vide det praktiske: hvornår, hvor, hvad det koster, og om hun skal have noget med',
      'Kunne huske den ene vin, hun faldt for',
    ],
    frustrations: [
      'At sige noget dumt om vinen foran dem, der ved mere',
      'Fagord, der får hende til at falde fra',
      'At ende sidst på en resultattavle, som alle kan se',
      'At skulle logge ind og lære noget nyt for én aften',
    ],
    evening: {
      before: 'Svarer på invitationen fra telefonen, tjekker tid og sted og betaler. Kigger ikke på vinene. Vil helst vide, hvem der ellers kommer.',
      during: 'Smager, griner og snakker. Åbner quizzen, når værten siger til. Giver stjerner til de første vine og glemmer det så.',
      after: 'Dagen efter kan hun ikke huske navnet på vinen, hun elskede. Skriver til værten og spørger.',
    },
    today: [
      'Svar på invitationen, nedtælling, tilføj til kalender og vej til stedet',
      'Betaling med nummer, beløb og besked',
      'Quiz, resultattavle og chat',
      'Vinbogen, hvis hun selv finder den',
    ],
    gaps: [
      'Tryghed: at kunne være med i quizzen og smagningen uden at føle sig udstillet',
      'Et sprog for det, hun smager, uden fagord',
      'At huske aftenen uden selv at gøre noget for det',
    ],
    signal: 'Hun kommer ind uden hjælp fra værten, er med i quizzen til sidst og åbner sin vin igen dagen efter.',
    check: 'Hvad kan du huske fra aftenen dagen efter, og hvad ville du gerne kunne slå op?',
    compare: {
      comesFor: 'Selskabet',
      knowledge: 'Lav',
      prepares: 'Kun det praktiske',
      phone: 'Tages frem, når værten siger til',
      moment: 'Quizzen og snakken ved bordet',
      fears: 'At blive udstillet',
    },
  },
  {
    id: 'jonas',
    name: 'Jonas Rask',
    age: 31,
    archetype: 'Den nysgerrige',
    quote: 'Jeg vil gerne forstå, hvorfor den her smager, som den gør.',
    short: 'Vil blive klogere og tage det med hjem',
    story: 'Jonas er softwareudvikler og bor i en lejlighed i København. For to år siden fik han en flaske, der overraskede ham, og siden har han hørt vinpodcasts og overvejet et WSET-kursus. Han er glad for at blive inviteret, fordi han her kan smage vine, han ikke selv ville købe.',
    facts: [
      ['Vinvaner', 'Et par flasker om ugen, gerne noget nyt hver gang. Har 20 flasker i et skab.'],
      ['Pris pr. flaske', '120–250 kr. Handler både hos vinhandleren og online.'],
      ['Viden', 'På vej op. Kender druerne, men er usikker, når han skal sætte ord på smagen.'],
      ['Apps', 'Vivino, podcasts, noter på telefonen.'],
      ['Telefonen', 'I hånden hele aftenen. Skriver undervejs.'],
    ],
    goals: [
      'Forstå sammenhængen mellem område, drue, alder og smag',
      'Få et sprog for det, han smager',
      'Vide, om det han smagte, var det, de andre smagte',
      'Vælge bedre, næste gang han selv køber',
    ],
    frustrations: [
      'Smagsnoter, der er poesi uden forklaring',
      'At spørge om noget grundlæggende foran dem, der kan det hele',
      'Noter spredt mellem flere apps',
      'At aftenen er forbi, uden at han ved, hvad han skal smage bagefter',
    ],
    evening: {
      before: 'Læser alle vinene på forhånd, kigger på kortet og slår ord op, han ikke kender.',
      during: 'Giver stjerner og skriver noter til hver vin. Sammenligner to vine og ville gerne vide, om han har ret. Læser forklaringerne i quizzen, når den er slut.',
      after: 'Åbner vinbogen, læser sine noter og leder efter den næste vin at prøve, uden for appen.',
    },
    today: [
      'Vinsiden med fakta, ”Mere om vinen og producenten” og kort over hvor vinen kommer fra',
      'Stjerner og private noter til hver vin',
      'Vinbogen med søgning og sortering efter egen bedømmelse',
      'Quizzen med svar og forklaringer, når den er slut',
    ],
    gaps: [
      'At lære undervejs i aftenen, ikke kun før og efter',
      'At holde sin egen oplevelse op mod værtens eller de andres',
      'En retning videre: hvad han skal smage næste gang og hvorfor',
    ],
    signal: 'Han skriver noter til de fleste vine og kommer tilbage til vinbogen uden en ny invitation.',
    check: 'Hvad lærte du i aftes, og hvor ville du have slået det op, hvis du var i tvivl?',
    compare: {
      comesFor: 'At lære',
      knowledge: 'På vej op',
      prepares: 'Læser alle vinene',
      phone: 'I hånden hele aftenen',
      moment: 'Når to vine smages ved siden af hinanden',
      fears: 'At spørge dumt',
    },
  },
  {
    id: 'henrik',
    name: 'Henrik Vestergaard',
    age: 58,
    archetype: 'Kenderen',
    quote: 'Giv mig årgangen, producenten og en blindsmagning, der er svær.',
    short: 'Vil udfordres og diskutere med ligesindede',
    story: 'Henrik er advokat og har samlet på vin i 25 år. Han har en kælder med omkring 400 flasker, er med i en vinklub og har været i både Douro og Bourgogne. Han er ofte den, de andre spørger, og holder selv smagninger et par gange om året.',
    facts: [
      ['Vinvaner', 'Køber i kasser, en primeur og på auktion. Drikker efter en plan for kælderen.'],
      ['Pris pr. flaske', '200–1.500 kr.'],
      ['Viden', 'Høj. Kender producenter og årgange, og opdager fejl i en vintekst.'],
      ['Apps', 'CellarTracker og et regneark. Bruger ikke sociale medier til vin.'],
      ['Telefonen', 'Kommer frem til noter og point, ellers helst glasset.'],
    ],
    goals: [
      'Møde en vin, han ikke kender, og blive overrasket',
      'Blive udfordret i blindsmagning og quiz',
      'Diskutere vinene med ligesindede',
      'Have sine noter samlet ét sted, sammen med kælderen',
    ],
    frustrations: [
      'Forkerte eller overfladiske oplysninger om vinen',
      'En quiz, der er for let',
      'At få forklaret det, han allerede ved',
      'At skulle skrive sine noter to steder',
    ],
    evening: {
      before: 'Tjekker årgang og producent, medmindre vinene er blinde. Bestiller måske allerede, hvis prisen er god.',
      during: 'Skriver korte noter og giver point efter sit eget system. Vil se, hvordan de andre vurderede en vin, når den bliver afsløret. Holder øje med resultattavlen.',
      after: 'Overfører noterne til sin egen kælderapp. Tænker, at det her kunne han selv bruge i sin vinklub.',
    },
    today: [
      'Blinde vine, som værten afslører undervejs',
      'Quiz og resultattavle, også på tv',
      'Stjerner og private noter, og vinbogen sorteret efter bedst bedømt',
      'Pris, normalpris og mængdepris på vinene',
    ],
    gaps: [
      'At sammenligne sin vurdering med de andre gæsters: i dag ser kun værten gennemsnittet',
      'At bedømme mere præcist end fem stjerner',
      'At få sine noter med ud af appen',
    ],
    signal: 'Han vender tilbage til afsløringen, diskuterer resultatet med de andre og opretter selv en smagning.',
    check: 'Hvad ville få dig til at skrive dine noter her i stedet for dér, hvor du har dem nu?',
    compare: {
      comesFor: 'Udfordringen og samtalen',
      knowledge: 'Høj',
      prepares: 'Tjekker årgang og producent',
      phone: 'Til noter og point',
      moment: 'Afsløringen af de blinde vine',
      fears: 'At spilde tiden på noget overfladisk',
    },
  },
  {
    id: 'birgitte',
    name: 'Birgitte Lund',
    age: 52,
    archetype: 'Køberen',
    quote: 'Jeg smager, fordi jeg vil vide, hvad jeg skal købe.',
    short: 'Vil finde den rigtige vin og købe den til rigtig pris',
    story: 'Birgitte er økonomichef og holder ofte middage for familie og forretningsforbindelser. Hun er med i sin vinhandlers kundeklub og går til et par smagninger om året, både hos vinhandleren og hos venner. Hun ved præcis, hvad hun kan lide, men ikke altid hvorfor.',
    facts: [
      ['Vinvaner', 'Køber 6–12 flasker ad gangen til middage, gaver og fester.'],
      ['Pris pr. flaske', '150–400 kr. Holder øje med, om prisen er god.'],
      ['Viden', 'God på egen smag, mindre på teori.'],
      ['Apps', 'MobilePay og vinhandlerens webshop. Bruger Vivino en gang imellem til at huske en vin.'],
      ['Telefonen', 'Frem, når hun vil huske en vin eller bestille.'],
    ],
    goals: [
      'Finde to eller tre vine, hun vil købe',
      'Vide præcis, hvad hun betaler, også ved flere flasker',
      'Finde vinen igen måneder senere og købe mere',
      'Have styr på, hvad hun har bestilt, og om det er betalt',
    ],
    frustrations: [
      'Priser, der er svære at sammenligne',
      'At bestillingen er lukket, når hun har besluttet sig',
      'Tvivl om, hvorvidt betalingen er gået igennem',
      'Salgspres, når hun bare vil smage i ro',
    ],
    evening: {
      before: 'Ser på vine og priser og laver en kort liste over dem, hun er nysgerrig på.',
      during: 'Giver stjerner for at kunne huske dem, ser på mængdepris og lægger vine i kurven, mens hun smager.',
      after: 'Betaler og tjekker sin bestilling. Tre måneder senere skal hun bruge vinen igen og leder efter, hvor hun kan købe den.',
    },
    today: [
      'Vinens pris, normalpris og mængdepris',
      'Kurv og bestilling, mens værten har bestillingen åben',
      'Betaling med nummer, beløb og besked',
      'Vinbogens ”Køb” med det, hun har bestilt',
    ],
    gaps: [
      'At købe igen, efter aftenen er slut og bestillingen lukket',
      'Vished om, hvor hendes bestilling er: betalt, klar, hentet',
      'At se sine bedste vine sammen med prisen, når hun skal beslutte sig',
    ],
    signal: 'Hun bestiller flere flasker på aftenen og kommer tilbage for at købe igen.',
    check: 'Sidste gang du købte en vin efter en smagning, hvordan fandt du den så igen?',
    compare: {
      comesFor: 'At finde vin at købe',
      knowledge: 'God på egen smag',
      prepares: 'Ser på vine og priser',
      phone: 'Til at huske og bestille',
      moment: 'Når hun lægger vinen i kurven',
      fears: 'At købe forkert eller miste overblikket',
    },
  },
];
