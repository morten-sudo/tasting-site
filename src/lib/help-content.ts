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
<li><b>Følg svarene</b> under <a href="t:guests/">Gæster</a>. Du ser, hvem der kommer, hvem der ikke har svaret, og hvem der står på venteliste.</li>
<li><b>På aftenen</b> åbner du for bestillinger under <a href="t:orders/">Bestillinger</a> og for quizzen under <a href="t:quiz/">Quiz</a>, når det passer – og afslører vinene, hvis det er en blindsmagning.</li>
</ol>`,
      en: `<p>From an empty account to a tasting with invited guests:</p>
<ol>
<li><b>Add the wines.</b> Go to <a href="/admin/wines/?open=wine-add-toggle">Wines → New wine</a> and type the name, paste a link to the shop or choose a photo of the label – with a link or a photo most of it fills itself in. See <a href="#wines">Wines</a>.</li>
<li><b>Create the tasting.</b> Press <a href="/admin/tastings/?new=1">New tasting</a> and fill in the title, date, start and optional end time, max number of guests, place and introduction – only the title is needed. Press <i>Create tasting</i> and you come to the tasting's page, where the <i>Get started</i> card shows the next steps with ✓ by what is done – and a button by what to do now.</li>
<li><b>Choose the wines.</b> On the tasting's <a href="t:wines/?open=tw-add-toggle">Wines → Add wine</a>, type the name of a wine in your library and press <i>Add</i> – or paste a link or a photo for a new one. Then set their order and the guest price.</li>
<li><b>Invite the guests.</b> Press <a href="t:guests/?open=g-invite-toggle">Guests → Invite guest</a>. Guests with an email get the invitation by email; for the others, copy their personal link and send it yourself.</li>
<li><b>Follow the replies</b> under <a href="t:guests/">Guests</a>. You see who is coming, who has not replied and who is on the waiting list.</li>
<li><b>On the evening</b>, open ordering under <a href="t:orders/">Orders</a> and the quiz under <a href="t:quiz/">Quiz</a> when it suits you – and reveal the wines if it is a blind tasting.</li>
</ol>`,
    },
  },
  {
    id: 'tastings',
    title: { da: 'Smagninger', en: 'Tastings' },
    body: {
      da: `<p>En smagning har sin egen side med faner: <a href="t:">Overblik</a>, <a href="t:wines/">Vine</a>, <a href="t:guests/">Gæster</a>, <a href="t:orders/">Bestillinger</a>, <a href="t:quiz/">Quiz</a>, <a href="t:chat/">Chat</a> og <a href="t:settings/">Indstillinger</a>. Se alle under <a href="/admin/tastings/">Smagninger</a>. Alle værter på kontoen kan se og rette alle smagninger.</p>
<h4>Detaljer</h4>
<p>Under <a href="t:">Overblik → Rediger</a>: titel, dato og tid, sted (adressen slås op, mens du skriver), en introduktion til gæsterne og smagningens sprog. Sproget bestemmer bl.a. sproget i invitationsmails.</p>
<h4 id="ai-intro">Introduktion skrevet med AI</h4>
<p>Tryk <i>Skriv et udkast med AI</i> under introduktionen. Cloudflares AI skriver et udkast ud fra smagningens vine – fx en rejse gennem én region, en tur på tværs af lande eller en drue som tema – og blinde vine bliver ikke afsløret. Udkastet vises <b>under</b> din egen tekst: <i>Brug udkastet</i> sætter det ind i feltet (med <i>Fortryd</i>, der henter din tekst tilbage), <i>Prøv igen</i> giver et nyt, og <i>Kassér</i> fjerner det. Intet gemmes, før du trykker <i>Gem</i>. Et udkast tager op til ca. 20 sekunder. Tjek altid teksten – AI kan finde på ting.</p>
<h4 id="delete-tasting">Slet en smagning</h4>
<p>Nederst under <a href="t:settings/#delete-tasting">Indstillinger → Slet smagningen</a>. Kun den, der oprettede smagningen, og kontoens ejer kan slette den. Gæsteliste, svar, bestillinger, quiz og chat forsvinder; vinene bliver i biblioteket.</p>
<h4 id="controls"><a href="t:settings/#controls">Gæsterne kan</a></h4>
<p>Øverst under <a href="t:settings/">Indstillinger</a> slår du til og fra, hvad gæsterne kan – det gemmes med det samme:</p>
<ul>
<li><b>Svare på invitationen</b> – gæsterne kan svare ja eller nej.</li>
<li><b>Svare på quizzen</b> og <b>Se quizzens facit</b> – se <a href="#evening">Under aftenen</a>.</li>
</ul>
<p>Under <i>Smagningen</i> finder du <b>Blindsmagning</b> (se <a href="#blind">Blindsmagning</a>), maks. antal gæster og linket til pointtavlen på tv’et.</p>
<h4 id="max-guests"><a href="t:settings/#max-guests">Max antal gæster og venteliste</a></h4>
<p>Tryk <i>Rediger</i> ved <i>Maks. antal gæster</i>, og skriv et tal. Når smagningen er fuld, kommer gæster, der siger ja, på venteliste i den rækkefølge, de svarede. Melder en, der kommer, fra – eller hæver du loftet – rykker den første på ventelisten automatisk op. Tomt felt betyder intet loft. Gæsterne ser ikke, hvor mange pladser der er tilbage.</p>
<h4>Medværter</h4>
<p>Under <a href="t:settings/#hosts">Indstillinger → Værter</a> trykker du <i>Tilføj vært</i> og skriver e-mailen. De får en mail og kan rette smagningen, vinene og gæsterne, men ikke slette smagningen eller styre værterne.</p>
<h4 id="fee"><a href="t:settings/#fee">Deltagergebyr</a></h4>
<p>Tryk <i>Rediger</i> under <i>Betaling for smagningen</i>, og skriv, hvad smagningen koster i alt – så foreslås et beløb pr. gæst ud fra antallet, der kommer. Slå <i>Vis gebyret for gæsterne</i> til, når de skal se det. Du markerer selv, hvem der har betalt.</p>`,
      en: `<p>A tasting has its own page with tabs: <a href="t:">Overview</a>, <a href="t:wines/">Wines</a>, <a href="t:guests/">Guests</a>, <a href="t:orders/">Orders</a>, <a href="t:quiz/">Quiz</a>, <a href="t:chat/">Chat</a> and <a href="t:settings/">Settings</a>. See them all under <a href="/admin/tastings/">Tastings</a>. Every host on the account can see and edit every tasting.</p>
