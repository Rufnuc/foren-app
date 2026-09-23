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
    },
    "fr": {
        "place": ["le café", "ton travail", "la gare", "l'école"],
        "name": ["ta sœur", "ta mère", "tes amis", "ta famille"],
        "num": ["10", "15", "20"],
    },
    "es": {
        "place": ["el café", "tu trabajo", "la estación", "la escuela"],
        "name": ["tu hermana", "tu madre", "tus amigos", "tu familia"],
        "num": ["10", "15", "20"],
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
    },
}

# Per-language message templates keyed by pattern id. English is the fullest;
# the others cover the core patterns. {slot} placeholders are filled from SLOTS.
TEMPLATES = {
    "en": {
        "threat-critical": ["if you leave me i will kill you", "leave and you won't make it out alive", "i will end you if you tell anyone", "i swear i'll kill you"],
        "threat-high": ["you'll regret it if you don't {do}", "you have no idea what i'm capable of", "watch your back", "i'll make you pay for this"],
        "threat-stalking": ["i know where you work and i'll be waiting outside", "i'll find you wherever you go", "i saw you at {place}, you can't hide from me"],
        "stalking-surveillance": ["i saw you at {place} today", "i've been watching you leave {place}", "i know you were with {name} last night"],
        "surveillance": ["i can see everywhere you've been", "i checked your phone again", "i know who you've been texting", "i track your location all day"],
        "coercive-control": ["you're not allowed to go out without asking me", "you do what i say", "you need my permission for that", "i decide who you see"],
        "coercive-isolation": ["you're not seeing {name} anymore", "i don't want you talking to {name}", "stay away from your friends", "you don't need anyone but me"],
        "financial-abuse": ["i cancelled your card, you get money when i say", "you don't touch the account", "i control the money here", "you'll get an allowance when you behave"],
        "contact-breach": ["stop ignoring me, answer now", "i've called you {num} times, pick up", "why won't you reply to me", "i'll keep messaging until you answer"],
        "harassment": ["stop pretending you didn't see this", "answer me", "you can't just ignore me", "i'm not going away"],
        "child-threat": ["if you tell anyone i'll take the kids", "you'll never see the children again", "the kids stay with me or else"],
        "intimidation": ["you should be scared of me", "you know what happens when you make me angry", "don't test me", "you'll be sorry"],
        "degradation": ["you're worthless", "no one else would ever want you", "you're pathetic", "you're nothing without me"],
        "degradation-manip": ["you're worthless and no one will believe you", "you made me do this", "it's your fault i get like this", "you're crazy, that never happened"],
        "sexual-threat": ["i'll send those photos to everyone", "everyone will see the pictures if you leave", "i still have the videos of you"],
        "physical-violence": ["i'll put you in the hospital", "come here so i can hit you", "i'll beat you if you don't stop"],
        "manipulation": ["if you leave i'll hurt myself", "i'll kill myself if you go", "you're the only reason i'm alive, don't leave me"],
        "benign": ["can we sort out the kids' schedule for next week", "i'll drop the shopping round later", "are you free to talk about the bills", "the plumber is coming tuesday", "happy birthday, hope you have a lovely day", "can you send me the address for the party", "running 10 minutes late, see you soon"],
    },
    "fr": {
        "threat-critical": ["si tu me quittes je te tue", "si tu pars tu le regretteras toute ta vie"],
        "threat-stalking": ["je sais où tu travailles et je vais venir", "je te retrouverai où que tu ailles"],
        "stalking-surveillance": ["je t'ai vue à {place} aujourd'hui", "je sais que tu étais avec {name} hier"],
        "surveillance": ["j'ai encore regardé ton téléphone", "je sais à qui tu écris", "je vois partout où tu vas"],
        "coercive-control": ["tu ne sors pas sans me demander", "c'est moi qui décide qui tu vois", "tu fais ce que je dis"],
        "coercive-isolation": ["tu ne vois plus {name}", "reste loin de tes amis"],
        "financial-abuse": ["je contrôle l'argent ici", "tu n'as pas accès au compte"],
        "contact-breach": ["arrête de m'ignorer, réponds", "je t'ai appelée {num} fois, réponds"],
        "harassment": ["réponds-moi", "tu ne peux pas m'ignorer comme ça"],
        "intimidation": ["tu devrais avoir peur de moi", "ne me pousse pas à bout"],
        "degradation": ["tu ne vaux rien sans moi", "personne d'autre ne voudra de toi"],
        "child-threat": ["si tu parles je prends les enfants", "tu ne reverras jamais les enfants"],
        "physical-violence": ["je vais te frapper", "je vais t'envoyer à l'hôpital"],
        "sexual-threat": ["j'enverrai ces photos à tout le monde", "tout le monde verra les vidéos si tu pars"],
        "manipulation": ["si tu pars je vais me faire du mal", "je me tuerai si tu me quittes"],
        "benign": ["on peut parler de l'emploi du temps des enfants", "je passe déposer les courses plus tard", "joyeux anniversaire, passe une bonne journée"],
    },
    "es": {
        "threat-critical": ["si me dejas te mato", "si te vas te vas a arrepentir toda la vida"],
        "threat-stalking": ["sé dónde trabajas y voy a ir", "te encontraré donde sea que vayas"],
        "stalking-surveillance": ["te vi en {place} hoy", "sé que estuviste con {name} anoche"],
        "surveillance": ["revisé tu teléfono otra vez", "sé con quién hablas", "veo todo lo que haces"],
        "coercive-control": ["no sales sin mi permiso", "yo decido con quién hablas", "haces lo que yo digo"],
        "coercive-isolation": ["ya no vas a ver a {name}", "aléjate de tus amigos"],
        "financial-abuse": ["yo controlo el dinero aquí", "no tocas la cuenta"],
        "contact-breach": ["deja de ignorarme, responde", "te llamé {num} veces, contesta"],
        "harassment": ["contéstame", "no puedes ignorarme así"],
        "intimidation": ["deberías tenerme miedo", "no me pongas a prueba"],
        "degradation": ["no vales nada sin mí", "nadie más te va a querer"],
        "child-threat": ["si hablas me llevo a los niños", "nunca volverás a ver a los niños"],
        "physical-violence": ["te voy a pegar", "te voy a mandar al hospital"],
        "sexual-threat": ["voy a enviar esas fotos a todos", "todos verán los videos si te vas"],
        "manipulation": ["si te vas me hago daño", "me mato si me dejas"],
        "benign": ["podemos hablar del horario de los niños", "paso a dejar las compras luego", "feliz cumpleaños, que tengas buen día"],
    },
    "ar": {
        "threat-critical": ["إذا تركتني سأقتلك", "لو مشيت هتندمي طول عمرك"],
        "threat-stalking": ["أعرف أين تعملين وسآتي إليك", "ba3rf feen shaghlik w hagy hnak"],
        "stalking-surveillance": ["رأيتك في {place} اليوم", "shoftik m3a {name} embareh"],
        "surveillance": ["فتشت هاتفك مرة أخرى", "أعرف مع من تتحدثين", "3arf kol makan bitrohilo"],
        "coercive-control": ["لا تخرجين دون إذني", "أنا من يقرر مع من تتحدثين"],
        "coercive-isolation": ["لن تري {name} بعد الآن", "ابتعدي عن أصدقائك"],
        "financial-abuse": ["أنا أتحكم في المال هنا", "لا تلمسين الحساب"],
        "contact-breach": ["توقفي عن تجاهلي، ردي الآن", "kallemtik {num} marra, redi 3alaya"],
        "harassment": ["ردي عليّ", "لا يمكنك تجاهلي هكذا"],
        "intimidation": ["يجب أن تخافي مني", "ma tekbrish dmaghi"],
        "degradation": ["لا تساوين شيئا بدوني", "لن يريدك أحد غيري"],
        "child-threat": ["إذا تكلمت سآخذ الأطفال", "لن تري الأطفال مرة أخرى"],
        "physical-violence": ["سأضربك", "سأدخلك المستشفى"],
        "sexual-threat": ["سأرسل تلك الصور للجميع", "hab3at el sewar le kol el nas"],
        "manipulation": ["إذا تركتني سأؤذي نفسي", "hamawwet nafsi law sibtini"],
        "benign": ["ممكن نتكلم عن جدول الأطفال", "هأعدي أسيب المشتروات بعدين", "كل سنة وانتي طيبة"],
    },
    "cy": {
        "threat-critical": ["os wnei di adael, mi wna i dy ladd di", "os ei di, mi fyddi di'n difaru"],
        "threat-stalking": ["dw i'n gwybod ble rwyt ti'n gweithio a mi fydda i'n aros", "mi wna i dy ffeindio di ble bynnag ei di"],
        "stalking-surveillance": ["gwelais i ti yn {place} heddiw", "dw i'n gwybod dy fod ti gyda {name} neithiwr"],
        "surveillance": ["edrychais i ar dy ffôn eto", "dw i'n gwybod pwy rwyt ti'n tecstio"],
        "coercive-control": ["dwyt ti ddim yn mynd allan heb ofyn i mi", "fi sy'n penderfynu pwy rwyt ti'n gweld"],
        "coercive-isolation": ["dwyt ti ddim yn gweld {name} eto", "cadwa draw oddi wrth dy ffrindiau"],
        "financial-abuse": ["fi sy'n rheoli'r arian yma", "dwyt ti ddim yn cyffwrdd â'r cyfrif"],
        "contact-breach": ["stopia anwybyddu fi, ateba nawr", "ffoniais i ti {num} gwaith, ateba"],
        "harassment": ["ateba fi", "elli di ddim fy anwybyddu i fel hyn"],
        "intimidation": ["dylet ti fod ofn fi", "paid â 'ngwthio i"],
        "degradation": ["ti'n dda i ddim hebdda i", "fydd neb arall dy eisiau di"],
        "child-threat": ["os wnei di siarad, mi gymera i'r plant", "weli di byth y plant eto"],
        "physical-violence": ["mi wna i dy daro di", "mi wna i dy roi di yn yr ysbyty"],
        "sexual-threat": ["mi wna i anfon y lluniau at bawb", "bydd pawb yn gweld y fideos os ei di"],
        "manipulation": ["os ei di mi wna i frifo fy hun", "mi wna i ladd fy hun os ei di"],
        "benign": ["allwn ni drefnu amserlen y plant", "wna i ddod â'r siopa draw wedyn", "pen-blwydd hapus, mwynha dy ddiwrnod"],
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
