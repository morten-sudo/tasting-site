// The hosts' help: the sections of /admin/help/ and the short tips behind the "?" buttons in admin.
// Written in Danish and English; the other languages show the English text until they are translated.
import { lang } from '../i18n';

type Text = { da: string; en: string };
export type HelpSection = { id: string; title: Text; body: Text };

/** The text in the reader's language: Danish for Danish, English for everyone else (for now) */
export const pick = (x: Text) => (lang() === 'da' ? x.da : x.en);

export const HELP: HelpSection[] = [
  {
    id: 'start',
    title: { da: 'Kom godt i gang', en: 'Getting started' },
    body: {
      da: `<p>Sådan går du fra tom konto til en smagning med inviterede gæster:</p>
<ol>
<li><b>Læg vinene ind.</b> Gå til <a href="/admin/wines/?open=wine-add-toggle">Vine → Ny vin</a> og skriv navnet, indsæt et link til butikken eller vælg et billede af etiketten – med link eller billede udfyldes det meste af sig selv. Se <a href="#wines">Vine</a>.</li>
<li><b>Opret smagningen.</b> Tryk <a href="/admin/tastings/?new=1">Ny smagning</a>, og udfyld titel, dato, start- og evt. sluttid, maks. antal gæster, sted og introduktion – kun titlen skal udfyldes. Tryk <i>Opret smagning</i>, så kommer du til smagningens side, hvor kortet <i>Kom i gang</i> viser de næste skridt med ✓ ved det, der er klaret – og en knap ved det, du skal gøre nu.</li>
<li><b>Vælg vinene.</b> Under smagningens fane <a href="t:wines/?open=tw-add-toggle">Vine → Tilføj vin</a> skriver du navnet på en vin fra dit bibliotek og trykker <i>Tilføj</i> – eller indsætter et link eller et billede for en ny. Bagefter sætter du rækkefølgen og gæsteprisen.</li>
<li><b>Inviter gæsterne.</b> Tryk <a href="t:guests/?open=g-invite-toggle">Gæster → Inviter gæst</a>. Gæster med e-mail får invitationen på mail; ellers kopierer du deres personlige link og sender det selv.</li>
<li><b>Følg svarene</b> under <a href="t:guests/">Gæster</a>. Du ser, hvem der kommer, hvem der ikke har svaret, og hvem der står på venteliste – og hvornår hver gæst sidst var inde: loggede ind eller åbnede sit invitationslink.</li>
<li><b>På aftenen</b> åbner du for bestillinger under <a href="t:orders/">Bestillinger</a> og for quizzen under <a href="t:quiz/">Quiz</a>, når det passer – og afslører vinene, hvis det er en blindsmagning.</li>
</ol>
<h2 id="feedback">Gemt, slettet og spurgt først</h2>
<p>Du retter altid i panelet fra højre: blyanten (<i>Rediger</i>) ændrer noget, tandhjulet (<i>Administrer</i>) fører dig hen, hvor det styres – fx fra smagningens egen side til dens admin. Når du gemmer, sletter eller kopierer et link, siger en kort besked nederst på skærmen, at det er sket – efter en sletning med <i>Fortryd</i> i nogle sekunder. Sletter du noget (en vin, et spørgsmål, en gæst, en mængdepris eller et svar med tekst), bliver du spurgt først. Lukker du et panel, hvor du har rettet noget uden at gemme, spørger vi, om ændringerne skal kasseres.</p>`,
      en: `<p>From an empty account to a tasting with invited guests:</p>
<ol>
<li><b>Add the wines.</b> Go to <a href="/admin/wines/?open=wine-add-toggle">Wines → New wine</a> and type the name, paste a link to the shop or choose a photo of the label – with a link or a photo most of it fills itself in. See <a href="#wines">Wines</a>.</li>
<li><b>Create the tasting.</b> Press <a href="/admin/tastings/?new=1">New tasting</a> and fill in the title, date, start and optional end time, max number of guests, place and introduction – only the title is needed. Press <i>Create tasting</i> and you come to the tasting's page, where the <i>Get started</i> card shows the next steps with ✓ by what is done – and a button by what to do now.</li>
<li><b>Choose the wines.</b> On the tasting's <a href="t:wines/?open=tw-add-toggle">Wines → Add wine</a>, type the name of a wine in your library and press <i>Add</i> – or paste a link or a photo for a new one. Then set their order and the guest price.</li>
<li><b>Invite the guests.</b> Press <a href="t:guests/?open=g-invite-toggle">Guests → Invite guest</a>. Guests with an email get the invitation by email; for the others, copy their personal link and send it yourself.</li>
<li><b>Follow the replies</b> under <a href="t:guests/">Guests</a>. You see who is coming, who has not replied and who is on the waiting list – and when each guest was last here: signed in or opened their invitation link.</li>
<li><b>On the evening</b>, open ordering under <a href="t:orders/">Orders</a> and the quiz under <a href="t:quiz/">Quiz</a> when it suits you – and reveal the wines if it is a blind tasting.</li>
</ol>
<h2 id="feedback">Saved, deleted and asked first</h2>
<p>You always edit in the panel from the right: the pencil (<i>Edit</i>) changes something, the gear (<i>Manage</i>) takes you to where it is managed – e.g. from the tasting’s own page to its admin. When you save, delete or copy a link, a short message at the bottom of the screen says it is done – after deleting, with <i>Undo</i> for a few seconds. When you delete something (a wine, a question, a guest, a quantity price or an answer with text), you are asked first. When you close a panel where you changed something without saving, you are asked whether to discard the changes.</p>`,
    },
  },
  {
    id: 'tastings',
    title: { da: 'Smagninger', en: 'Tastings' },
    body: {
      da: `<p>En smagning har sin egen side med faner: <a href="t:">Overblik</a>, <a href="t:wines/">Vine</a>, <a href="t:guests/">Gæster</a>, <a href="t:orders/">Bestillinger</a>, <a href="t:quiz/">Quiz</a>, <a href="t:chat/">Chat</a> og <a href="t:settings/">Indstillinger</a>. Se alle under <a href="/admin/tastings/">Smagninger</a>. Alle værter på kontoen kan se og rette alle smagninger. Er der smagninger, du ikke selv er vært for, vælger filterknappen over listen mellem <i>Jeg er vært</i> og <i>Alle</i> – med antallet ved hver.</p>
<h2>Detaljer</h2>
<p>Under <a href="t:?open=details-edit">Overblik → Detaljer → Rediger</a>: titel, dato og tid, sted (adressen slås op, mens du skriver) og smagningens sprog. Introduktionen til gæsterne har sit eget afsnit: <a href="t:?open=intro-edit">Overblik → Introduktion → Rediger</a>. Sproget bestemmer bl.a. sproget i invitationsmails.</p>
<h2 id="ai-intro">Introduktion skrevet med AI</h2>
<p>Tryk <i>Skriv et udkast med AI</i> under introduktionen. Cloudflares AI skriver et udkast ud fra smagningens vine – fx en rejse gennem én region, en tur på tværs af lande eller en drue som tema – og blinde vine bliver ikke afsløret. Udkastet vises <b>under</b> din egen tekst: <i>Brug udkastet</i> sætter det ind i feltet (med <i>Fortryd</i>, der henter din tekst tilbage), <i>Prøv igen</i> giver et nyt, og <i>Kassér</i> fjerner det. Intet gemmes, før du trykker <i>Gem</i>. Et udkast tager op til ca. 20 sekunder. Tjek altid teksten – AI kan finde på ting.</p>
<h2 id="delete-tasting">Slet en smagning</h2>
<p>Nederst under <a href="t:settings/#delete-tasting">Indstillinger → Slet smagningen</a>. Kun den, der oprettede smagningen, og kontoens ejer kan slette den. Gæsteliste, svar, bestillinger, quiz og chat forsvinder; vinene bliver i biblioteket.</p>
<h2 id="controls"><a href="t:settings/#controls">Gæsterne kan</a></h2>
<p>Øverst under <a href="t:settings/">Indstillinger</a> slår du <b>Svare på invitationen</b> til og fra – gæsterne kan svare ja eller nej. Det gemmes med det samme. Kontakterne til quizzen og linket til pointtavlen på tv’et ligger under <a href="t:quiz/#quiz-controls">Quiz</a> (se <a href="#evening">Under aftenen</a>).</p>
<p>Under <i>Smagningen</i> finder du <b>Blindsmagning</b> (se <a href="#blind">Blindsmagning</a>) og maks. antal gæster.</p>
<h2 id="max-guests"><a href="t:settings/#max-guests">Max antal gæster og venteliste</a></h2>
<p>Tryk på blyanten (<i>Rediger</i>) ved <i>Maks. antal gæster</i>, og skriv et tal. Når smagningen er fuld, kommer gæster, der siger ja, på venteliste i den rækkefølge, de svarede. Melder en, der kommer, fra – eller hæver du loftet – rykker den første på ventelisten automatisk op. Tomt felt betyder intet loft. Gæsterne ser ikke, hvor mange pladser der er tilbage.</p>
<h2>Medværter</h2>
<p>På smagningens <a href="t:#hosts">Overblik → Værter</a> trykker du <i>Tilføj vært</i> og skriver e-mailen. De får en mail (er den ikke kommet, kan de logge ind på <a href="/login/">log ind-siden</a> med e-mailen og lander i smagningen) og kan rette smagningen, vinene og gæsterne, men ikke slette smagningen eller styre værterne. Har medværten sin egen konto, står smagningen under <i>Delt med mig</i> i deres menu. Skal de se hele kontoen, så <a href="/admin/account/?open=member-open">tilføj dem til kontoen</a> i stedet.</p>
<h2 id="fee"><a href="t:settings/#fee">Deltagergebyr</a></h2>
<p>Tryk på blyanten (<i>Rediger</i>) under <i>Betaling for smagningen</i>, og skriv, hvad smagningen koster i alt – så foreslås et beløb pr. gæst ud fra antallet, der kommer. Skriver du selv et beløb pr. gæst, er det en fast pris. Gæsterne får at vide, hvordan prisen er fundet: delt ud fra, hvad aftenen koster, eller den samme pris for alle. Slå <i>Vis gebyret for gæsterne</i> til, når de skal se det. Du markerer selv, hvem der har betalt.</p>`,
      en: `<p>A tasting has its own page with tabs: <a href="t:">Overview</a>, <a href="t:wines/">Wines</a>, <a href="t:guests/">Guests</a>, <a href="t:orders/">Orders</a>, <a href="t:quiz/">Quiz</a>, <a href="t:chat/">Chat</a> and <a href="t:settings/">Settings</a>. See them all under <a href="/admin/tastings/">Tastings</a>. Every host on the account can see and edit every tasting. When there are tastings you do not host yourself, the filter button above the list chooses between <i>I host</i> and <i>All</i> – with the number by each.</p>
<h2>Details</h2>
<p>Under <a href="t:?open=details-edit">Overview → Details → Edit</a>: title, date and time, place (the address is looked up as you type) and the tasting's language. The introduction for the guests has a section of its own: <a href="t:?open=intro-edit">Overview → Introduction → Edit</a>. The language decides, among other things, the language of the invitation emails.</p>
<h2 id="ai-intro">Introduction written with AI</h2>
<p>Press <i>Write a draft with AI</i> under the introduction. Cloudflare's AI writes a draft from the tasting's wines – e.g. a journey through one region, a tour across countries or a grape as the theme – and blind wines are not given away. The draft is shown <b>below</b> your own text: <i>Use the draft</i> puts it in the field (with <i>Undo</i>, which brings your text back), <i>Try again</i> gives a new one, and <i>Discard</i> removes it. Nothing is saved until you press <i>Save</i>. A draft takes up to about 20 seconds. Always check the text – AI can make things up.</p>
<h2 id="delete-tasting">Deleting a tasting</h2>
<p>At the bottom of <a href="t:settings/#delete-tasting">Settings → Delete the tasting</a>. Only the one who created the tasting and the account's owner can delete it. Guest list, replies, orders, quiz and chat go; the wines stay in the library.</p>
<h2 id="controls"><a href="t:settings/#controls">The guests can</a></h2>
<p>At the top of <a href="t:settings/">Settings</a> you switch <b>Reply to the invitation</b> on and off – guests can reply yes or no. It is saved at once. The quiz switches and the link to the leaderboard for the TV are under <a href="t:quiz/#quiz-controls">Quiz</a> (see <a href="#evening">During the evening</a>).</p>
<p>Under <i>The tasting</i> you find <b>Blind tasting</b> (see <a href="#blind">Blind tasting</a>) and the max number of guests.</p>
<h2 id="max-guests"><a href="t:settings/#max-guests">Max number of guests and the waiting list</a></h2>
<p>Press the pencil (<i>Edit</i>) by <i>Max. number of guests</i> and enter a number. When the tasting is full, guests who say yes go on the waiting list in the order they replied. When someone who is coming drops out – or you raise the limit – the first on the list moves up automatically. An empty field means no limit. Guests do not see how many places are left.</p>
<h2>Co-hosts</h2>
<p>On the tasting's <a href="t:#hosts">Overview → Hosts</a> press <i>Add host</i> and enter the email. They get an email (if it has not arrived, they can sign in on the <a href="/login/">sign-in page</a> with that email and land in the tasting) and can edit the tasting, its wines and guests, but cannot delete the tasting or manage its hosts. If the co-host has an account of their own, the tasting is under <i>Shared with me</i> in their menu. If they should see the whole account, <a href="/admin/account/?open=member-open">add them to the account</a> instead.</p>
<h2 id="fee"><a href="t:settings/#fee">Tasting fee</a></h2>
<p>Press the pencil (<i>Edit</i>) under <i>Tasting fee</i> and enter what the tasting costs in all – an amount per guest is suggested from the number who are coming. If you type an amount per guest yourself, it is a fixed price. The guests are told how the price was found: shared from what the evening costs, or the same price for everyone. Turn on <i>Show the fee to the guests</i> when they should see it. You mark yourself who has paid.</p>`,
    },
  },
  {
    id: 'wines',
    title: { da: 'Vine', en: 'Wines' },
    body: {
      da: `<p>Dit vinbibliotek under <a href="/admin/wines/">Vine</a> deles af alle værter på kontoen, og en vin kan bruges i mange smagninger.</p>
<h2 id="filter-wines">Find dine vine</h2>
<p>Over listen kan du <a href="/admin/wines/">filtrere</a> på <b>land</b>, <b>region</b>, <b>type</b> og <b>smagning</b> – og søge i fritekst. Hvert filter er en knap med en liste af flueben, ligesom filteret på gæstelisten: <i>Alle</i> sætter flueben ved alt; fjerner du ét, ryger fluebenet ved <i>Alle</i>, og du kan vælge flere på én gang (fx Frankrig og Italien). Regionerne følger landene: vælger du lande, ses kun deres regioner. Under smagning kan du også vælge <i>Ikke med i nogen smagning</i>. Tallet ud for hver er antallet af vine, knappen viser hvad der er valgt, og <i>Nulstil filtre</i> viser alle igen. Filtrene står i adressen, så de er der stadig, når du går tilbage fra en vin.</p>
<h2 id="new-wine">Ny vin</h2>
<p>Tryk <a href="/admin/wines/?open=wine-add-toggle">Ny vin</a> (under Vine eller på Overblik). Øverst i listen glider en ny række ind, hvor du kan:</p>
<ul>
<li><b>Skrive navnet</b> – mens du skriver, vises vine i dit bibliotek med samme navn, så du ikke laver en kopi. Tryk <i>Tilføj</i> for at oprette en ny med det navn; et årstal i navnet bliver vinens årgang. Vinens side tilbyder bagefter at hente resten fra et link eller et billede.</li>
<li><b>Indsætte et link til en butik</b> – navn, type, årgang, oprindelse, beskrivelse, priser, druer, "passer til", servering og billede hentes fra siden. Billedet gemmes hos os sammen med vinen, så det ikke forsvinder, hvis butikken ændrer sin side. Priser i euro regnes om til kroner med den faste kurs 7,46, og ved prisen står der, hvad den er regnet om fra – fx <i>Regnet om fra 12,97 € (kurs 7,46)</i> – både i vinens panel og på vinens side. Du kan rette prisen med blyanten (<i>Rediger</i>); skriver du en anden pris, forsvinder linjen. Viser butikken prisen i en anden valuta, fx dollar, står prisen tom, og ved den står butikkens pris (fx <i>Butikkens pris er 19,50 US$</i>), så du selv kan skrive prisen i kroner.</li>
<li><b>Vælge et billede af etiketten</b> (eller trække det ind eller indsætte det) – navn, producent, årgang, type m.m. læses fra billedet.</li>
</ul>
<p>Med link eller billede kommer der en række i listen, hvor du kan se, hvad der kommer ind – til sidst producentens hjemmeside og adresse. Så glider vinen ind øverst i listen og lyser op (efter en genindlæsning står den på sin plads efter navn), og der står en kort besked nederst. Du kan tilføje flere vine i træk, mens rækkerne arbejder. Kan siden eller etiketten ikke læses, står det i rækken, og <i>Skriv navnet</i> lader dig skrive navnet selv – linket eller billedet gemmes stadig med vinen. Den samme vin (samme navn, årgang og flaskestørrelse) kan ikke ligge i biblioteket to gange – har du den allerede, foreslås den i stedet. Er det en anden årgang, så skriv årstallet efter navnet, fx <i>Barolo 2019</i>; er det en magnum, så skriv det, fx <i>Barolo 2019 Magnum</i> (se <a href="#bottle-size">Flaskestørrelse</a>).</p>
<p>Tjek altid vinen bagefter med blyanten (<i>Rediger</i>) – det automatiske er et godt udgangspunkt, ikke en garanti. Kun <b>navnet</b> skal være der; resten kan du tilføje senere. Er noget skrevet forkert, fx en årgang uden tal eller en pris, der ikke er et tal, står det med rødt lige under feltet. Priser og alkohol må skrives med komma eller punktum. Et <i>tilbud i butikken</i> kan gælde ved køb af 1 flaske (en lavere stykpris) eller flere: når vinen kommer i en smagning, bliver et tilbud på 1 flaske gæsteprisen, og et tilbud på flere flasker bliver mængdeprisen. Er vinen hentet fra et link, står der <i>Hentet fra … (dato)</i>, og du kan hente igen med opdater-ikonet. Er billedet forkert (fx bagetiketten), kan du vælge et andet.</p>
<h2 id="bottle-size">Flaskestørrelse</h2>
<p>Hver vin har en flaskestørrelse – 75 cl, hvis du ikke vælger andet. Åbn vinen, tryk på blyanten (<i>Rediger</i>), og vælg under <i>Flaskestørrelse</i> mellem 37,5 cl (halv flaske), 75 cl, 150 cl (magnum) og 300 cl (dobbelt magnum) – eller <i>Anden</i>, hvor du skriver størrelsen i cl, fx 50 eller 62,5 (mellem 5 og 3000 cl). Står størrelsen i navnet, på butikkens side eller på etiketten (fx <i>Magnum</i>, <i>150 cl</i>, <i>1,5 l</i>, <i>375 ml</i>, <i>Jeroboam</i> eller <i>halv flaske</i>), sættes den af sig selv, og ordet fjernes fra navnet. En jeroboam regnes som 300 cl. Er størrelsen ikke 75 cl, står den ved vinen i dine lister, på vinens side, hos gæsterne og i kurven og bestillingerne – så en magnum ikke ligner en almindelig flaske. Prisen er altid pr. flaske af den størrelse.</p>
<h2 id="delete-wine">Slet en vin</h2>
<p>Åbn vinen, tryk på blyanten (<i>Rediger</i>) og så <i>Slet vin</i> nederst. Du bliver spurgt først, og bagefter kan du trykke <i>Fortryd</i> i nogle sekunder. En vin, som gæster har bestilt, kan ikke slettes – fjern den fra smagningen i stedet.</p>
<h2>Producent og kort</h2>
<p>Producentens hjemmeside og adresse findes automatisk, mens du skriver. Adressen placeres som en nål på kortet, når den kan findes præcist. Oprindelse (land, region, appellation) farver regionen på kortet – for Bordeaux, Douro, Bourgogne, Champagne, Roussillon, Rhône, Toscana, Piemonte, Rioja og Mosel på et detaljeret kort. Kortet viser altid hele regionen med grænser mellem områderne: vinens appellation er stærkest, og det område, den ligger i, er lysere (fx Médoc for en Pauillac, Côte de Nuits for en Gevrey-Chambertin) – det finder sitet selv. Kortet i vinens panel er det samme som under <i>Oprindelse</i> på vinens side – samme størrelse, byer og zoom – og det skifter, mens du skriver oprindelsen. Har vinen kun en region, er hele regionen markeret; kan appellationen ikke farves ind, står den som en nål med navnet. Kommer en smagnings vine fra flere regioner, får kortet på <a href="g:">smagningens side</a> en fane pr. region med antallet af vine – det er feltet <i>region</i>, der tæller, ikke underregionen. En vin uden region kommer ikke på kortet (den står stadig i vinlisten), og en blind vin kommer først med, når du afslører den.</p>
<h2>Billede</h2>
<p>Tryk <i>Vælg et billede</i>, træk et billede ind på feltet, eller indsæt et, du har kopieret (⌘V / Ctrl+V). Skraldespanden fjerner billedet. Tryk <i>Find et officielt billede</i> for at hente producentens eget flaskebillede.</p>
<h2 id="tasting-wines">Vinene i en smagning</h2>
<p>På smagningen tilføjer du vine med <a href="t:wines/?open=tw-add-toggle">Vine → Tilføj vin</a>: skriv navnet, og vine fra dit bibliotek vises med <i>Tilføj</i>. Et link eller et billede opretter en ny vin, som kommer både i biblioteket og i smagningen – på samme måde som under <a href="#new-wine">Ny vin</a>.</p>
<p>På smagningens fane <a href="t:wines/">Vine</a> står vinene i den rækkefølge, de skænkes, med pris, hvad gæsterne ser (<i>Synlig</i>, <i>Blind</i> eller <i>Skjult</i>), om de kan bestilles, og gæsternes gennemsnitlige karakter. En ny vin lægges øverst. Træk i grebet (de seks prikker) foran nummeret for at ændre rækkefølgen – med mus eller finger. Med tastaturet: gå til grebet med Tab og flyt vinen med ↑ og ↓. Gæsteprisen gælder kun for den smagning – den samme vin kan have en anden pris i en anden smagning, og butikkens pris i biblioteket er kun det, en ny smagning starter med. I vinens panel i biblioteket står gæsteprisen i hver smagning under butikkens priser – blyanten (<i>Rediger</i>) ved smagningen åbner vinen der. Har en vin ingen pris endnu, får den butiksprisen (eller tilbudsprisen på 1 flaske), så snart du giver vinen en pris i biblioteket. Tryk på blyanten (<i>Rediger</i>) ved en vin for at sætte gæsteprisen, butiksprisen (den gemmes på vinen i biblioteket), mængdepriser (antal flasker med − og +, fx "fra 6 flasker 249,95 kr. pr. stk." – aldrig højere end gæsteprisen), hvad gæsterne ser, og om den kan bestilles. Vinens navn åbner dens side i biblioteket med oprindelse, kort og beskrivelse. Skraldespanden i rækken fjerner vinen fra smagningen – den bliver i dit bibliotek; du bliver spurgt først og kan trykke <i>Fortryd</i> bagefter. En blind vin har sit eget øje-ikon (<i>Afslør</i>) i listen. En blind eller skjult vin kan ikke bestilles, så den får ikke chippen <i>Kan bestilles</i> – den kan bestilles, når du viser den.</p>`,
      en: `<p>Your wine library under <a href="/admin/wines/">Wines</a> is shared by all hosts on the account, and a wine can be used in many tastings.</p>
<h2 id="filter-wines">Finding your wines</h2>
<p>Above the list you can <a href="/admin/wines/">filter</a> by <b>country</b>, <b>region</b>, <b>type</b> and <b>tasting</b> – and search in free text. Each filter is a button with a list of ticks, like the filter on the guest list: <i>All</i> ticks everything; untick one and <i>All</i> is unticked, and you can choose several at once (e.g. France and Italy). The regions follow the countries: choose countries and only their regions are shown. Under tasting you can also choose <i>Not in any tasting</i>. The number next to each is the number of wines, the button shows what is chosen, and <i>Clear filters</i> shows them all again. The filters are kept in the address, so they are still there when you go back from a wine.</p>
<h2 id="new-wine">New wine</h2>
<p>Press <a href="/admin/wines/?open=wine-add-toggle">New wine</a> (under Wines or on the Overview). A new row slides in at the top of the list, where you can:</p>
<ul>
<li><b>Type the name</b> – as you type, wines in your library with the same name are shown, so you do not make a copy. Press <i>Add</i> to create a new one with that name; a year in the name becomes the vintage. The wine’s page then offers to fetch the rest from a link or a photo.</li>
<li><b>Paste a link to a shop</b> – name, type, vintage, origin, description, prices, grapes, "goes with", serving and picture are fetched from the page. The picture is stored with the wine, so it does not vanish if the shop changes its page. Prices in euro are converted to kroner at the fixed rate 7.46, and the price says what it was converted from – e.g. <i>Converted from 12,97 € (rate 7,46)</i> – in the wine's panel and on the wine's page. You can correct the price with the pencil (<i>Edit</i>); if you type another price, the line goes. If the shop shows the price in another currency, e.g. dollars, the price is left empty and the shop's price is shown by it (e.g. <i>The shop's price is 19,50 US$</i>), so you can type the price in kroner yourself.</li>
<li><b>Choose a photo of the label</b> (or drag it in or paste it) – name, producer, vintage, type and more are read from the photo.</li>
</ul>
<p>With a link or a photo, a row in the list shows what comes in – last the producer's website and address. Then the wine moves into the top of the list and lights up (after a reload it is in its place by name), and a short message shows at the bottom. You can add more wines in a row while the rows work. If the page or the label cannot be read, the row says so, and <i>Type the name</i> lets you type the name yourself – the link or photo is still saved with the wine. The same wine (same name, vintage and bottle size) cannot be in the library twice – if you already have it, it is suggested instead. For another vintage, type the year after the name, e.g. <i>Barolo 2019</i>; for a magnum, say so, e.g. <i>Barolo 2019 Magnum</i> (see <a href="#bottle-size">Bottle size</a>).</p>
<p>Always check the wine afterwards with the pencil (<i>Edit</i>) – the automatic part is a good start, not a guarantee. Only the <b>name</b> is needed; the rest you can add later. If something is written wrong, e.g. a vintage without a number or a price that is not a number, it says so in red right under the field. Prices and alcohol can be written with a comma or a point. A <i>shop offer</i> can be for 1 bottle (a lower price each) or more: when the wine goes into a tasting, an offer on 1 bottle becomes the guest price, and an offer on several becomes the quantity price. A wine fetched from a link says <i>Fetched from … (date)</i>, and the refresh icon fetches it again. If the picture is wrong (e.g. the back label), you can choose another.</p>
<h2 id="bottle-size">Bottle size</h2>
<p>Every wine has a bottle size – 75 cl unless you choose another. Open the wine, press the pencil (<i>Edit</i>), and under <i>Bottle size</i> choose 37.5 cl (half bottle), 75 cl, 150 cl (magnum) or 300 cl (double magnum) – or <i>Other</i>, where you type the size in cl, e.g. 50 or 62.5 (between 5 and 3000 cl). When the size is in the name, on the shop's page or on the label (e.g. <i>Magnum</i>, <i>150 cl</i>, <i>1.5 l</i>, <i>375 ml</i>, <i>Jeroboam</i> or <i>half bottle</i>), it is set by itself and the word is taken out of the name. A jeroboam counts as 300 cl. When the size is not 75 cl, it is shown with the wine in your lists, on the wine's page, to the guests and in the cart and the orders – so a magnum does not look like an ordinary bottle. The price is always per bottle of that size.</p>
<h2 id="delete-wine">Deleting a wine</h2>
<p>Open the wine, press the pencil (<i>Edit</i>) and then <i>Delete wine</i> at the bottom. You are asked first, and afterwards you can press <i>Undo</i> for a few seconds. A wine that guests have ordered cannot be deleted – remove it from the tasting instead.</p>
<h2>Producer and map</h2>
<p>The producer's website and address are found automatically as you type. The address is placed as a pin on the map when it can be found exactly. The origin (country, region, appellation) colours the region on the map – for Bordeaux, Douro, Bourgogne, Champagne, Roussillon, the Rhône, Tuscany, Piedmont, Rioja and the Mosel on a detailed map. The map always shows the whole region with the borders between its areas: the wine's appellation is strongest, and the area it lies in is lighter (e.g. the Médoc for a Pauillac, the Côte de Nuits for a Gevrey-Chambertin) – the site works that out itself. The map in the wine's panel is the same as under <i>Origin</i> on the wine's page – same size, towns and zoom – and it changes as you type the origin. A wine with only a region marks the whole region; an appellation the map cannot fill is shown as a pin with its name. When a tasting's wines come from several regions, the map on <a href="g:">the tasting's page</a> gets a tab per region with the number of wines – it is the <i>region</i> field that counts, not the sub-region. A wine without a region is not on the map (it is still in the wine list), and a blind wine only comes on once you reveal it.</p>
<h2>Picture</h2>
<p>Press <i>Choose a picture</i>, drag a picture onto the box, or paste one you have copied (⌘V / Ctrl+V). The trash removes the picture. Press <i>Find an official picture</i> to fetch the producer's own bottle shot.</p>
<h2 id="tasting-wines">The wines in a tasting</h2>
<p>In a tasting you add wines with <a href="t:wines/?open=tw-add-toggle">Wines → Add wine</a>: type the name, and wines from your library are shown with <i>Add</i>. A link or a photo creates a new wine that goes into both the library and the tasting – the same way as under <a href="#new-wine">New wine</a>.</p>
<p>On the tasting's <a href="t:wines/">Wines</a> tab the wines are listed in the order they are poured, with price, what the guests see (<i>Shown</i>, <i>Blind</i> or <i>Hidden</i>), whether they can be ordered, and the guests' average rating. A new wine goes first. Drag the grip (the six dots) in front of the number to change the order – with the mouse or a finger. With the keyboard: Tab to the grip and move the wine with ↑ and ↓. The guest price applies to that tasting only – the same wine can have another price in another tasting, and the shop price in the library is only what a new tasting starts with. In the wine's panel in the library the guest price in each tasting is shown under the shop's prices – the pencil (<i>Edit</i>) by a tasting opens the wine there. A wine without a price yet gets the shop price (or the offer price on 1 bottle) as soon as you give the wine a price in the library. Press the pencil (<i>Edit</i>) by a wine to set the guest price, the shop price (saved on the wine in the library), quantity prices (the number of bottles with − and +, e.g. "from 6 bottles 249.95 kr. each" – never higher than the guest price), what the guests see, and whether it can be ordered. The wine’s name opens its page in the library with origin, map and description. The trash in the row removes the wine from the tasting – it stays in your library; you are asked first and can press <i>Undo</i> afterwards. A blind wine has its own eye icon (<i>Reveal</i>) in the list. A blind or hidden wine cannot be ordered, so it does not get the <i>Can be ordered</i> chip – it can be ordered once you show it.</p>`,
    },
  },
  {
    id: 'blind',
    title: { da: 'Blindsmagning', en: 'Blind tasting' },
    body: {
      da: `<p>En blind vin vises for gæsterne kun som sit nummer – "Vin 3" med et neutralt billede. Stil, farve, navn, producent, årgang, oprindelse, billede, pris og noter vises ikke – de sendes slet ikke til gæsternes telefoner. Når du afslører vinen, ser gæsterne det hele. Gæsterne kan give karakter og skrive noter, men ikke bestille vinen.</p>
<ul>
<li><b>Hele smagningen:</b> slå <a href="t:settings/#controls">Blindsmagning</a> til under kontakterne. Alle vine bliver blinde, og vine du tilføjer senere starter blinde.</li>
<li><b>Enkelte vine:</b> tryk på blyanten (<i>Rediger</i>) ved vinen under <a href="t:wines/">Vine</a>, og vælg <i>Blind</i> under <i>Gæsterne ser</i>.</li>
<li><b>Afslør:</b> tryk <i>Afslør</i> ved vinen under <a href="t:wines/">Vine</a> – i den rækkefølge, der passer aftenen. Gæsternes skærme skifter selv til den rigtige vin inden for ca. 15 sekunder.</li>
</ul>`,
      en: `<p>Guests see a blind wine only as its number – "Wine 3" with a neutral picture. Style, colour, name, producer, vintage, origin, picture, price and notes are not shown – they are not even sent to the guests' phones. When you reveal the wine, the guests see all of it. Guests can rate it and write notes, but cannot order it.</p>
<ul>
<li><b>The whole tasting:</b> turn on <a href="t:settings/#controls">Blind tasting</a> under the controls. All wines become blind, and wines you add later start blind.</li>
<li><b>Single wines:</b> press the pencil (<i>Edit</i>) by the wine under <a href="t:wines/">Wines</a> and choose <i>Blind</i> under <i>Guests see</i>.</li>
<li><b>Reveal:</b> press <i>Reveal</i> on the wine under <a href="t:wines/">Wines</a> – in whatever order suits the evening. The guests' screens switch to the real wine by themselves within about 15 seconds.</li>
</ul>`,
    },
  },
  {
    id: 'guests',
    title: { da: 'Gæster og invitationer', en: 'Guests and invitations' },
    body: {
      da: `<p>Dit gæstebibliotek under <a href="/admin/guests/">Gæster</a> deles af kontoens værter, så du kan invitere de samme gæster igen. <a href="/admin/guests/?open=add-toggle">Tilføj en gæst</a> til biblioteket: øverst i listen glider en ny række ind med navn og e-mail. Blyanten retter en gæst, og skraldespanden sletter den – du bliver spurgt først, og bagefter kan du trykke <i>Fortryd</i> i nogle sekunder. En gæst, der er inviteret, fjernes også fra de smagninger.</p>
<h2 id="guest-page">En gæsts egen side</h2>
<p>Tryk på gæstens navn i <a href="/admin/guests/">gæstelisten</a> for at se gæstens side (adressen er gæstens navn, fx /admin/guests/anna-holm/; to gæster med samme navn får -2 bagpå). Øverst står e-mail og hvornår gæsten sidst var inde (loggede ind eller åbnede invitationslinket). Under <i>Smagninger</i> ser du hver af kontoens smagninger, gæsten er inviteret til: svar, betalt gebyr, kost-hensyn, note og om invitationen er sendt på mail – navnet fører til smagningens gæster. <i>Aktivitet</i> viser i én liste, nyeste først, hvad gæsten har gjort: svar, bestillinger (flasker, beløb, betalt), bedømmelser, quizsvar, chatbeskeder og log-ind. <i>Roller på kontoen</i> viser, om gæsten (ud fra e-mailen) også er vært eller ejer på kontoen eller medvært ved en af dens smagninger. Siden viser kun det, der hører til den konto, du arbejder i – aldrig noget fra andre konti. Blyanten (<i>Rediger</i>) øverst åbner det samme panel som blyanten i listen.</p>
<h2 id="invite">Inviter</h2>
<p>Tryk <a href="t:guests/?open=g-invite-toggle">Gæster → Tilføj gæst</a> på smagningen. Øverst i listen glider en ny række ind: skriv navnet, og gæster fra din gæsteliste vises med en knap. En ny gæst skriver du med navn og e-mail (e-mail er valgfri) og trykker Enter eller knappen. Er <i>Send invitationen på mail</i> slået til, og har gæsten en e-mail, hedder knappen <i>Tilføj og inviter</i> – så sendes invitationen med det samme. Ellers hedder den <i>Tilføj</i>. Den nye gæst kommer også i din gæsteliste. Har du allerede gæsten (samme e-mail eller navn), er det den, der tilføjes; er gæsten allerede med, står der <i>✓ Tilføjet</i>. Rækken bliver åben, så du kan tilføje flere i træk; × lukker den.</p>
<h2 id="invite-mail">Invitation på mail – eller link</h2>
<p>Med <i>Send invitationen på mail</i> (under felterne i rækken) slået til får gæster med e-mail en mail med tid, sted og en knap til deres personlige invitation. Svarer gæsten på mailen, går svaret til dig. Under hver gæst står, hvornår invitationen blev sendt. Hver gæst med e-mail har et ✉-ikon i rækken, der sender invitationen – er den sendt før, bliver du spurgt, om den skal sendes igen. Link-ikonet ved hver gæst kopierer gæstens personlige link.</p>
<p>Uden e-mail: tryk på link-ikonet i rækken og send linket selv, fx på sms. Linket er personligt – det er gæstens adgang til smagningen.</p>
<h2>Svar</h2>
<p>Gæsten svarer ja eller nej og kan skrive kost-hensyn og en note. Under <a href="t:guests/">Gæster</a> står hver gæst på en række som vinene: status, <i>Betalt</i>/<i>Ikke betalt</i> når der er gebyr, kost-hensyn, en besked og hvor mange flasker gæsten har bestilt. Med filterknappen ved siden af <i>Tilføj gæst</i> vælger du, hvem der vises: <i>Alle</i> sætter flueben ved <i>Kommer, Venteliste, Ikke svaret endnu</i> og <i>Kommer ikke</i>; fjerner du et af dem, ryger fluebenet ved <i>Alle</i>. <i>Mangler e-mail</i> viser kun dem uden e-mail blandt de valgte. Knappen viser, hvad der er valgt, og hvor mange det er. Blyanten (<i>Rediger</i>) åbner sidepanelet, hvor du sender invitationen, ændrer status, markerer gebyret betalt, retter e-mail – eller fjerner gæsten fra smagningen. Skraldespanden i rækken fjerner også gæsten fra smagningen (gæsten bliver i din gæsteliste); du bliver spurgt først og kan trykke <i>Fortryd</i> bagefter.</p>`,
      en: `<p>Your guest library under <a href="/admin/guests/">Guests</a> is shared by the account's hosts, so you can invite the same guests again. <a href="/admin/guests/?open=add-toggle">Add a guest</a> to the library: a new row with name and email slides in at the top of the list. The pencil edits a guest and the trash deletes it – you are asked first, and afterwards you can press <i>Undo</i> for a few seconds. A guest who is invited is removed from those tastings too.</p>
<h2 id="guest-page">A guest's own page</h2>
<p>Press a guest's name in the <a href="/admin/guests/">guest list</a> to see the guest's page (the address is the guest's name, e.g. /admin/guests/anna-holm/; two guests with the same name get -2 at the end). At the top are the email and when the guest was last here (signed in or opened the invitation link). Under <i>Tastings</i> you see each of the account's tastings the guest is invited to: reply, fee paid, dietary needs, note and whether the invitation was sent by email – the name leads to that tasting's guests. <i>Activity</i> shows in one list, newest first, what the guest has done: replies, orders (bottles, amount, paid), ratings, quiz answers, chat messages and sign-ins. <i>Roles on the account</i> shows whether the guest (by email) is also a host or the owner of the account, or co-host of one of its tastings. The page only shows what belongs to the account you are working in – never anything from other accounts. The pencil (<i>Edit</i>) at the top opens the same panel as the pencil in the list.</p>
<h2 id="invite">Invite</h2>
<p>Press <a href="t:guests/?open=g-invite-toggle">Guests → Add guest</a> on the tasting. A new row slides in at the top of the list: type the name, and guests from your guest list are shown with a button. For a new guest, type the name and email (the email is optional) and press Enter or the button. When <i>Send the invitation by email</i> is on and the guest has an email, the button says <i>Add and invite</i> – the invitation is sent straight away. Otherwise it says <i>Add</i>. The new guest goes into your guest list too. If you already have the guest (same email or name), that guest is added; a guest who is already in says <i>✓ Added</i>. The row stays open so you can add several in a row; × closes it.</p>
<h2 id="invite-mail">Invitation by email – or link</h2>
<p>With <i>Send the invitation by email</i> (under the fields in the row) turned on, guests with an email get a mail with the time, the place and a button to their personal invitation. If the guest replies to the mail, the reply goes to you. Under each guest it says when the invitation was sent. Every guest with an email has a ✉ icon in the row that sends the invitation – if it was sent before, you are asked whether to send it again. The link icon by every guest copies the guest's personal link.</p>
<p>Without an email: press the link icon in the row and send the link yourself, e.g. by text message. The link is personal – it is the guest's access to the tasting.</p>
<h2>Replies</h2>
<p>The guest replies yes or no and can add dietary needs and a note. Under <a href="t:guests/">Guests</a> each guest has a row like the wines: status, <i>Paid</i>/<i>Not paid</i> when there is a fee, dietary needs, a note and how many bottles they ordered. With the filter button next to <i>Add guest</i> you choose who is shown: <i>All</i> ticks <i>Coming, Waiting list, No reply yet</i> and <i>Not coming</i>; untick one of them and <i>All</i> is unticked. <i>Missing email</i> shows only those without an email among the chosen. The button shows what is chosen and how many. The pencil (<i>Edit</i>) opens the side panel, where you send the invitation, change the status, mark the fee paid, correct the email – or remove the guest from the tasting. The trash in the row also removes the guest from the tasting (the guest stays in your guest list); you are asked first and can press <i>Undo</i> afterwards.</p>`,
    },
  },
  {
    id: 'evening',
    title: { da: 'Under aftenen', en: 'During the evening' },
    body: {
      da: `<ul>
<li><b><a href="g:wines/">Vinene</a></b> – gæsterne bladrer gennem vinene på telefonen, med billede, kort, druer, mad og servering, og giver hver vin stjerner og noter.</li>
<li><b>Quiz</b> – <a href="t:quiz/?open=q-add-toggle">lav spørgsmål</a> med svarmuligheder under fanen <a href="t:quiz/">Quiz</a>. Træk i grebet foran nummeret for at ændre rækkefølgen (eller Tab til grebet og ↑ ↓). Slå <a href="t:quiz/#quiz-controls">Svare på quizzen</a> til, når gæsterne skal svare, og <i>Se quizzens facit</i>, når de rigtige svar og stillingen skal vises. Skal quizzen tages forfra, så tryk <a href="t:quiz/#quiz-reset">Nulstil quiz</a> nederst under fanen – alle gæsternes svar slettes, spørgsmålene bliver. Du bliver spurgt først og kan trykke <i>Fortryd</i> bagefter.</li>
<li><b>Pointtavlen på tv’et</b> – åbn linket under <a href="t:quiz/#tv-board">Quiz → Pointtavle til tv’et</a> på tv’et eller en skærm (kopiér det med ikonet). Tavlen kan åbnes uden login og viser kun fornavne – også hvis du er logget ind på skærmen. Har to samme fornavn, kommer der bogstaver fra efternavnet på, til de kan skelnes (fx <i>Anna Ha.</i> og <i>Anna Ho.</i>). Det samme ser gæsterne i quizzen og i appen; du ser fulde navne under <a href="t:quiz/">Quiz → Stillingen</a>.</li>
<li><b>Nye spørgsmål fra AI</b> – tryk <a href="t:quiz/?open=q-ai-open">Nye spørgsmål fra AI</a> ved siden af <i>Tilføj spørgsmål</i>. Et panel åbner: <b>1</b> vælg, hvor svære de <i>nye</i> spørgsmål skal være (<i>Let</i> for alle, <i>Mellem</i> for de interesserede, <i>Ekspert</i> for vinnørder), og hvor mange (3, 5 eller 8), og tryk <i>Lav forslag</i>. <b>2</b> Du ser forslagene med svarmuligheder og det rigtige svar (✓); fjern fluebenet ved dem, du ikke vil have, og tryk <i>Tilføj … spørgsmål</i>. De kommer sidst i quizzen – de spørgsmål, du allerede har, bliver ikke ændret. Spørgsmålene laves ud fra vinene: land og region, druer, alder, fremstilling, begreber og "hvilken passer ikke ind". Ved en almindelig smagning handler de om viden omkring vinene, ikke om det, gæsterne kan læse på vinens kort; kun blinde vine får gættespørgsmål. <i>Flere forslag</i> giver nye uden gentagelser, og <i>Skift sværhedsgrad</i> går tilbage til trin 1. Tjek de rigtige svar – AI kan tage fejl – og ret et spørgsmål bagefter som alle andre.</li>
<li><b><a href="t:chat/">Chat</a></b> – en fælles chat for aftenen, som både du og gæsterne kan skrive i.</li>
<li><b>Blinde vine</b> – afslør dem undervejs, se <a href="#blind">Blindsmagning</a>.</li>
</ul>`,
      en: `<ul>
<li><b><a href="g:wines/">The wines</a></b> – guests browse the wines on their phone, with picture, map, grapes, food and serving, and give each wine stars and notes.</li>
<li><b>Quiz</b> – <a href="t:quiz/?open=q-add-toggle">make questions</a> with answer options on the <a href="t:quiz/">Quiz</a> tab. Drag the grip in front of the number to change the order (or Tab to the grip and use ↑ ↓). Turn on <a href="t:quiz/#quiz-controls">Answer the quiz</a> when the guests should answer, and <i>See the quiz answers</i> when the right answers and the standings should be shown. To take the quiz again, press <a href="t:quiz/#quiz-reset">Reset quiz</a> at the bottom of the tab – every guest's answers are deleted, the questions stay. You are asked first and can press <i>Undo</i> afterwards.</li>
<li><b>The leaderboard on the TV</b> – open the link under <a href="t:quiz/#tv-board">Quiz → Leaderboard for the TV</a> on the TV or a screen (copy it with the icon). It opens without signing in and shows first names only – also if you are signed in on that screen. When two share a first name, letters from the surname are added until they can be told apart (e.g. <i>Anna Ha.</i> and <i>Anna Ho.</i>). Guests see the same in the quiz and in the app; you see full names under <a href="t:quiz/">Quiz → Standings</a>.</li>
<li><b>New questions from AI</b> – press <a href="t:quiz/?open=q-ai-open">New questions from AI</a> next to <i>Add question</i>. A panel opens: <b>1</b> choose how hard the <i>new</i> questions should be (<i>Easy</i> for everyone, <i>Medium</i> for the interested, <i>Expert</i> for wine nerds) and how many (3, 5 or 8), and press <i>Make suggestions</i>. <b>2</b> You see the suggestions with their answer options and the right answer (✓); untick the ones you do not want and press <i>Add … questions</i>. They go at the end of the quiz – the questions you already have are not changed. The questions are made from the wines: country and region, grapes, age, how it is made, terms and "odd one out". In an ordinary tasting they are about the knowledge around the wines, not what guests can read on the wine's card; only blind wines get guessing questions. <i>More suggestions</i> gives new ones without repeats, and <i>Change difficulty</i> goes back to step 1. Check the right answers – AI can be wrong – and edit a question afterwards like any other.</li>
<li><b><a href="t:chat/">Chat</a></b> – a shared chat for the evening that you and the guests can write in.</li>
<li><b>Blind wines</b> – reveal them as you go, see <a href="#blind">Blind tasting</a>.</li>
</ul>`,
    },
  },
  {
    id: 'orders',
    title: { da: 'Bestillinger og betaling', en: 'Orders and payment' },
    body: {
      da: `<p>Når <a href="t:orders/">Bestillinger → Bestille vin</a> er slået til, kan gæsterne lægge de vine i kurven, der kan bestilles, og sende bestillingen. På vinens side vælger gæsten antal flasker med − og + og trykker <i>Læg i kurv</i>; en bjælke nederst viser, hvor mange flasker der er i kurven, og hvad de koster, med vej til kurven. Mængdepriser gælder automatisk. Alle beløb skrives på samme måde på alle sprog, fx 1.393,90 kr.</p>
<h2 id="bulk">Mængderabat – hver gæst eller alle samlet</h2>
<p>Har en vin en mængdepris (fx "fra 6 flasker 359,95 kr."), vælger du under <a href="t:orders/#bulk-mode">Bestillinger → Bestille vin</a>, hvem der tæller med – valget vises kun, når en vin i smagningen har mængdepris. Du skal vælge, før du kan åbne for bestillinger:</p>
<ul>
<li><b>Hver gæst for sig</b> – en gæst, der bestiller 6 (også fordelt på flere bestillinger), får mængdeprisen.</li>
<li><b>Alle gæster sammen</b> – god til vinklubber og fællesindkøb: når gæsterne tilsammen bestiller 6, får alle mængdeprisen. Gæsterne ser "Sammen har I bestilt 4 af 6 – 2 flasker mere …". Priserne er foreløbige, indtil du lukker for bestillinger, og gæsterne bliver bedt om at vente med at betale til da.</li>
</ul>
<p>Når grænsen er nået, gælder den billige pris for alle flasker – også dem ud over 6. Betalte bestillinger beholder deres pris.</p>
<p>Under fanen <a href="t:orders/">Bestillinger</a> ser du alle bestillinger – én række pr. bestilling med <i>Betalt</i> eller <i>Ikke betalt</i>. Fluebenet i rækken markerer den betalt (pilen tilbage gør den ikke betalt igen), og du kan <a href="t:orders/#csv">hente dem som CSV</a> til leverandøren – med vin, flaskestørrelse i cl, antal og pris.</p>
<h2 id="mobilepay">MobilePay</h2>
<p>MobilePay sættes op for hver smagning under <a href="t:settings/?open=mp-edit">Indstillinger → MobilePay</a> med blyanten (<i>Rediger</i>): én kontakt, ét MobilePay-nummer og ét navn – navnet på den, der får pengene. Når MobilePay er slået til, skal både nummer og navn udfyldes. Nummeret er et dansk mobilnummer med 8 cifre (fx 12 34 56 78) eller et MobilePay Box-nummer. Gæsterne ser så tre ting: nummeret (med en kopiknap), navnet og beløbet – både til bestillinger og deltagergebyr – og betaler selv i MobilePay. Du finder betalingen ud fra gæstens navn og beløbet og markerer den selv som betalt.</p>
<p>En ny smagning starter med MobilePay slået fra og tomme felter – du udfylder nummer og navn for netop den smagning, når du opretter den, eller senere under Indstillinger. Vil du ikke bruge MobilePay i en smagning, slår du kontakten fra. Så ser gæsterne ingen MobilePay, kun beløbet og at du fortæller, hvordan de betaler. Nummer og navn bliver gemt, så de er der igen, når du slår det til.</p>`,
      en: `<p>When <a href="t:orders/">Orders → Order wine</a> is on, guests can put the wines that can be ordered in the cart and send the order. On a wine's page the guest chooses the number of bottles with − and + and presses <i>Add to cart</i>; a bar at the bottom shows how many bottles are in the cart and what they cost, with the way to the cart. Quantity prices apply automatically. Every amount is written the same way in all languages, e.g. 1.393,90 kr.</p>
<h2 id="bulk">Quantity prices – each guest or everyone together</h2>
<p>When a wine has a quantity price (e.g. "from 6 bottles 359.95 kr."), you choose under <a href="t:orders/#bulk-mode">Orders → Order wine</a> who counts – the choice only shows when a wine in the tasting has a quantity price. You must choose before you can open ordering:</p>
<ul>
<li><b>Each guest</b> – a guest who orders 6 (also over several orders) gets the quantity price.</li>
<li><b>All guests together</b> – good for wine clubs and joint orders: when the guests together order 6, everyone gets the quantity price. Guests see "Together you have ordered 4 of 6 – 2 more …". Prices are provisional until you close ordering, and guests are asked to wait with paying until then.</li>
</ul>
<p>Once the quantity is reached, the lower price applies to every bottle – also those beyond 6. Paid orders keep their price.</p>
<p>On the <a href="t:orders/">Orders</a> tab you see all orders – one row per order with <i>Paid</i> or <i>Not paid</i>. The tick in the row marks it paid (the arrow back marks it not paid again), and you can <a href="t:orders/#csv">download them as CSV</a> for the supplier – with wine, bottle size in cl, quantity and price.</p>
<h2 id="mobilepay">MobilePay</h2>
<p>MobilePay is set up for each tasting under <a href="t:settings/?open=mp-edit">Settings → MobilePay</a> with the pencil (<i>Edit</i>): one switch, one MobilePay number and one name – the name of the person who gets the money. While MobilePay is on, both the number and the name are required. The number is a Danish mobile number with 8 digits (e.g. 12 34 56 78) or a MobilePay Box number. Guests then see three things: the number (with a copy button), the name and the amount – for orders and the tasting fee – and pay in MobilePay themselves. You find the payment by the guest's name and the amount and mark it paid yourself.</p>
<p>A new tasting starts with MobilePay off and empty fields – you fill in the number and name for that tasting when you create it, or later under Settings. If you do not want to use MobilePay in a tasting, turn the switch off. Guests then see no MobilePay, only the amount and that you will tell them how to pay. The number and name are kept, so they are back when you turn it on again.</p>`,
    },
  },
  {
    id: 'account',
    title: { da: 'Konto og værter', en: 'Account and hosts' },
    body: {
      da: `<p>Under <a href="/admin/account/">Konto og værter</a> kan kontoen få et navn, fx en vinklub. Alle værter på kontoen ser og retter alle smagninger, vine og gæster. Ejeren – den der oprettede kontoen – kan ikke fjernes.</p>
<h2 id="add-host">Flere værter på kontoen</h2>
<p>Ejeren trykker <a href="/admin/account/?open=member-open">Tilføj vært</a> og skriver e-mailen. Er personen allerede vært på Winetastr, er de med på kontoen med det samme; ellers står de som <i>Inviteret</i>, til de logger ind første gang med den e-mail. De får en mail med et link direkte til kontoen. Skraldespanden ved en vært fjerner værten (eller trækker invitationen tilbage) – du bliver spurgt først, og det, de har lavet, bliver på kontoen.</p>
<p>Skal nogen kun hjælpe med én smagning, så tilføj dem i stedet som medvært på smagningens <a href="t:#hosts">Overblik → Værter</a>. De ser kun den smagning – ikke kontoens vine og gæster.</p>
<h2 id="accounts">Vært på flere konti</h2>
<p>Er du vært på mere end én konto – fx din egen og vinklubbens – vælger du konto øverst i menuen til venstre (på telefonen under <i>Menu</i>). Menuen, overblikket, vinene og gæsterne viser så den konto, du har valgt, og nye smagninger, vine og gæster kommer på den. Enheden husker dit valg til næste gang. Smagninger, hvor du kun er medvært, står under <i>Delt med mig</i>, uanset hvilken konto du har valgt.</p>
<p>Under <a href="/profile/">Profil</a> (menuen øverst til højre) retter du dit navn, din e-mail og dit sprog. Sproget kan du også skifte direkte i menuen under <i>Sprog</i>. Du logger ind med en kode på mail; <i>Husk mig</i> holder dig logget ind på enheden.</p>
<h2 id="notify">Mails til dig om gæsterne</h2>
<p>Under <a href="/profile/#notify">Profil → Mail til mig, når en gæst …</a> vælger du, hvad du vil have mail om: når en gæst siger ja (også venteliste og oprykning), siger nej, skriver en note eller et kost-hensyn, skriver i chatten eller bestiller vin. Alt er slået fra fra start. Det gælder alle smagninger, du er vært eller medvært for; flere ting på én gang kommer i én mail pr. smagning, og du får aldrig mail om noget, du selv har gjort.</p>`,
      en: `<p>Under <a href="/admin/account/">Account and hosts</a> the account can get a name, e.g. a wine club. Every host on the account sees and edits all tastings, wines and guests. The owner – whoever created the account – cannot be removed.</p>
<h2 id="add-host">More hosts on the account</h2>
<p>The owner presses <a href="/admin/account/?open=member-open">Add host</a> and types the email. If the person is already a host on Winetastr, they are on the account at once; otherwise they show as <i>Invited</i> until they first sign in with that email. They get an email with a link straight to the account. The trash by a host removes the host (or withdraws the invitation) – you are asked first, and what they made stays on the account.</p>
<p>If someone should only help with one tasting, add them as co-host in the tasting instead, on its <a href="t:#hosts">Overview → Hosts</a>. They see only that tasting – not the account's wines and guests.</p>
<h2 id="accounts">Host on more than one account</h2>
<p>If you are a host on more than one account – e.g. your own and the wine club's – you choose the account at the top of the menu on the left (on a phone under <i>Menu</i>). The menu, the overview, the wines and the guests then show the account you chose, and new tastings, wines and guests go into it. The device remembers your choice for next time. Tastings where you are only a co-host are under <i>Shared with me</i>, whichever account you chose.</p>
<p>Under <a href="/profile/">Profile</a> (the menu at the top right) you change your name, email and language. You can also switch the language straight from the menu under <i>Language</i>. You sign in with a code by email; <i>Remember me</i> keeps you signed in on the device.</p>
<h2 id="notify">Emails to you about the guests</h2>
<p>Under <a href="/profile/#notify">Profile → Email me when a guest …</a> you choose what you want an email about: a guest saying yes (also the waiting list and moving up), saying no, writing a note or diet, writing in the chat or ordering wine. Everything starts off. It applies to all tastings you host or co-host; several things at once come in one email per tasting, and you never get an email about something you did yourself.</p>`,
    },
  },
  {
    id: 'guest-view',
    title: { da: 'Sådan ser det ud for gæsten', en: 'What the guest sees' },
    body: {
      da: `<ul>
<li><b><a href="g:">Invitationen</a></b> – om aftenen, tid og sted, "Tilføj til kalender", svar ja/nej med kost og note, og et kort over hvor vinene kommer fra.</li>
<li><b>Vinene</b> – én vin ad gangen, med karakter og noter; kurv og bestilling når det er åbent.</li>
<li><b>Quizzen</b> – ét spørgsmål ad gangen med en bjælke, der viser hvor langt gæsten er ("Spørgsmål 4 af 12"); når quizzen er afsluttet, ser gæsten hvert spørgsmål med det rigtige svar og sit eget.</li>
<li><b>Quiz, stilling og chat</b> under aftenen.</li>
<li><b>Min vinbog</b> – de vine gæsten har smagt, egne karakterer og køb på tværs af smagninger (når gæsten logger ind med sin e-mail).</li>
</ul>
<p>Tip: <a href="g:">åbn gæstesiden</a> for at se smagningen, som gæsterne gør (eller brug øjet ved siden af smagningens navn).</p>`,
      en: `<ul>
<li><b><a href="g:">The invitation</a></b> – about the evening, time and place, "Add to calendar", reply yes/no with diet and note, and a map of where the wines come from.</li>
<li><b>The wines</b> – one wine at a time, with rating and notes; cart and ordering when it is open.</li>
<li><b>The quiz</b> – one question at a time with a bar showing how far the guest is ("Question 4 of 12"); when the quiz is finished, the guest sees each question with the right answer and their own.</li>
<li><b>Quiz, standings and chat</b> during the evening.</li>
<li><b>My wine book</b> – the wines the guest has tasted, their own ratings and purchases across tastings (when the guest signs in with their email).</li>
</ul>
<p>Tip: <a href="g:">open the guest page</a> to see the tasting the way the guests do (or use the eye beside the tasting's name).</p>`,
    },
  },
  {
    id: 'news',
    title: { da: 'Nyt i Winetastr', en: 'What’s new in Winetastr' },
    body: {
      da: `<p>Under <a href="/admin/news/">Hjælp → Nyt i Winetastr</a> står det, der er kommet til eller ændret sig, med et par korte linjer for hver udgivelse – det nyeste øverst. Kun det, du og dine gæster vil lægge mærke til.</p>`,
      en: `<p>Under <a href="/admin/news/">Help → What’s new in Winetastr</a> you find what has been added or changed, in a few short lines per release – newest at the top. Only what you and your guests will notice.</p>`,
    },
  },
  {
    id: 'faq',
    title: { da: 'Spørgsmål og svar', en: 'Questions and answers' },
    body: {
      da: `<h2>Gæsten har ikke fået invitationen</h2>
<p>Tjek at gæsten har den rigtige e-mail, og bed gæsten kigge i uønsket post. Tryk <i>Send igen</i> under <a href="t:guests/">Gæster</a>, eller kopier linket og send det på sms.</p>
<h2>Gæsten kan ikke bestille en vin</h2>
<p>Tjek at <a href="t:orders/">Bestillinger → Bestille vin</a> er slået til, og under <a href="t:wines/">Vine</a> at vinen kan bestilles og ikke er blind.</p>
<h2>Gæsten kan ikke se en vin</h2>
<p>Tjek <i>Gæsterne ser</i> ved vinen under <a href="t:wines/">Vine</a> – den kan stå på <i>Intet (skjult)</i>.</p>
<h2>"Inviter gæst" kan ikke trykkes</h2>
<p>En smagning skal have mindst én vin, før du kan invitere gæster. Tilføj en under <a href="t:wines/?open=tw-add-toggle">Vine</a>.</p>
<h2>Kan jeg ændre rækkefølgen af vinene?</h2>
<p>Ja, på smagningens fane <a href="t:wines/">Vine</a>: træk i grebet foran nummeret, eller gå til grebet med Tab og brug ↑ ↓. Nummeret, gæsterne ser, følger rækkefølgen.</p>
<h2>Jeg kan ikke se en smagning, jeg er inviteret til</h2>
<p>Når du er logget ind, ser du kun invitationer til den e-mail, du er logget ind med. Er du inviteret med en anden e-mail, så åbn invitationslinket og vælg <i>Log ud og åbn invitationen</i> – eller bed værten rette din e-mail på gæstelisten.</p>
<h2>Gæsten har mistet sit link</h2>
<p>Send invitationen igen, eller lad gæsten logge ind på winetastr.com med sin e-mail.</p>
<h2 id="signup-existing">Jeg har oprettet mig igen med en mail, der allerede har en konto</h2>
<p>Det gør ikke noget. Siden <a href="/signup/">Opret konto</a> siger det samme til alle, så ingen kan se, om en e-mail har en konto. Har mailen allerede en konto, logger koden dig ind på den – der oprettes ikke en ny, og du mister intet.</p>
<h2 id="no-login-code">En gæst får ingen kode ved login</h2>
<p>Login siger det samme til alle: at koden er sendt, hvis vi kender mailen. Siden fortæller ikke, om en e-mail står på en gæsteliste – så ingen kan prøve sig frem. Tjek gæstens e-mail under <a href="t:guests/">Gæster</a>, og bed gæsten kigge i spam eller logge ind med linket fra invitationen (kopier det i gæstens række, og send det på sms).</p>
<h2>"Kontoen har brugt dagens …"</h2>
<p>Hver konto kan sende 300 mails og lave 500 automatiske opslag om dagen (læse links og etiketter, finde billeder og producenter, AI-tekster og quizforslag) – langt mere end en smagning bruger. Når grænsen er nået, kan du stadig udfylde vinene selv og <a href="t:guests/">kopiere gæsternes links</a> og sende dem selv. Grænsen nulstilles ved midnat (UTC).</p>`,
      en: `<h2>The guest has not received the invitation</h2>
<p>Check the guest's email, and ask the guest to look in their junk mail. Press <i>Send again</i> under <a href="t:guests/">Guests</a>, or copy the link and send it by text message.</p>
<h2>A guest cannot order a wine</h2>
<p>Check that <a href="t:orders/">Orders → Order wine</a> is on, and under <a href="t:wines/">Wines</a> that the wine can be ordered and is not blind.</p>
<h2>A guest cannot see a wine</h2>
<p>Check <i>Guests see</i> on the wine under <a href="t:wines/">Wines</a> – it may be set to <i>Nothing (hidden)</i>.</p>
<h2>"Invite guest" cannot be pressed</h2>
<p>A tasting needs at least one wine before you can invite guests. Add one under <a href="t:wines/?open=tw-add-toggle">Wines</a>.</p>
<h2>Can I change the order of the wines?</h2>
<p>Yes, on the tasting's <a href="t:wines/">Wines</a> tab: drag the grip in front of the number, or Tab to the grip and use ↑ ↓. The number the guests see follows the order.</p>
<h2>I cannot see a tasting I am invited to</h2>
<p>When you are signed in, you only see invitations to the email you are signed in with. If you were invited with another email, open the invitation link and choose <i>Sign out and open the invitation</i> – or ask the host to correct your email on the guest list.</p>
<h2>A guest has lost their link</h2>
<p>Send the invitation again, or let the guest sign in at winetastr.com with their email.</p>
<h2 id="signup-existing">I signed up again with an email that already has an account</h2>
<p>That is fine. The <a href="/signup/">sign-up page</a> says the same to everyone, so nobody can tell whether an email has an account. If the email already has one, the code signs you in to it – no new account is made, and you lose nothing.</p>
<h2 id="no-login-code">A guest gets no code when signing in</h2>
<p>Sign-in says the same to everyone: that the code has been sent if we know the email. The page does not tell whether an email is on a guest list – so nobody can try their way through. Check the guest's email under <a href="t:guests/">Guests</a>, and ask the guest to look in their spam folder or sign in with the link from the invitation (copy it in the guest's row and send it by text message).</p>
<h2>"Your account has used today's …"</h2>
<p>Each account can send 300 emails and make 500 automatic look-ups a day (reading links and labels, finding pictures and producers, AI texts and quiz suggestions) – far more than a tasting uses. When the limit is reached you can still fill in the wines yourself and <a href="t:guests/">copy the guests' links</a> and send them yourself. The limit resets at midnight (UTC).</p>`,
    },
  },
];