<h4>Details</h4>
<p>Under <a href="t:">Overview → Edit</a>: title, date and time, place (the address is looked up as you type), an introduction for the guests and the tasting's language. The language decides, among other things, the language of the invitation emails.</p>
<h4 id="ai-intro">Introduction written with AI</h4>
<p>Press <i>Write a draft with AI</i> under the introduction. Cloudflare's AI writes a draft from the tasting's wines – e.g. a journey through one region, a tour across countries or a grape as the theme – and blind wines are not given away. The draft is shown <b>below</b> your own text: <i>Use the draft</i> puts it in the field (with <i>Undo</i>, which brings your text back), <i>Try again</i> gives a new one, and <i>Discard</i> removes it. Nothing is saved until you press <i>Save</i>. A draft takes up to about 20 seconds. Always check the text – AI can make things up.</p>
<h4 id="delete-tasting">Deleting a tasting</h4>
<p>At the bottom of <a href="t:settings/#delete-tasting">Settings → Delete the tasting</a>. Only the one who created the tasting and the account's owner can delete it. Guest list, replies, orders, quiz and chat go; the wines stay in the library.</p>
<h4 id="controls"><a href="t:settings/#controls">The guests can</a></h4>
<p>At the top of <a href="t:settings/">Settings</a> you switch on and off what the guests can do – it is saved at once:</p>
<ul>
<li><b>Reply to the invitation</b> – guests can reply yes or no.</li>
<li><b>Answer the quiz</b> and <b>See the quiz answers</b> – see <a href="#evening">During the evening</a>.</li>
</ul>
<p>Under <i>The tasting</i> you find <b>Blind tasting</b> (see <a href="#blind">Blind tasting</a>), the max number of guests and the link to the leaderboard for the TV.</p>
<h4 id="max-guests"><a href="t:settings/#max-guests">Max number of guests and the waiting list</a></h4>
<p>Press <i>Edit</i> by <i>Max. number of guests</i> and enter a number. When the tasting is full, guests who say yes go on the waiting list in the order they replied. When someone who is coming drops out – or you raise the limit – the first on the list moves up automatically. An empty field means no limit. Guests do not see how many places are left.</p>
<h4>Co-hosts</h4>
<p>Under <a href="t:settings/#hosts">Settings → Hosts</a> press <i>Add host</i> and enter the email. They get an email and can edit the tasting, its wines and guests, but cannot delete the tasting or manage its hosts.</p>
<h4 id="fee"><a href="t:settings/#fee">Tasting fee</a></h4>
<p>Press <i>Edit</i> under <i>Tasting fee</i> and enter what the tasting costs in all – an amount per guest is suggested from the number who are coming. Turn on <i>Show the fee to the guests</i> when they should see it. You mark yourself who has paid.</p>`,
    },
  },
  {
    id: 'wines',
    title: { da: 'Vine', en: 'Wines' },
    body: {
      da: `<p>Dit vinbibliotek under <a href="/admin/wines/">Vine</a> deles af alle værter på kontoen, og en vin kan bruges i mange smagninger.</p>
