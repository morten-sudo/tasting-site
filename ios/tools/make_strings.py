#!/usr/bin/env python3
# Builds Winetastr/Localizable.xcstrings: site texts from the website's dictionaries, app texts below.
import json, re, urllib.request
BASE = 'https://raw.githubusercontent.com/morten-sudo/tasting-site/main/src/i18n/%s.ts'
SITE = '''common.email common.save common.saved common.cancel common.continue nav.myTastings nav.wines nav.signOut
home.upcomingMany tastings.past tastingHome.about tastingHome.yourAnswer tastingHome.change tastingHome.coming tastingHome.host tastingHome.hosts
tastingHome.closedHint guest.fullHint guest.coming guest.note guest.canChange
guest.welcome guest.emailLead guest.yourEmail guest.emailBad guest.emailMissing guest.emailTaken guest.emailLocked guest.emailNotSaved
guest.chooseYesNo guest.answerNotSaved guest.signupClosed status.yes status.no status.waitlist rating.title rating.note blind.blind blind.hint
login.mailLead login.sendCode login.sentTo login.enterIt login.codeLabel login.submit login.resend login.otherEmail login.inviteSummary
login.inviteHelp login.inviteLabel login.unknownEmail login.tooManyMails login.sendFailed login.wholeCode login.tooManyTries login.wrongCode
login.resent login.pasteCode login.codeNotFound login.otherInvite login.tooManyChecks
nav.tasting wines.intro wines.readMore wines.position wine.all wine.vintage loginx.claim loginx.noPassword loginx.or loginx.code login.title rating.notePlaceholder home2.hello login.lostHint
nav.home nav.profile nav.userMenu book.title book.linkText book.statWines book.statTastings book.statBottles book.linkOnly book.tabWines book.tabTastings book.tabOrders book.sort book.sortRecent book.sortRating book.sortName book.noWines book.noWinesTitle book.noMatch book.tastedAt book.bought book.ordersSum book.showAll book.noOrdersText tastings.none profile.name profile.nameHint profile.linkOnly profile.language profile.edit profile.noOrders profile.emailConfirm profile.emailNotChanged host.nameMissing admin.changesNotSaved adminTasting.search pay.orderComment cart.total cart.paid cart.awaiting
style.Red style.WhiteWine style.Rose style.Orange style.Sparkling style.Sweet style.Fortified style.Other'''.split()
APP = {
 'app.previous': ('Forrige','Previous','Fyrri'),
 'app.next': ('Næste','Next','Næsta'),
 'app.retry': ('Prøv igen','Try again','Reyna aftur'),
 'app.offline': ('Ingen forbindelse','No connection','Engin tenging'),
 'app.loadFailedTitle': ('Kunne ikke hentes','Could not load','Tókst ekki að sækja'),
 'app.loadFailedText': ('Tjek din forbindelse, og prøv igen.','Check your connection and try again.','Athugaðu tenginguna og reyndu aftur.'),
 'app.spamHint': ('Kan du ikke finde mailen, så kig i spam. Skriv koden her i appen.','Can’t find the email? Check your spam folder. Enter the code here in the app.','Finnurðu ekki póstinn? Athugaðu ruslpóstinn. Sláðu kóðann inn hér í appinu.'),
 'app.addInvitation': ('Tilføj invitation','Add invitation','Bæta við boði'),
 'app.language': ('Sprog','Language','Tungumál'),
 'app.account': ('Konto','Account','Aðgangur'),
 'app.noTastingsTitle': ('Ingen smagninger endnu','No tastings yet','Engar smakkanir enn'),
 'tastings.noneHint': ('Har du fået et link i en invitation, så indsæt det her.','Got a link in an invitation? Paste it here.','Fékkstu tengil í boði? Límdu hann hér.'),
 'app.notAnswered': ('Ikke svaret','Not answered','Ekki svarað'),
 'app.answer': ('Svar på invitationen','Answer the invitation','Svara boðinu'),
 'app.yesTitle': ('Ja, jeg kommer','Yes, I’m coming','Já, ég kem'),
 'app.noTitle': ('Nej, jeg kan ikke','No, I can’t make it','Nei, ég kemst ekki'),
 'app.notePlaceholder': ('Valgfrit','Optional','Valfrjálst'),
 'app.winesSub': ('{n} vine – læs og bedøm','{n} wines – read and rate','{n} vín – lestu og gefðu einkunn'),
 'app.noWines': ('Ingen vine endnu','No wines yet','Engin vín enn'),
 'app.blindName': ('Vin {n}','Wine {n}','Vín {n}'),
 'app.starsLabel': ('{n} stjerner','{n} stars','{n} stjörnur'),
 'app.ratingNotePlaceholder': ('Kun du kan se dem','Only you can see them','Aðeins þú sérð þær'),
 'app.notSaved': ('Ikke gemt','Not saved','Ekki vistað'),
 'app.aboutWine': ('Om vinen','About the wine','Um vínið'),
 'app.origin': ('Oprindelse','Origin','Uppruni'),
 'app.grapes': ('Druer','Grapes','Þrúgur'),
 'app.foodPairing': ('Passer til','Goes with','Passar með'),
 'app.serving': ('Servering','Serving','Framreiðsla'),
 'app.abv': ('Alkohol','Alcohol','Áfengi'),
}
def load(lang):
    src = urllib.request.urlopen(BASE % lang).read().decode()
    d = {}
    for m in re.finditer(r'^\s*"([^"]+)":\s*"((?:[^"\\]|\\.)*)",?\s*$', src, re.M):
        d[m.group(1)] = json.loads('"' + m.group(2) + '"')
    return d
da, en, is_ = load('da'), load('en'), load('is')
strings, missing = {}, []
def add(key, values):
    strings[key] = {'localizations': {l: {'stringUnit': {'state': 'translated', 'value': v}} for l, v in values.items()}}
for k in SITE:
    if k in APP: continue
    vals = {}
    for l, d in (('da', da), ('en', en), ('is', is_)):
        if k in d: vals[l] = re.sub(r'<[^>]+>', '', d[k])
        else: missing.append(l + ':' + k)
    add(k, vals)
for k, (a, b, c) in APP.items(): add(k, {'da': a, 'en': b, 'is': c})
json.dump({'sourceLanguage': 'en', 'strings': strings, 'version': '1.0'}, open('Winetastr/Localizable.xcstrings', 'w'), ensure_ascii=False, indent=1)
print(len(strings), 'strings; missing:', missing)
