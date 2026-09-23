"""Template-based synthetic seed data for the analysis classifier.

Produces fabricated, labelled training messages by filling per-language templates
— labels are correct by construction and every template is auditable here. This
is DEFENSIVE training data for a classifier that helps domestic-abuse survivors;
it is invented, not real evidence, and tagged source="synthetic-template".

Two honest limits, same as all synthetic data:
  • Low diversity — templates repeat structure. Use it to bootstrap; add LLM
    (synth.py) + public (map_public.py) + a hand-labelled eval set for real signal.
  • Never train on this alone, and have a DV/legal specialist review before trust.

    python seed_gen.py --per-template 6 --out data/seed.jsonl
    python data_tools.py validate --data data/seed.jsonl
    python data_tools.py stats    --data data/seed.jsonl
"""

import argparse
import json
import random
import re

from synth import PATTERNS  # (pattern_id, tags, severity) — the canonical labels

PAT = {pid: (tags, sev) for pid, tags, sev in PATTERNS}

# Slot vocabularies per language, for variety.
SLOTS = {
    "en": {
        "place": ["the cafe", "your work", "the station", "the school", "Bridge Street", "the gym"],
        "name": ["your sister", "your mum", "Sarah", "your friends", "your family"],
        "num": ["10", "15", "20", "30"],
        "do": ["do what i say", "come home now", "answer me"],
        "bodypart": ["arm", "jaw", "ribs", "nose", "fingers"],
        "amount": ["20", "50", "100", "200"],
        "kid": ["the kids", "the children", "our son", "our daughter"],
        "buy": ["anything", "new clothes", "makeup", "that"],
    },
    "fr": {
        "place": ["le café", "ton travail", "la gare", "l'école"],
        "name": ["ta sœur", "ta mère", "tes amis", "ta famille"],
        "num": ["10", "15", "20"],
        "do": ["fais ce que je dis", "rentres tout de suite", "me réponds"],
    },
    "es": {
        "place": ["el café", "tu trabajo", "la estación", "la escuela"],
        "name": ["tu hermana", "tu madre", "tus amigos", "tu familia"],
        "num": ["10", "15", "20"],
        "do": ["haces lo que digo", "vuelves ya", "me contestas"],
    },
    "ar": {
        "place": ["المقهى", "عملك", "المحطة", "المدرسة"],
        "name": ["أختك", "أمك", "أصدقائك", "عائلتك"],
        "num": ["10", "15", "20"],
    },
    "cy": {
        "place": ["y caffi", "dy waith", "yr orsaf", "yr ysgol"],
        "name": ["dy chwaer", "dy fam", "dy ffrindiau", "dy deulu"],
        "num": ["10", "15", "20"],
        "do": ["wneud be dw i'n ddweud", "ddod adref nawr", "fy ateb i"],
    },
}