<h4 id="filter-wines">Find dine vine</h4>
<p>Over listen kan du <a href="/admin/wines/">filtrere</a> på <b>land</b>, <b>region</b>, <b>type</b> og <b>smagning</b> – og søge i fritekst. Hvert filter er en knap med en liste af flueben, ligesom filteret på gæstelisten: <i>Alle</i> sætter flueben ved alt; fjerner du ét, ryger fluebenet ved <i>Alle</i>, og du kan vælge flere på én gang (fx Frankrig og Italien). Regionerne følger landene: vælger du lande, ses kun deres regioner. Under smagning kan du også vælge <i>Ikke i nogen smagning</i>. Tallet ud for hver er antallet af vine, knappen viser hvad der er valgt, og <i>Nulstil filtre</i> viser alle igen. Filtrene står i adressen, så de er der stadig, når du går tilbage fra en vin.</p>
<h4 id="new-wine">Ny vin</h4>
<p>Tryk <a href="/admin/wines/?open=wine-add-toggle">Ny vin</a> (under Vine eller på Overblik). Øverst i listen glider en ny række ind, hvor du kan:</p>
<ul>
<li><b>Skrive navnet</b> – mens du skriver, vises vine i dit bibliotek med samme navn, så du ikke laver en kopi. Tryk <i>Tilføj</i> for at oprette en ny med det navn; et årstal i navnet bliver vinens årgang. Vinens side tilbyder bagefter at hente resten fra et link eller et billede.</li>
<li><b>Indsætte et link til en butik</b> – navn, type, årgang, oprindelse, beskrivelse, priser, druer, "passer til", servering og billede hentes fra siden.</li>
<li><b>Vælge et billede af etiketten</b> (eller trække det ind eller indsætte det) – navn, producent, årgang, type m.m. læses fra billedet.</li>
</ul>
<p>Med link eller billede kommer der en række i listen, hvor du kan se, hvad der kommer ind – til sidst producentens hjemmeside og adresse. Så glider vinen ind i listen og lyser op, og der står en kort besked nederst. Du kan tilføje flere vine i træk, mens rækkerne arbejder. Kan siden eller etiketten ikke læses, står det i rækken, og <i>Skriv navnet</i> lader dig skrive navnet selv – linket eller billedet gemmes stadig med vinen. Den samme vin (samme navn og årgang) kan ikke ligge i biblioteket to gange – har du den allerede, foreslås den i stedet. Er det en anden årgang, så skriv årstallet efter navnet, fx <i>Barolo 2019</i>.</p>
<p>Tjek altid vinen bagefter med <i>Rediger</i> – det automatiske er et godt udgangspunkt, ikke en garanti. Kun <b>navnet</b> skal være der; resten kan du tilføje senere. Er noget skrevet forkert, fx en årgang uden tal eller en pris, der ikke er et tal, står det med rødt lige under feltet. Priser og alkohol må skrives med komma eller punktum. Et <i>tilbud i butikken</i> kan gælde ved køb af 1 flaske (en lavere stykpris) eller flere: når vinen kommer i en smagning, bliver et tilbud på 1 flaske gæsteprisen, og et tilbud på flere flasker bliver mængdeprisen. Er vinen hentet fra et link, står der <i>Hentet fra … (dato)</i>, og du kan hente igen med opdater-ikonet. Er billedet forkert (fx bagetiketten), kan du vælge et andet.</p>
<h4 id="delete-wine">Slet en vin</h4>
<p>Åbn vinen, tryk <i>Rediger</i> og så <i>Slet vin</i> nederst. Du bliver spurgt først, og bagefter kan du trykke <i>Fortryd</i> i nogle sekunder. En vin, som gæster har bestilt, kan ikke slettes – fjern den fra smagningen i stedet.</p>
<h4>Producent og kort</h4>
<p>Producentens hjemmeside og adresse findes automatisk, mens du skriver. Adressen placeres som en nål på kortet, når den kan findes præcist. Oprindelse (land, region, appellation) farver regionen på kortet – for Bordeaux, Douro, Bourgogne, Champagne, Roussillon, Rhône, Toscana, Piemonte, Rioja og Mosel på et detaljeret kort.</p>
<h4>Billede</h4>
<p>Træk et billede ind, vælg en fil – eller tryk <i>Find et officielt billede</i> for at hente producentens eget flaskebillede.</p>
<h4 id="tasting-wines">Vinene i en smagning</h4>
<p>På smagningen tilføjer du vine med <a href="t:wines/?open=tw-add-toggle">Vine → Tilføj vin</a>: skriv navnet, og vine fra dit bibliotek vises med <i>Tilføj</i>. Et link eller et billede opretter en ny vin, som kommer både i biblioteket og i smagningen – på samme måde som under <a href="#new-wine">Ny vin</a>.</p>
<p>På smagningens fane <a href="t:wines/">Vine</a> står vinene i den rækkefølge, de skænkes, med pris, hvad gæsterne ser (<i>Synlig</i>, <i>Blind</i> eller <i>Skjult</i>), om de kan bestilles, og gæsternes gennemsnitlige karakter. Træk i ⋮⋮ for at ændre rækkefølgen. I vinens panel i biblioteket står gæsteprisen i hver smagning under butikkens priser – <i>Ret</i> åbner vinen i smagningen. Har en vin ingen pris endnu, får den butiksprisen (eller tilbudsprisen på 1 flaske), så snart du giver vinen en pris i biblioteket. Tryk på blyanten (<i>Rediger</i>) ved en vin for at sætte gæsteprisen, butiksprisen (den gemmes på vinen i biblioteket), mængdepriser (fx "fra 6 flasker 249,95 kr. pr. stk."), hvad gæsterne ser, om den kan bestilles, og dens plads. Vinens navn åbner dens side i biblioteket med oprindelse, kort og beskrivelse. Skraldespanden i rækken fjerner vinen fra smagningen – den bliver i dit bibliotek; du bliver spurgt først og kan trykke <i>Fortryd</i> bagefter. En blind vin har sit eget øje-ikon (<i>Afslør</i>) i listen.</p>`,
      en: `<p>Your wine library under <a href="/admin/wines/">Wines</a> is shared by all hosts on the account, and a wine can be used in many tastings.</p>