/** The short tips behind the "?" buttons: a sentence or two, and where to read more */
// t: links go to the tasting chosen at the top of the help (its admin), g: links to its guest page
export const TIPS: Record<string, { text: Text; more: string }> = {
  blind: { more: 'blind', text: {
    da: 'Alle vine bliver blinde: gæsterne ser kun vinens nummer, til du trykker <i>Afslør</i> ved vinen. Nye vine starter blinde.',
    en: 'All wines become blind: guests see only the wine’s number until you press <i>Reveal</i> on the wine. New wines start blind.' } },
  'guests-see': { more: 'blind', text: {
    da: '<b>Vinen</b>: alt vises. <b>Blind</b>: kun nummeret, til du afslører den. <b>Intet</b>: vinen er skjult for gæsterne.',
    en: '<b>The wine</b>: everything is shown. <b>Blind</b>: only the number until you reveal it. <b>Nothing</b>: the wine is hidden from the guests.' } },
  'max-guests': { more: 'max-guests', text: {
    da: 'Når smagningen er fuld, kommer nye ja-svar på venteliste. Melder nogen fra, rykker den første på listen op af sig selv.',
    en: 'When the tasting is full, new yes replies go on the waiting list. When someone drops out, the first on the list moves up by itself.' } },
  'invite-mail': { more: 'invite-mail', text: {
    da: 'Gæster med e-mail får en mail med tid, sted og en knap til deres personlige invitation. Svar på mailen går til dig.',
    en: 'Guests with an email get a mail with time, place and a button to their personal invitation. Replies to the mail go to you.' } },
  'new-wine': { more: 'new-wine', text: {
    da: 'Skriv navnet, indsæt et link til butikken eller vælg et billede af etiketten – med link eller billede udfyldes det meste af sig selv.',
    en: 'Type the name, paste a link to the shop or choose a photo of the label – with a link or a photo most of it fills itself in.' } },
  'bottle-size': { more: 'bottle-size', text: {
    da: '75 cl, hvis du ikke vælger andet. Står størrelsen i navnet, på butikkens side eller på etiketten (fx <i>Magnum</i> eller <i>1,5 l</i>), sættes den af sig selv. Andre størrelser end 75 cl vises ved vinen – også hos gæsterne.',
    en: '75 cl unless you choose another. When the size is in the name, on the shop\'s page or on the label (e.g. <i>Magnum</i> or <i>1.5 l</i>), it is set by itself. Sizes other than 75 cl are shown with the wine – also to the guests.' } },
  'orders-open': { more: 'orders', text: {
    da: 'Gæsterne kan lægge vine i kurven og bestille. Kun vine, der kan bestilles og ikke er blinde.',
    en: 'Guests can put wines in the cart and order. Only wines that can be ordered and are not blind.' } },
  quiz: { more: 'evening', text: {
    da: '<b>Svare på quizzen</b>: gæsterne kan svare. <b>Se quizzens facit</b>: de rigtige svar og stillingen vises.',
    en: '<b>Answer the quiz</b>: guests can answer. <b>See the quiz answers</b>: the right answers and the standings are shown.' } },
  mobilepay: { more: 'mobilepay', text: {
    da: 'Gæsterne ser nummeret, navnet og beløbet. Slået fra ser de kun beløbet – nummer og navn bliver gemt.',
    en: 'Guests see the number, the name and the amount. Off, they see only the amount – the number and name are kept.' } },
  fee: { more: 'fee', text: {
    da: 'Skriv det samlede indkøb, så foreslås et gebyr pr. gæst, der kommer. Du markerer selv, hvem der har betalt.',
    en: 'Enter the total purchase and a fee per guest who is coming is suggested. You mark yourself who has paid.' } },
  'ai-intro': { more: 'ai-intro', text: {
    da: 'AI skriver et udkast ud fra vinene. Det vises under din tekst – intet overskrives, før du vælger <i>Brug udkastet</i>, og <i>Fortryd</i> henter din tekst tilbage.',
    en: 'AI writes a draft from the wines. It is shown below your text – nothing is replaced until you choose <i>Use the draft</i>, and <i>Undo</i> brings your text back.' } },
  'ai-quiz': { more: 'evening', text: {
    da: 'Sværhedsgraden gælder de <i>nye</i> spørgsmål, AI skriver ud fra vinene – ikke dem, der allerede er i quizzen. Intet bliver tilføjet, før du har set forslagene og trykket <i>Tilføj</i>.',
    en: 'The difficulty is for the <i>new</i> questions AI writes from the wines – not the ones already in the quiz. Nothing is added until you have seen the suggestions and pressed <i>Add</i>.' } },
  'bulk-mode': { more: 'bulk', text: {
    da: '<b>Hver gæst</b>: gæstens egne flasker tæller. <b>Samlet</b>: alle gæsters flasker af en vin tæller sammen – godt til vinklubber. Priserne er så foreløbige, til du lukker for bestillinger.',
    en: '<b>Each guest</b>: the guest\'s own bottles count. <b>Together</b>: all the guests\' bottles of a wine count together – good for wine clubs. Prices are then provisional until you close ordering.' } },
  'account-hosts': { more: 'account', text: {
    da: 'Alle værter på kontoen ser og retter alle smagninger, vine og gæster. Kun ejeren kan tilføje og fjerne værter. En vært kan være på flere konti og vælger konto øverst i menuen.',
    en: 'Every host on the account sees and edits all tastings, wines and guests. Only the owner can add and remove hosts. A host can be on several accounts and chooses the account at the top of the menu.' } },
};