# Per-language message templates keyed by pattern id. English is the fullest;
# the others cover the core patterns. {slot} placeholders are filled from SLOTS.
TEMPLATES = {
    "en": {
        "threat-critical": ["if you leave me i will kill you", "leave and you won't make it out alive", "i will end you if you tell anyone", "i swear i'll kill you", "if i can't have you no one will", "you walk out that door and you're dead", "i'll make sure they never find your body"],
        "threat-high": ["you'll regret it if you don't {do}", "you have no idea what i'm capable of", "watch your back", "i'll make you pay for this", "don't make me do something we'll both regret", "keep it up and see what happens", "you really don't want to find out what i'll do", "you're going to be sorry you did that"],
        "threat-stalking": ["i know where you work and i'll be waiting outside", "i'll find you wherever you go", "i saw you at {place}, you can't hide from me", "there's nowhere you can go that i won't find you", "i'll be outside {place} when you finish"],
        "stalking-surveillance": ["i saw you at {place} today", "i've been watching you leave {place}", "i know you were with {name} last night", "i drove past {place} and saw your car", "i've been parked outside watching who comes and goes"],
        "surveillance": ["i can see everywhere you've been", "i checked your phone again", "i know who you've been texting", "i track your location all day", "i read your messages while you were asleep", "i put an app on your phone so i always know where you are", "i went through your call history last night", "i can see your location right now", "i saw who you called today", "i've been reading your emails", "i know your passwords, i see everything", "why were you at that address for an hour", "i installed a tracker on your car", "i checked your search history again", "i can see when you're online and who you talk to"],
        "coercive-control": ["you're not allowed to go out without asking me", "you do what i say", "you need my permission for that", "i decide who you see", "you'll wear what i tell you to wear", "check with me before you make any plans", "you don't do anything unless i say it's okay"],
        "coercive-isolation": ["you're not seeing {name} anymore", "i don't want you talking to {name}", "stay away from your friends", "you don't need anyone but me", "your family is turning you against me, cut them off", "block {name}'s number right now", "i don't want {name} in this house again", "it's them or me, choose", "delete {name}'s number and show me you did it", "why are you still messaging {name}, i told you to stop", "you're not going to that party with your friends", "cut your family off, they don't care about you like i do", "i don't want you leaving the house while i'm at work", "unfriend {name} right now, i'm watching", "you spend too much time with {name}, it stops now"],
        "financial-abuse": ["i cancelled your card, you get money when i say", "you don't touch the account", "i control the money here", "you'll get an allowance when you behave", "hand over your wages when you get paid", "you don't need your own bank account", "i'll decide what you can and can't buy", "show me every receipt from today", "you spent my money without asking again", "quit your job, i'll handle the money", "you get {amount} for the week, make it last", "you don't spend a penny on {buy} without asking me", "i saw you spent {amount} again, explain it"],
        "contact-breach": ["stop ignoring me, answer now", "i've called you {num} times, pick up", "why won't you reply to me", "i'll keep messaging until you answer", "answer your phone or i'm coming over", "i can see you've read this, reply", "{num} missed calls and still nothing", "i'll show up at {place} if you keep ignoring me"],
        "harassment": ["stop pretending you didn't see this", "answer me", "you can't just ignore me", "i'm not going away", "i'll keep turning up until you talk to me", "you don't get to just walk away from me"],
        "child-threat": ["if you tell anyone i'll take {kid}", "you'll never see {kid} again", "{kid} stay with me or else", "i'll take {kid} and you'll never find us", "i'll tell the court you're an unfit mother", "no judge will ever give you {kid}", "say one word and {kid} are gone", "i'll make sure you lose custody", "{kid} will hate you by the time i'm done"],
        "intimidation": ["you should be scared of me", "you know what happens when you make me angry", "don't test me", "you'll be sorry", "you've seen what i can do", "remember what happened last time you talked back", "i'd be very careful if i were you", "you know i don't make empty threats", "you don't want to see me angry again", "think very carefully about your next move", "you remember what i'm like when i lose it", "don't push me, you know how this ends", "i wouldn't say that again if i were you", "you've made me angry now, and you know what that means", "keep it up and find out", "you're walking on very thin ice"],
        "degradation": ["you're worthless", "no one else would ever want you", "you're pathetic", "you're nothing without me", "you're a useless mess", "look at you, who'd want that", "you can't do anything right"],
        "degradation-manip": ["you're worthless and no one will believe you", "you made me do this", "it's your fault i get like this", "you're crazy, that never happened", "if you weren't so useless i wouldn't get angry", "you're imagining things again", "everyone knows you're the unstable one"],
        "sexual-coercion": ["you owe me, don't say no tonight", "if you loved me you wouldn't say no", "you're my partner, you don't get to refuse", "stop being frigid, this is your job", "you don't get to say no to me"],
        "sexual-threat": ["i'll send those photos to everyone", "everyone will see the pictures if you leave", "i still have the videos of you", "i'll post them online where your family will see", "leave and those pictures go straight to your work"],
        "physical-violence": ["i'll put you in the hospital", "come here so i can hit you", "i'll beat you if you don't stop", "i'll break your {bodypart}", "keep it up and i'll break your {bodypart}", "next time it won't just be your {bodypart}", "i should have hit you harder", "next time i won't stop at a slap", "you want another black eye", "i'll drag you out by your hair", "keep talking and i'll knock your teeth out"],
        "manipulation": ["if you leave i'll hurt myself", "i'll kill myself if you go", "you're the only reason i'm alive, don't leave me", "if you walk out i've got nothing to live for", "you'd be responsible for what i do to myself", "nobody else would put up with you, remember that", "after everything i've done for you, this is how you treat me", "no one else will ever love you like i do", "you always do this and then act like i'm the problem", "i only get like this because you push me to it"],
        "benign": ["can we sort out the kids' schedule for next week", "i'll drop the shopping round later", "are you free to talk about the bills", "the plumber is coming tuesday", "happy birthday, hope you have a lovely day", "can you send me the address for the party", "running 10 minutes late, see you soon", "did you remember to book the dentist", "the parcel got delivered to next door", "let's grab a coffee this weekend", "thanks for sorting dinner last night", "can you pick up milk on the way home", "the meeting got moved to thursday", "hope your day's going okay"],
    },
    "fr": {
        "threat-critical": ["si tu me quittes je te tue", "si tu pars tu le regretteras toute ta vie", "si je ne t'ai pas personne ne t'aura", "tu franchis cette porte et tu es morte"],
        "threat-high": ["tu vas le regretter si tu ne {do} pas", "tu n'as aucune idée de ce dont je suis capable", "fais attention à toi", "tu vas payer pour ça"],
        "threat-stalking": ["je sais où tu travailles et je vais venir", "je te retrouverai où que tu ailles", "tu ne peux te cacher nulle part"],
        "stalking-surveillance": ["je t'ai vue à {place} aujourd'hui", "je sais que tu étais avec {name} hier", "je suis passé devant {place} et j'ai vu ta voiture"],
        "surveillance": ["j'ai encore regardé ton téléphone", "je sais à qui tu écris", "je vois partout où tu vas", "j'ai lu tes messages pendant que tu dormais"],
        "coercive-control": ["tu ne sors pas sans me demander", "c'est moi qui décide qui tu vois", "tu fais ce que je dis", "tu me demandes avant de faire des projets"],
        "coercive-isolation": ["tu ne vois plus {name}", "reste loin de tes amis", "ta famille te monte contre moi, coupe les ponts", "bloque le numéro de {name} tout de suite"],
        "financial-abuse": ["je contrôle l'argent ici", "tu n'as pas accès au compte", "tu me donnes ton salaire quand tu es payée", "montre-moi tous les reçus", "je décide ce que tu peux acheter"],
        "contact-breach": ["arrête de m'ignorer, réponds", "je t'ai appelée {num} fois, réponds", "je vois que tu as lu, réponds", "je viendrai si tu continues à m'ignorer"],
        "harassment": ["réponds-moi", "tu ne peux pas m'ignorer comme ça", "je ne vais pas disparaître", "tu ne pars pas comme ça"],
        "intimidation": ["tu devrais avoir peur de moi", "ne me pousse pas à bout", "tu sais ce que je peux faire", "tu sais ce qui arrive quand tu me mets en colère"],
        "degradation": ["tu ne vaux rien sans moi", "personne d'autre ne voudra de toi", "tu es pathétique", "tu n'es rien sans moi"],
        "degradation-manip": ["tu ne vaux rien et personne ne te croira", "c'est toi qui m'as poussé à ça", "c'est ta faute si je deviens comme ça", "tu inventes encore des choses"],
        "child-threat": ["si tu parles je prends les enfants", "tu ne reverras jamais les enfants", "aucun juge ne te donnera la garde", "je dirai que tu es une mauvaise mère", "les enfants restent avec moi ou sinon"],
        "physical-violence": ["je vais te frapper", "je vais t'envoyer à l'hôpital", "la prochaine fois ce ne sera pas qu'une gifle", "je vais te casser le bras"],
        "sexual-coercion": ["tu me dois bien ça, ne dis pas non ce soir", "si tu m'aimais tu ne dirais pas non", "tu es ma compagne, tu ne refuses pas"],
        "sexual-threat": ["j'enverrai ces photos à tout le monde", "tout le monde verra les vidéos si tu pars", "je les mettrai en ligne pour que ta famille voie"],
        "manipulation": ["si tu pars je vais me faire du mal", "je me tuerai si tu me quittes", "tu serais responsable de ce que je me ferais", "après tout ce que j'ai fait pour toi"],
        "benign": ["on peut parler de l'emploi du temps des enfants", "je passe déposer les courses plus tard", "joyeux anniversaire, passe une bonne journée", "tu as pensé à prendre le lait", "le colis est chez le voisin", "la réunion est déplacée à jeudi", "tu peux prendre du pain en rentrant", "je serai en retard de dix minutes", "on se fait un café ce week-end?", "n'oublie pas le rendez-vous chez le médecin", "le chien a encore mangé une chaussure", "tu peux récupérer les enfants à 15h?", "merci d'avoir préparé le dîner hier", "je t'aime, passe une bonne journée", "on commande une pizza ce soir?", "le train part à 8h, dépêche-toi un peu", "tu as bien dormi?", "il fait super beau aujourd'hui", "appelle-moi quand tu as fini le travail", "les vacances sont réservées, j'ai hâte", "tu peux me rembourser les 20 euros?", "on dîne chez tes parents dimanche", "j'ai adoré le film hier soir", "bonne chance pour ton entretien!", "je passe te prendre à la gare"],
    },
    "es": {
        "threat-critical": ["si me dejas te mato", "si te vas te vas a arrepentir toda la vida", "si no eres mía no serás de nadie", "sales por esa puerta y estás muerta"],
        "threat-high": ["te vas a arrepentir si no lo {do}", "no tienes idea de lo que soy capaz", "cuídate las espaldas", "vas a pagar por esto"],
        "threat-stalking": ["sé dónde trabajas y voy a ir", "te encontraré donde sea que vayas", "no puedes esconderte de mí"],
        "stalking-surveillance": ["te vi en {place} hoy", "sé que estuviste con {name} anoche", "pasé por {place} y vi tu coche"],
        "surveillance": ["revisé tu teléfono otra vez", "sé con quién hablas", "veo todo lo que haces", "leí tus mensajes mientras dormías"],
        "coercive-control": ["no sales sin mi permiso", "yo decido con quién hablas", "haces lo que yo digo", "me consultas antes de hacer planes"],
        "coercive-isolation": ["ya no vas a ver a {name}", "aléjate de tus amigos", "tu familia te pone en mi contra, córtalos", "bloquea el número de {name} ahora"],
        "financial-abuse": ["yo controlo el dinero aquí", "no tocas la cuenta", "me das tu sueldo cuando cobres", "muéstrame todos los recibos", "yo decido qué puedes comprar"],
        "contact-breach": ["deja de ignorarme, responde", "te llamé {num} veces, contesta", "veo que lo leíste, responde", "iré si sigues ignorándome"],
        "harassment": ["contéstame", "no puedes ignorarme así", "no me voy a ir", "no te vas así como así"],
        "intimidation": ["deberías tenerme miedo", "no me pongas a prueba", "ya has visto lo que puedo hacer", "sabes lo que pasa cuando me enfadas"],
        "degradation": ["no vales nada sin mí", "nadie más te va a querer", "eres patética", "no eres nada sin mí"],
        "degradation-manip": ["no vales nada y nadie te va a creer", "tú me obligaste a esto", "es tu culpa que me ponga así", "otra vez te lo estás inventando"],
        "child-threat": ["si hablas me llevo a los niños", "nunca volverás a ver a los niños", "ningún juez te dará la custodia", "diré que eres una mala madre"],
        "physical-violence": ["te voy a pegar", "te voy a mandar al hospital", "la próxima vez no será solo una bofetada", "te voy a romper el brazo"],
        "sexual-coercion": ["me lo debes, no digas que no esta noche", "si me amaras no dirías que no", "eres mi pareja, no te toca negarte"],
        "sexual-threat": ["voy a enviar esas fotos a todos", "todos verán los videos si te vas", "las subiré para que tu familia las vea"],
        "manipulation": ["si te vas me hago daño", "me mato si me dejas", "serías responsable de lo que me haga", "después de todo lo que hice por ti"],
        "benign": ["podemos hablar del horario de los niños", "paso a dejar las compras luego", "feliz cumpleaños, que tengas buen día", "te acordaste de comprar la leche", "el paquete está con el vecino", "la reunión se movió al jueves", "recoge a los niños a las 3 porfa", "voy con diez minutos de retraso", "nos tomamos un café el finde?", "no olvides la cita del dentista", "el perro se comió otra zapatilla", "puedes traer pan al volver?", "gracias por hacer la cena anoche", "te quiero, que tengas buen día", "pedimos pizza esta noche?", "el tren sale a las 8, date prisa", "dormiste bien?", "hace un día precioso hoy", "llámame cuando salgas del trabajo", "ya reservé las vacaciones, qué ganas", "me devuelves los 20 euros cuando puedas?", "cenamos en casa de tus padres el domingo", "me encantó la peli de anoche", "suerte en la entrevista!", "te recojo en la estación"],
    },
    "ar": {
        "threat-critical": ["إذا تركتني سأقتلك", "لو مشيت هتندمي طول عمرك", "لو مش ليا مش هتبقي لحد", "لو خرجت من الباب ده هتموتي"],
        "threat-high": ["هتندمي لو ما عملتيش اللي أقوله", "ما عندكيش فكرة أنا قادر على إيه", "خلي بالك من نفسك", "هتدفعي تمن ده"],
        "threat-stalking": ["أعرف أين تعملين وسآتي إليك", "هلاقيكي في أي مكان تروحيله", "مفيش مكان تختبي فيه مني"],
        "stalking-surveillance": ["رأيتك في {place} اليوم", "شفتك مع {name} امبارح", "عديت على {place} وشفت عربيتك"],
        "surveillance": ["فتشت هاتفك مرة أخرى", "أعرف مع من تتحدثين", "عارف كل مكان بتروحيله", "قريت رسايلك وانتي نايمة"],
        "coercive-control": ["لا تخرجين دون إذني", "أنا من يقرر مع من تتحدثين", "تعملي اللي أقوله", "تستأذنيني قبل أي خطة"],
        "coercive-isolation": ["لن تري {name} بعد الآن", "ابتعدي عن أصدقائك", "أهلك بيقلبوكي عليا، اقطعيهم", "اقفلي رقم {name} حالا"],
        "financial-abuse": ["أنا أتحكم في المال هنا", "لا تلمسين الحساب", "تديني مرتبك أول ما تقبضي", "وريني كل الفواتير", "أنا اللي أقرر تشتري إيه"],
        "contact-breach": ["توقفي عن تجاهلي، ردي الآن", "كلمتك {num} مرة، ردي عليا", "شايف إنك قريتي، ردي", "هاجي لو فضلتي تتجاهليني"],
        "harassment": ["ردي عليّ", "لا يمكنك تجاهلي هكذا", "مش هختفي", "مش هتمشي كده وخلاص"],
        "intimidation": ["يجب أن تخافي مني", "ما تكبريش دماغي", "شوفتي أنا أعمل إيه", "عارفة بيحصل إيه لما تعصبيني"],
        "degradation": ["لا تساوين شيئا بدوني", "لن يريدك أحد غيري", "انتي حقيرة", "انتي مش حاجة من غيري"],
        "degradation-manip": ["لا تساوين شيئا ومحدش هيصدقك", "انتي اللي خليتيني أعمل كده", "غلطتك إني ببقى كده", "بتتخيلي حاجات تاني"],
        "child-threat": ["إذا تكلمت سآخذ الأطفال", "لن تري الأطفال مرة أخرى", "مفيش قاضي هيديكي الأطفال", "هقول إنك أم مش كويسة"],
        "physical-violence": ["سأضربك", "سأدخلك المستشفى", "المرة الجاية مش هتبقى مجرد قلم", "هكسر ذراعك"],
        "sexual-coercion": ["انتي مدينالي، ما تقوليش لأ الليلة", "لو بتحبيني ما كنتيش قلتي لأ", "انتي مراتي، مش من حقك ترفضي"],
        "sexual-threat": ["سأرسل تلك الصور للجميع", "هبعت الصور لكل الناس لو مشيتي", "هنزلها على النت وأهلك يشوفوها"],
        "manipulation": ["إذا تركتني سأؤذي نفسي", "هموت نفسي لو سبتيني", "هتبقي مسؤولة عن اللي هعمله في نفسي", "بعد كل اللي عملته عشانك"],
        "benign": ["ممكن نتكلم عن جدول الأطفال", "هأعدي أسيب المشتروات بعدين", "كل سنة وانتي طيبة", "افتكرتي تجيبي اللبن", "الطرد عند الجيران", "الاجتماع اتأجل للخميس", "ممكن تجيب عيش وانت راجع", "هتأخر عشر دقايق بس", "نعمل قهوة الويك اند؟", "متنساش معاد الدكتور", "الكلب أكل شبشب تاني", "ممكن تجيب الأطفال الساعة 3؟", "شكرا إنك عملت العشا امبارح", "بحبك، يومك سعيد", "نطلب بيتزا الليلة؟", "الجو حلو النهاردة", "كلمني لما تخلص شغل", "momken tegib el 3eesh w anta gay", "hatakhar 3ashr da2aye2 bas", "ne3mel ahwa el weekend?", "matnsash m3ad el doktor", "shokran enak 3amalt el 3asha", "bahebbak, yomak sa3eed", "netlob pizza el lela?", "el gaw 7elw el naharda"],
    },
    "cy": {
        "threat-critical": ["os wnei di adael, mi wna i dy ladd di", "os ei di, mi fyddi di'n difaru", "os na cha i di, chaiff neb di", "cerdda drwy'r drws yna a ti'n farw"],
        "threat-high": ["mi fyddi di'n difaru os na wnei di {do}", "does gen ti ddim syniad be dw i'n gallu ei wneud", "gwylia dy gefn", "mi wnei di dalu am hyn"],
        "threat-stalking": ["dw i'n gwybod ble rwyt ti'n gweithio a mi fydda i'n aros", "mi wna i dy ffeindio di ble bynnag ei di", "does unman i ti guddio"],
        "stalking-surveillance": ["gwelais i ti yn {place} heddiw", "dw i'n gwybod dy fod ti gyda {name} neithiwr", "gyrrais i heibio {place} a gweld dy gar"],
        "surveillance": ["edrychais i ar dy ffôn eto", "dw i'n gwybod pwy rwyt ti'n tecstio", "dw i'n gwybod pob man rwyt ti'n mynd", "darllenais i dy negeseuon tra oeddet ti'n cysgu"],
        "coercive-control": ["dwyt ti ddim yn mynd allan heb ofyn i mi", "fi sy'n penderfynu pwy rwyt ti'n gweld", "ti'n gwneud be dw i'n ddweud", "gofynna i mi cyn gwneud cynlluniau"],
        "coercive-isolation": ["dwyt ti ddim yn gweld {name} eto", "cadwa draw oddi wrth dy ffrindiau", "mae dy deulu'n dy droi di yn fy erbyn, torra nhw", "bloca rif {name} nawr"],
        "financial-abuse": ["fi sy'n rheoli'r arian yma", "dwyt ti ddim yn cyffwrdd â'r cyfrif", "rho dy gyflog i mi pan gei di dalu", "dangosa bob derbynneb i mi", "fi sy'n penderfynu be gei di brynu"],
        "contact-breach": ["stopia anwybyddu fi, ateba nawr", "ffoniais i ti {num} gwaith, ateba", "dw i'n gweld dy fod ti wedi darllen, ateba", "mi ddo i draw os wnei di ddal ati i'm hanwybyddu"],
        "harassment": ["ateba fi", "elli di ddim fy anwybyddu i fel hyn", "dydw i ddim yn mynd i ffwrdd", "dwyt ti ddim yn cerdded i ffwrdd fel yna"],
        "intimidation": ["dylet ti fod ofn fi", "paid â 'ngwthio i", "ti wedi gweld be dw i'n gallu ei wneud", "ti'n gwybod be sy'n digwydd pan wyt ti'n fy ngwylltio"],
        "degradation": ["ti'n dda i ddim hebdda i", "fydd neb arall dy eisiau di", "ti'n druenus", "ti'n ddim byd hebdda i"],
        "degradation-manip": ["ti'n dda i ddim a wneith neb dy gredu di", "ti wnaeth i mi wneud hyn", "dy fai di ydw i'n mynd fel hyn", "ti'n dychmygu pethau eto"],
        "child-threat": ["os wnei di siarad, mi gymera i'r plant", "weli di byth y plant eto", "wneith dim barnwr roi'r plant i ti", "mi ddyweda i dy fod ti'n fam wael"],
        "physical-violence": ["mi wna i dy daro di", "mi wna i dy roi di yn yr ysbyty", "tro nesa fydd o ddim jyst yn slap", "mi wna i dorri dy fraich"],
        "sexual-coercion": ["ti'n ddyledus i mi, paid â dweud na heno", "petaet ti'n fy ngharu fyddet ti ddim yn dweud na", "fy mhartner i wyt ti, dwyt ti ddim yn cael gwrthod"],
        "sexual-threat": ["mi wna i anfon y lluniau at bawb", "bydd pawb yn gweld y fideos os ei di", "mi wna i eu postio nhw i dy deulu weld"],
        "manipulation": ["os ei di mi wna i frifo fy hun", "mi wna i ladd fy hun os ei di", "ti fyddai'n gyfrifol am be wna i i fy hun", "ar ôl popeth dw i wedi ei wneud i ti"],
        "benign": ["allwn ni drefnu amserlen y plant", "wna i ddod â'r siopa draw wedyn", "pen-blwydd hapus, mwynha dy ddiwrnod", "wnest ti gofio nôl y llaeth", "mae'r parsel drws nesa", "mae'r cyfarfod wedi symud i ddydd iau", "elli di nôl bara ar dy ffordd nôl?", "fydda i'n hwyr o ryw ddeg munud", "awn ni am goffi'r penwythnos?", "paid ag anghofio'r apwyntiad doctor", "mae'r ci wedi bwyta slipar arall", "elli di nôl y plant am 3?", "diolch am wneud swper neithiwr", "dwi'n dy garu di, mwynha dy ddiwrnod", "archebwn ni pizza heno?", "mae'r trên am 8, brysia", "gysgaist ti'n dda?", "mae'n ddiwrnod hyfryd heddiw", "ffonia fi ar ôl gwaith", "dwi wedi bwcio'r gwyliau, methu aros", "nawn ni swper yn nhŷ dy rieni ddydd sul", "wnes i fwynhau'r ffilm neithiwr", "pob lwc gyda'r cyfweliad!", "wna i dy gasglu di o'r orsaf"],
    },
}


def fill(template: str, slots: dict, rng: random.Random) -> str:
    prev = None
    while "{" in template and template != prev:
        prev = template
        template = re.sub(r"\{(\w+)\}", lambda m: rng.choice(slots.get(m.group(1), [""])), template)
    return template


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-template", type=int, default=6, help="max slot-filled variants per template")
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    rows, seen = [], set()
    for lang, pats in TEMPLATES.items():
        slots = SLOTS.get(lang, {})
        for pid, templates in pats.items():
            tags, sev = PAT[pid]
            for t in templates:
                variants, attempts = set(), 0
                while len(variants) < args.per_template and attempts < args.per_template * 5:
                    variants.add(fill(t, slots, rng))
                    attempts += 1
                for text in variants:
                    key = (lang, text.lower())
                    if key in seen:
                        continue
                    seen.add(key)
                    rows.append({"text": text, "lang": lang, "tags": list(tags), "severity": sev, "source": "synthetic-template"})

    rng.shuffle(rows)
    with open(args.out, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"{len(rows)} rows → {args.out}")


if __name__ == "__main__":
    main()