<h4 id="filter-wines">Finding your wines</h4>
<p>Above the list you can <a href="/admin/wines/">filter</a> by <b>country</b>, <b>region</b>, <b>type</b> and <b>tasting</b> – and search in free text. Each filter is a button with a list of ticks, like the filter on the guest list: <i>All</i> ticks everything; untick one and <i>All</i> is unticked, and you can choose several at once (e.g. France and Italy). The regions follow the countries: choose countries and only their regions are shown. Under tasting you can also choose <i>Not in any tasting</i>. The number next to each is the number of wines, the button shows what is chosen, and <i>Clear filters</i> shows them all again. The filters are kept in the address, so they are still there when you go back from a wine.</p>
<h4 id="new-wine">New wine</h4>
<p>Press <a href="/admin/wines/?open=wine-add-toggle">New wine</a> (under Wines or on the Overview). A new row slides in at the top of the list, where you can:</p>
<ul>
<li><b>Type the name</b> – as you type, wines in your library with the same name are shown, so you do not make a copy. Press <i>Add</i> to create a new one with that name; a year in the name becomes the vintage. The wine’s page then offers to fetch the rest from a link or a photo.</li>
<li><b>Paste a link to a shop</b> – name, type, vintage, origin, description, prices, grapes, "goes with", serving and picture are fetched from the page.</li>
<li><b>Choose a photo of the label</b> (or drag it in or paste it) – name, producer, vintage, type and more are read from the photo.</li>
</ul>
<p>With a link or a photo, a row in the list shows what comes in – last the producer's website and address. Then the wine moves into the list and lights up, and a short message shows at the bottom. You can add more wines in a row while the rows work. If the page or the label cannot be read, the row says so, and <i>Type the name</i> lets you type the name yourself – the link or photo is still saved with the wine. The same wine (same name and vintage) cannot be in the library twice – if you already have it, it is suggested instead. For another vintage, type the year after the name, e.g. <i>Barolo 2019</i>.</p>
<p>Always check the wine afterwards with <i>Edit</i> – the automatic part is a good start, not a guarantee. Only the <b>name</b> is needed; the rest you can add later. If something is written wrong, e.g. a vintage without a number or a price that is not a number, it says so in red right under the field. Prices and alcohol can be written with a comma or a point. A <i>shop offer</i> can be for 1 bottle (a lower price each) or more: when the wine goes into a tasting, an offer on 1 bottle becomes the guest price, and an offer on several becomes the quantity price. A wine fetched from a link says <i>Fetched from … (date)</i>, and the refresh icon fetches it again. If the picture is wrong (e.g. the back label), you can choose another.</p>
<h4 id="delete-wine">Deleting a wine</h4>
<p>Open the wine, press <i>Edit</i> and then <i>Delete wine</i> at the bottom. You are asked first, and afterwards you can press <i>Undo</i> for a few seconds. A wine that guests have ordered cannot be deleted – remove it from the tasting instead.</p>
<h4>Producer and map</h4>
<p>The producer's website and address are found automatically as you type. The address is placed as a pin on the map when it can be found exactly. The origin (country, region, appellation) colours the region on the map – for Bordeaux, Douro, Bourgogne, Champagne, Roussillon, the Rhône, Tuscany, Piedmont, Rioja and the Mosel on a detailed map.</p>
<h4>Picture</h4>
<p>Drag a picture in, choose a file – or press <i>Find an official picture</i> to fetch the producer's own bottle shot.</p>
<h4 id="tasting-wines">The wines in a tasting</h4>
<p>In a tasting you add wines with <a href="t:wines/?open=tw-add-toggle">Wines → Add wine</a>: type the name, and wines from your library are shown with <i>Add</i>. A link or a photo creates a new wine that goes into both the library and the tasting – the same way as under <a href="#new-wine">New wine</a>.</p>
<p>On the tasting's <a href="t:wines/">Wines</a> tab the wines are listed in the order they are poured, with price, what the guests see (<i>Shown</i>, <i>Blind</i> or <i>Hidden</i>), whether they can be ordered, and the guests' average rating. Drag ⋮⋮ to change the order. In the wine's panel in the library the guest price in each tasting is shown under the shop's prices – <i>Change</i> opens the wine in the tasting. A wine without a price yet gets the shop price (or the offer price on 1 bottle) as soon as you give the wine a price in the library. Press the pencil (<i>Edit</i>) by a wine to set the guest price, the shop price (saved on the wine in the library), quantity prices (e.g. "from 6 bottles 249.95 kr. each"), what the guests see, whether it can be ordered and its place. The wine’s name opens its page in the library with origin, map and description. The trash in the row removes the wine from the tasting – it stays in your library; you are asked first and can press <i>Undo</i> afterwards. A blind wine has its own eye icon (<i>Reveal</i>) in the list.</p>`,
    },
  },
  {
    id: 'blind',
    title: { da: 'Blindsmagning', en: 'Blind tasting' },
    body: {
      da: `<p>En blind vin vises for gæsterne som "Vin 3" med en flaskesilhuet i vinens farve (rød, hvid, rosé, mousserende …). Navn, producent, årgang, oprindelse, billede, pris og noter vises ikke – de sendes slet ikke til gæsternes telefoner. Gæsterne kan give karakter og skrive noter, men ikke bestille vinen.</p>
<ul>
<li><b>Hele smagningen:</b> slå <a href="t:settings/#controls">Blindsmagning</a> til under kontakterne. Alle vine bliver blinde, og vine du tilføjer senere starter blinde.</li>
<li><b>Enkelte vine:</b> tryk på blyanten (<i>Rediger</i>) ved vinen under <a href="t:wines/">Vine</a>, og vælg <i>Blind</i> under <i>Gæsterne ser</i>.</li>
<li><b>Afslør:</b> tryk <i>Afslør</i> ved vinen under <a href="t:wines/">Vine</a> – i den rækkefølge, der passer aftenen. Gæsternes skærme skifter selv til den rigtige vin inden for ca. 15 sekunder.</li>
</ul>`,
      en: `<p>Guests see a blind wine as "Wine 3" with a bottle silhouette in the wine's colour (red, white, rosé, sparkling …). Name, producer, vintage, origin, picture, price and notes are not shown – they are not even sent to the guests' phones. Guests can rate it and write notes, but cannot order it.</p>
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
<h4 id="invite">Inviter</h4>
<p>Tryk <a href="t:guests/?open=g-invite-toggle">Gæster → + Tilføj gæst</a> på smagningen. Øverst i listen glider en ny række ind: skriv navnet, og gæster fra din gæsteliste vises med en knap. En ny gæst skriver du med navn og e-mail (e-mail er valgfri) og trykker Enter eller knappen. Er <i>Send invitationen på mail</i> slået til, og har gæsten en e-mail, hedder knappen <i>Tilføj og inviter</i> – så sendes invitationen med det samme. Ellers hedder den <i>Tilføj</i>. Den nye gæst kommer også i din gæsteliste. Har du allerede gæsten (samme e-mail eller navn), er det den, der tilføjes; er gæsten allerede med, står der <i>✓ Tilføjet</i>. Rækken bliver åben, så du kan tilføje flere i træk; × lukker den.</p>
<h4 id="invite-mail">Invitation på mail – eller link</h4>
<p>Med <i>Send invitationen på mail</i> (under felterne i rækken) slået til får gæster med e-mail en mail med tid, sted og en knap til deres personlige invitation. Svarer gæsten på mailen, går svaret til dig. Under hver gæst står, hvornår invitationen blev sendt. En gæst, der aldrig har fået den, har et ✉-ikon i rækken, der sender den. Ellers trykker du på blyanten (<i>Rediger</i>) og vælger <i>Send igen</i> eller <i>Kopiér link</i>.</p>
<p>Uden e-mail: tryk på link-ikonet i rækken (eller <i>Kopiér link</i> under blyanten) og send linket selv, fx på sms. Linket er personligt – det er gæstens adgang til smagningen.</p>
<h4>Svar</h4>
<p>Gæsten svarer ja eller nej og kan skrive kost-hensyn og en note. Under <a href="t:guests/">Gæster</a> står hver gæst på en række som vinene: status, <i>Betalt</i>/<i>Ikke betalt</i> når der er gebyr, kost-hensyn, en besked og hvor mange flasker gæsten har bestilt. Med filterknappen ved siden af <i>+ Tilføj gæst</i> vælger du, hvem der vises: <i>Alle</i> sætter flueben ved <i>Kommer, Venteliste, Ikke svaret</i> og <i>Kommer ikke</i>; fjerner du et af dem, ryger fluebenet ved <i>Alle</i>. <i>Mangler e-mail</i> viser kun dem uden e-mail blandt de valgte. Knappen viser, hvad der er valgt, og hvor mange det er. Blyanten (<i>Rediger</i>) åbner sidepanelet, hvor du sender invitationen, ændrer status, markerer gebyret betalt, retter e-mail – eller fjerner gæsten fra smagningen. Skraldespanden i rækken fjerner også gæsten fra smagningen (gæsten bliver i din gæsteliste); du bliver spurgt først og kan trykke <i>Fortryd</i> bagefter.</p>`,
      en: `<p>Your guest library under <a href="/admin/guests/">Guests</a> is shared by the account's hosts, so you can invite the same guests again. <a href="/admin/guests/?open=add-toggle">Add a guest</a> to the library: a new row with name and email slides in at the top of the list. The pencil edits a guest and the trash deletes it – you are asked first, and afterwards you can press <i>Undo</i> for a few seconds. A guest who is invited is removed from those tastings too.</p>
<h4 id="invite">Invite</h4>
<p>Press <a href="t:guests/?open=g-invite-toggle">Guests → + Add guest</a> on the tasting. A new row slides in at the top of the list: type the name, and guests from your guest list are shown with a button. For a new guest, type the name and email (the email is optional) and press Enter or the button. When <i>Send the invitation by email</i> is on and the guest has an email, the button says <i>Add and invite</i> – the invitation is sent straight away. Otherwise it says <i>Add</i>. The new guest goes into your guest list too. If you already have the guest (same email or name), that guest is added; a guest who is already in says <i>✓ Added</i>. The row stays open so you can add several in a row; × closes it.</p>
<h4 id="invite-mail">Invitation by email – or link</h4>
<p>With <i>Send the invitation by email</i> (under the fields in the row) turned on, guests with an email get a mail with the time, the place and a button to their personal invitation. If the guest replies to the mail, the reply goes to you. Under each guest it says when the invitation was sent. A guest who never got it has a ✉ icon in the row that sends it. Otherwise press the pencil (<i>Edit</i>) and choose <i>Send again</i> or <i>Copy link</i>.</p>
<p>Without an email: press the link icon in the row (or <i>Copy link</i> under the pencil) and send the link yourself, e.g. by text message. The link is personal – it is the guest's access to the tasting.</p>
<h4>Replies</h4>
<p>The guest replies yes or no and can add dietary needs and a note. Under <a href="t:guests/">Guests</a> each guest has a row like the wines: status, <i>Paid</i>/<i>Not paid</i> when there is a fee, dietary needs, a note and how many bottles they ordered. With the filter button next to <i>+ Add guest</i> you choose who is shown: <i>All</i> ticks <i>Coming, Waiting list, No reply yet</i> and <i>Not attending</i>; untick one of them and <i>All</i> is unticked. <i>Missing email</i> shows only those without an email among the chosen. The button shows what is chosen and how many. The pencil (<i>Edit</i>) opens the side panel, where you send the invitation, change the status, mark the fee paid, correct the email – or remove the guest from the tasting. The trash in the row also removes the guest from the tasting (the guest stays in your guest list); you are asked first and can press <i>Undo</i> afterwards.</p>`,
    },
  },
  {
    id: 'evening',
    title: { da: 'Under aftenen', en: 'During the evening' },
    body: {
      da: `<ul>
<li><b><a href="g:wines/">Vinene</a></b> – gæsterne bladrer gennem vinene på telefonen, med billede, kort, druer, mad og servering, og giver hver vin stjerner og noter.</li>
<li><b>Quiz</b> – <a href="t:quiz/?open=q-add-toggle">lav spørgsmål</a> med svarmuligheder under fanen <a href="t:quiz/">Quiz</a>. Slå <a href="t:settings/#controls">Svare på quizzen</a> til, når gæsterne skal svare, og <i>Quiz afsluttet</i>, når de rigtige svar og stillingen skal vises.</li>
<li><b>Quiz-forslag fra AI</b> – vælg sværhedsgrad (<i>Let, Mellem, Ekspert</i>) og tryk <a href="t:quiz/#q-ai">Forslag fra AI</a>. Du får 5 spørgsmål ud fra vinene – om land og region, druer, alder, fremstilling, begreber og "hvilken passer ikke ind". Ved en almindelig smagning handler spørgsmålene om viden omkring vinene (regionen, druerne, fremstillingen), ikke om det, gæsterne kan læse på vinens kort; kun blinde vine får gættespørgsmål. Forslagene tilføjes kun, når du trykker <i>Tilføj</i>; tjek de rigtige svar, og ret spørgsmålet bagefter som alle andre. <i>Flere forslag</i> giver nye uden gentagelser.</li>
<li><b><a href="t:chat/">Chat</a></b> – en fælles chat for aftenen, som både du og gæsterne kan skrive i.</li>
<li><b>Blinde vine</b> – afslør dem undervejs, se <a href="#blind">Blindsmagning</a>.</li>
</ul>`,
      en: `<ul>
<li><b><a href="g:wines/">The wines</a></b> – guests browse the wines on their phone, with picture, map, grapes, food and serving, and give each wine stars and notes.</li>
<li><b>Quiz</b> – <a href="t:quiz/?open=q-add-toggle">make questions</a> with answer options on the <a href="t:quiz/">Quiz</a> tab. Turn on <a href="t:settings/#controls">Answer the quiz</a> when the guests should answer, and <i>Quiz finished</i> when the right answers and the standings should be shown.</li>
<li><b>Quiz suggestions from AI</b> – choose a difficulty (<i>Easy, Medium, Expert</i>) and press <a href="t:quiz/#q-ai">Suggestions from AI</a>. You get 5 questions from the wines – about country and region, grapes, age, how it is made, terms and "odd one out". In an ordinary tasting the questions are about the knowledge around the wines (the region, the grapes, how it is made), not what guests can read on the wine's card; only blind wines get guessing questions. Suggestions are only added when you press <i>Add</i>; check the right answers, and edit the question afterwards like any other. <i>More suggestions</i> gives new ones without repeats.</li>
<li><b><a href="t:chat/">Chat</a></b> – a shared chat for the evening that you and the guests can write in.</li>
<li><b>Blind wines</b> – reveal them as you go, see <a href="#blind">Blind tasting</a>.</li>
</ul>`,
    },
  },
  {
    id: 'orders',
    title: { da: 'Bestillinger og betaling', en: 'Orders and payment' },
    body: {
      da: `<p>Når <a href="t:settings/#controls">Bestilling åben</a> er slået til, kan gæsterne lægge de vine i kurven, der kan bestilles, og sende bestillingen. Mængdepriser gælder automatisk.</p>
<h4 id="bulk">Mængderabat – hver gæst eller alle samlet</h4>
<p>Har en vin en mængdepris (fx "fra 6 flasker 359,95 kr."), vælger du under <a href="t:orders/#bulk-mode">Bestillinger → Bestille vin</a>, hvem der tæller med – valget vises kun, når en vin i smagningen har mængdepris. Du skal vælge, før du kan åbne for bestillinger:</p>
<ul>
<li><b>Hver gæst for sig</b> – en gæst, der bestiller 6 (også fordelt på flere bestillinger), får mængdeprisen.</li>
<li><b>Alle gæster sammen</b> – god til vinklubber og fællesindkøb: når gæsterne tilsammen bestiller 6, får alle mængdeprisen. Gæsterne ser "Sammen har I bestilt 4 af 6 – 2 flasker mere …". Priserne er foreløbige, indtil du lukker for bestillinger, og gæsterne bliver bedt om at vente med at betale til da.</li>
</ul>
<p>Når grænsen er nået, gælder den billige pris for alle flasker – også dem ud over 6. Betalte bestillinger beholder deres pris.</p>
<p>Under fanen <a href="t:orders/">Bestillinger</a> ser du alle bestillinger, markerer dem betalt og kan <a href="t:orders/#csv">hente dem som CSV</a> til leverandøren.</p>
<p>Under <a href="/admin/payments/#mp-number">Betaling</a> skriver du dit MobilePay-nummer. Gæsterne får så en knap, der åbner MobilePay med beløb og besked udfyldt – både til bestillinger og deltagergebyr.</p>`,
      en: `<p>When <a href="t:settings/#controls">Ordering open</a> is on, guests can put the wines that can be ordered in the cart and send the order. Quantity prices apply automatically.</p>
<h4 id="bulk">Quantity prices – each guest or everyone together</h4>
<p>When a wine has a quantity price (e.g. "from 6 bottles 359.95 kr."), you choose under <a href="t:orders/#bulk-mode">Orders → Order wine</a> who counts – the choice only shows when a wine in the tasting has a quantity price. You must choose before you can open ordering:</p>
<ul>
<li><b>Each guest</b> – a guest who orders 6 (also over several orders) gets the quantity price.</li>
<li><b>All guests together</b> – good for wine clubs and joint orders: when the guests together order 6, everyone gets the quantity price. Guests see "Together you have ordered 4 of 6 – 2 more …". Prices are provisional until you close ordering, and guests are asked to wait with paying until then.</li>
</ul>
<p>Once the quantity is reached, the lower price applies to every bottle – also those beyond 6. Paid orders keep their price.</p>
<p>On the <a href="t:orders/">Orders</a> tab you see all orders, mark them paid and can <a href="t:orders/#csv">download them as CSV</a> for the supplier.</p>
<p>Under <a href="/admin/payments/#mp-number">Payments</a> you enter your MobilePay number. Guests then get a button that opens MobilePay with the amount and message filled in – for orders and the tasting fee.</p>`,
    },
  },
  {
    id: 'account',
    title: { da: 'Konto og værter', en: 'Account and hosts' },
    body: {
      da: `<p>Under <a href="/admin/account/">Konto og værter</a> kan kontoen få et navn, fx en vinklub. Ejeren – den der oprettede kontoen – kan invitere flere værter. Alle værter på kontoen ser og retter alle smagninger, vine og gæster. Ejeren kan ikke fjernes.</p>
<p>Under <a href="/profile/">Profil</a> (menuen øverst til højre) retter du dit navn, din e-mail og dit sprog. Du logger ind med en kode på mail; <i>Husk mig</i> holder dig logget ind på enheden.</p>
<h4 id="notify">Mails til dig om gæsterne</h4>
<p>Under <a href="/profile/#notify">Profil → Mail til mig, når en gæst …</a> vælger du, hvad du vil have mail om: når en gæst siger ja (også venteliste og oprykning), siger nej, skriver en note eller et kost-hensyn, skriver i chatten eller bestiller vin. Alt er slået fra fra start. Det gælder alle smagninger, du er vært eller medvært for; flere ting på én gang kommer i én mail pr. smagning, og du får aldrig mail om noget, du selv har gjort.</p>`,
      en: `<p>Under <a href="/admin/account/">Account and hosts</a> the account can get a name, e.g. a wine club. The owner – whoever created the account – can invite more hosts. Every host on the account sees and edits all tastings, wines and guests. The owner cannot be removed.</p>
<p>Under <a href="/profile/">Profile</a> (the menu at the top right) you change your name, email and language. You sign in with a code by email; <i>Remember me</i> keeps you signed in on the device.</p>
<h4 id="notify">Emails to you about the guests</h4>
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
<li><b>Quiz, stilling og chat</b> under aftenen.</li>
<li><b>Min vinbog</b> – de vine gæsten har smagt, egne karakterer og køb på tværs af smagninger (når gæsten logger ind med sin e-mail).</li>
</ul>
<p>Tip: <a href="g:">åbn gæstesiden</a> for at se smagningen, som gæsterne gør (eller brug <i>Gæsteside ↗</i> øverst på smagningen).</p>`,
      en: `<ul>
<li><b><a href="g:">The invitation</a></b> – about the evening, time and place, "Add to calendar", reply yes/no with diet and note, and a map of where the wines come from.</li>
<li><b>The wines</b> – one wine at a time, with rating and notes; cart and ordering when it is open.</li>
<li><b>Quiz, standings and chat</b> during the evening.</li>
<li><b>My wine book</b> – the wines the guest has tasted, their own ratings and purchases across tastings (when the guest signs in with their email).</li>
</ul>
<p>Tip: <a href="g:">open the guest page</a> to see the tasting the way the guests do (or use <i>Guest page ↗</i> at the top of the tasting).</p>`,
    },
  },
  {
    id: 'faq',
    title: { da: 'Spørgsmål og svar', en: 'Questions and answers' },
    body: {
      da: `<h4>Gæsten har ikke fået invitationen</h4>
<p>Tjek at gæsten har den rigtige e-mail, og bed gæsten kigge i uønsket post. Tryk <i>Send igen</i> under <a href="t:guests/">Gæster</a>, eller kopier linket og send det på sms.</p>
<h4>Gæsten kan ikke bestille en vin</h4>
<p>Tjek at <a href="t:settings/#controls">Bestilling åben</a> er slået til, og under <a href="t:wines/">Vine</a> at vinen kan bestilles og ikke er blind.</p>
<h4>Gæsten kan ikke se en vin</h4>
<p>Tjek <i>Gæsterne ser</i> ved vinen under <a href="t:wines/">Vine</a> – den kan stå på <i>Intet (skjult)</i>.</p>
<h4>"Inviter gæst" kan ikke trykkes</h4>
<p>En smagning skal have mindst én vin, før du kan invitere gæster. Tilføj en under <a href="t:wines/?open=tw-add-toggle">Vine</a>.</p>
<h4>Kan jeg ændre rækkefølgen af vinene?</h4>
<p>Ja, med ↑ ↓ på smagningens fane <a href="t:wines/">Vine</a>. Nummeret, gæsterne ser, følger rækkefølgen.</p>
<h4>Jeg kan ikke se en smagning, jeg er inviteret til</h4>
<p>Når du er logget ind, ser du kun invitationer til den e-mail, du er logget ind med. Er du inviteret med en anden e-mail, så åbn invitationslinket og vælg <i>Log ud og åbn invitationen</i> – eller bed værten rette din e-mail på gæstelisten.</p>
<h4>Gæsten har mistet sit link</h4>
<p>Send invitationen igen, eller lad gæsten logge ind på winetastr.com med sin e-mail.</p>`,
      en: `<h4>The guest has not received the invitation</h4>
<p>Check the guest's email, and ask the guest to look in their junk mail. Press <i>Send again</i> under <a href="t:guests/">Guests</a>, or copy the link and send it by text message.</p>
<h4>A guest cannot order a wine</h4>
<p>Check that <a href="t:settings/#controls">Ordering open</a> is on, and under <a href="t:wines/">Wines</a> that the wine can be ordered and is not blind.</p>
<h4>A guest cannot see a wine</h4>
<p>Check <i>Guests see</i> on the wine under <a href="t:wines/">Wines</a> – it may be set to <i>Nothing (hidden)</i>.</p>
<h4>"Invite guest" cannot be pressed</h4>
<p>A tasting needs at least one wine before you can invite guests. Add one under <a href="t:wines/?open=tw-add-toggle">Wines</a>.</p>
<h4>Can I change the order of the wines?</h4>
<p>Yes, with ↑ ↓ on the tasting's <a href="t:wines/">Wines</a> tab. The number the guests see follows the order.</p>
<h4>I cannot see a tasting I am invited to</h4>
<p>When you are signed in, you only see invitations to the email you are signed in with. If you were invited with another email, open the invitation link and choose <i>Sign out and open the invitation</i> – or ask the host to correct your email on the guest list.</p>
<h4>A guest has lost their link</h4>
<p>Send the invitation again, or let the guest sign in at winetastr.com with their email.</p>`,
    },
  },
];

/** The short tips behind the "?" buttons: a sentence or two, and where to read more */
// t: links go to the tasting chosen at the top of the help (its admin), g: links to its guest page
export const TIPS: Record<string, { text: Text; more: string }> = {
  blind: { more: 'blind', text: {
    da: 'Alle vine bliver blinde: gæsterne ser kun nummer og farve, til du trykker <i>Afslør</i> ved vinen. Nye vine starter blinde.',
    en: 'All wines become blind: guests see only the number and colour until you press <i>Reveal</i> on the wine. New wines start blind.' } },
  'guests-see': { more: 'blind', text: {
    da: '<b>Vinen</b>: alt vises. <b>Blind</b>: kun nummer og farve, til du afslører den. <b>Intet</b>: vinen er skjult for gæsterne.',
    en: '<b>The wine</b>: everything is shown. <b>Blind</b>: only number and colour until you reveal it. <b>Nothing</b>: the wine is hidden from the guests.' } },
  'max-guests': { more: 'max-guests', text: {
    da: 'Når smagningen er fuld, kommer nye ja-svar på venteliste. Melder nogen fra, rykker den første på listen op af sig selv.',
    en: 'When the tasting is full, new yes replies go on the waiting list. When someone drops out, the first on the list moves up by itself.' } },
  'invite-mail': { more: 'invite-mail', text: {
    da: 'Gæster med e-mail får en mail med tid, sted og en knap til deres personlige invitation. Svar på mailen går til dig.',
    en: 'Guests with an email get a mail with time, place and a button to their personal invitation. Replies to the mail go to you.' } },
  'new-wine': { more: 'new-wine', text: {
    da: 'Skriv navnet, indsæt et link til butikken eller vælg et billede af etiketten – med link eller billede udfyldes det meste af sig selv.',
    en: 'Type the name, paste a link to the shop or choose a photo of the label – with a link or a photo most of it fills itself in.' } },
  'orders-open': { more: 'orders', text: {
    da: 'Gæsterne kan lægge vine i kurven og bestille. Kun vine, der kan bestilles og ikke er blinde.',
    en: 'Guests can put wines in the cart and order. Only wines that can be ordered and are not blind.' } },
  quiz: { more: 'evening', text: {
    da: '<b>Svare på quizzen</b>: gæsterne kan svare. <b>Se quizzens facit</b>: de rigtige svar og stillingen vises.',
    en: '<b>Answer the quiz</b>: guests can answer. <b>See the quiz answers</b>: the right answers and the standings are shown.' } },
  fee: { more: 'fee', text: {
    da: 'Skriv det samlede indkøb, så foreslås et gebyr pr. gæst, der kommer. Du markerer selv, hvem der har betalt.',
    en: 'Enter the total purchase and a fee per guest who is coming is suggested. You mark yourself who has paid.' } },
  'ai-intro': { more: 'ai-intro', text: {
    da: 'AI skriver et udkast ud fra vinene. Det vises under din tekst – intet overskrives, før du vælger <i>Brug udkastet</i>, og <i>Fortryd</i> henter din tekst tilbage.',
    en: 'AI writes a draft from the wines. It is shown below your text – nothing is replaced until you choose <i>Use the draft</i>, and <i>Undo</i> brings your text back.' } },
  'ai-quiz': { more: 'evening', text: {
    da: 'AI foreslår 5 spørgsmål ud fra vinene i den valgte sværhedsgrad. Intet kommer i quizzen, før du trykker <i>Tilføj</i> – tjek det rigtige svar først.',
    en: 'AI suggests 5 questions from the wines at the chosen difficulty. Nothing goes into the quiz until you press <i>Add</i> – check the right answer first.' } },
  'bulk-mode': { more: 'bulk', text: {
    da: '<b>Hver gæst</b>: gæstens egne flasker tæller. <b>Samlet</b>: alle gæsters flasker af en vin tæller sammen – godt til vinklubber. Priserne er så foreløbige, til du lukker for bestillinger.',
    en: '<b>Each guest</b>: the guest\'s own bottles count. <b>Together</b>: all the guests\' bottles of a wine count together – good for wine clubs. Prices are then provisional until you close ordering.' } },
  'account-hosts': { more: 'account', text: {
    da: 'Alle værter på kontoen ser og retter alle smagninger, vine og gæster. Kun ejeren kan tilføje og fjerne værter.',
    en: 'Every host on the account sees and edits all tastings, wines and guests. Only the owner can add and remove hosts.' } },
};
