"""Build a first-pass GOLD EVALUATION set with authentic message styles.

The eval set is the safety asset (see eval_set.py): it must be held OUT of
training and used only by evaluate.py to measure real safety metrics
(threat recall, high-severity recall) and to tune per-tag thresholds.

IMPORTANT — honesty about provenance: these rows are hand-authored (by an
assistant) to reflect the messy, authentic styles real messages have —
typos, missing apostrophes, emoji, slang, abbreviations, code-switching,
and Arabizi (Arabic written in Latin script with numerals). They are NOT
reviewed by DV advocates yet, and MUST be reviewed by people (ideally DV
specialists per language) before this is trusted as a true safety gate.
They are tagged source="gold-eval-draft" to make that provenance explicit.

Deliberately written to NOT reuse the training templates (seed_gen.py), so
this measures generalisation, not memorisation.

    python build_gold_eval.py --out data/gold_eval.jsonl
    python data_tools.py validate --data data/gold_eval.jsonl
    python data_tools.py stats    --data data/gold_eval.jsonl
    python evaluate.py --model-dir runs/exp_real --data data/gold_eval.jsonl
"""

import argparse
import json

# (lang, [tags], severity, text). tags=[] means benign.
# Styles are intentionally messy and varied. Severity: 1 low/none, 2 medium,
# 3 high, 4 critical.
ROWS = [
    # ── Benign — incl. the tricky imperative/domestic-logistics class that a
    #    naive model false-flags as coercive-control ──────────────────────────
    ("en", [], 1, "can u grab bread and eggs on ur way back pls 🙏"),
    ("en", [], 1, "runnin bout 15 late, traffic is mad"),
    ("en", [], 1, "did the school ring about the trip money?"),
    ("en", [], 1, "happy anniversary babe ❤️ cant wait for tonight"),
    ("en", [], 1, "you need to leave by 8 or you'll miss the train"),  # imperative but benign
    ("en", [], 1, "remember to book the dentist, ur tooth again lol"),
    ("en", [], 1, "the boiler guys coming tues between 9-12"),
    ("en", [], 1, "u free sat? thinking we do a roast at mums"),
    ("en", [], 1, "kids got footie at 10, can u drop em?"),
    ("en", [], 1, "thanks for sorting dinner, was lovely x"),
    ("en", [], 1, "omg the dog ate ur slipper again 😂"),
    ("en", [], 1, "pick the little one up at 3 yeah? i'm stuck at work"),
    ("en", [], 1, "can you pay me back the £20 when you get a sec"),  # benign money, NOT financial-abuse
    ("en", [], 1, "you always know how to make me laugh 😅"),
    ("fr", [], 1, "tu peux prendre du pain en rentrant stp"),
    ("es", [], 1, "recoge a los niños a las 3 porfa, estoy liada"),
    ("ar", [], 1, "momken tegib 3eesh w laban we anta gay? 🙏"),  # arabizi benign
    ("cy", [], 1, "wnei di nol y plant am 3? dwi'n sownd yn gwaith"),
    ("en", [], 1, "loved the film, we should do that again soon"),
    ("en", [], 1, "just landed, txt when ur up ✈️"),

    # ── Threat ──────────────────────────────────────────────────────────────
    ("en", ["threat"], 4, "if u walk out that door i swear to god ur dead 🔪"),
    ("en", ["threat"], 4, "i'll kill u before i let u take my kids"),
    ("en", ["threat", "physical-violence"], 4, "come home NOW or i'll put u in hospital"),
    ("en", ["threat"], 3, "you have no idea wat im capable of dont test me"),
    ("en", ["threat"], 3, "keep talkin n see wat happens to u"),
    ("en", ["threat"], 3, "watch ur back when u leave work tmrw"),
    ("en", ["threat"], 3, "ur gona regret the day u met me i promise u that"),
    ("fr", ["threat"], 4, "si tu me quittes je te jure que je te tue"),
    ("es", ["threat"], 4, "si te vas de esa casa no sales viva"),
    ("ar", ["threat"], 4, "law meshity hamawetek, mafish makan hatekhtebi feh"),  # arabizi
    ("ar", ["threat"], 4, "إذا قلتي لحد هأنهي حياتك"),
    ("cy", ["threat"], 4, "os ei di, mi wna i dy ladd di, dwi o ddifri"),
    ("en", ["threat", "child-related"], 3, "say one word to anyone and u will never see the kids again"),

    # ── Physical violence ─────────────────────────────────────────────────────
    ("en", ["physical-violence"], 4, "shouldnt have made me hit u, next time it'll be worse"),
    ("en", ["physical-violence", "threat"], 4, "i'll break every bone in ur body"),
    ("en", ["physical-violence"], 3, "come here NOW before i drag u by ur hair"),
    ("en", ["physical-violence"], 4, "u want another black eye like last time??"),
    ("fr", ["physical-violence"], 3, "la prochaine fois ce sera pas qu'une gifle"),
    ("es", ["physical-violence"], 4, "te voy a partir la cara cuando llegue"),
    ("ar", ["physical-violence"], 3, "hadrabek darb tefkary feh kol youm"),  # arabizi

    # ── Stalking / surveillance (emoji, location) ──────────────────────────────
    ("en", ["stalking"], 3, "saw u at the cafe on high st with him 👀 u cant hide"),
    ("en", ["stalking", "surveillance"], 3, "i know u went to sarahs, i can see ur location 📍"),
    ("en", ["surveillance"], 2, "read ur whatsapp while u were asleep. who's dave??"),
    ("en", ["surveillance"], 2, "i put life360 on ur phone so dont bother lying"),
    ("en", ["stalking"], 3, "im parked outside. i can see the light on 👀"),
    ("en", ["surveillance"], 2, "checked ur search history again"),
    ("fr", ["stalking", "surveillance"], 3, "je t'ai vue sortir du travail avec lui, je sais tout"),
    ("es", ["surveillance"], 2, "revise tu movil otra vez, quien es ese?"),
    ("ar", ["stalking"], 3, "shoftek nazla mn el shoghl m3ah, mfeesh 7aga tkhbeeha 3any"),  # arabizi
    ("cy", ["stalking"], 3, "dwi'n gwybod lle est ti neithiwr, paid a gwadu"),

    # ── Coercive control / isolation ──────────────────────────────────────────
    ("en", ["coercive-control"], 2, "u dont go anywhere without askin me first, understood"),
    ("en", ["coercive-control"], 2, "delete his number rn and show me"),
    ("en", ["coercive-control", "isolation"], 2, "i dont want u seeing ur sister anymore shes poison"),
    ("en", ["isolation"], 2, "its me or ur so-called friends, choose"),
    ("en", ["coercive-control"], 2, "u wear wat i say ur not going out dressed like that"),
    ("en", ["coercive-control"], 2, "check with me b4 u make any plans w anyone"),
    ("fr", ["coercive-control"], 2, "tu sors pas sans ma permission, c'est clair?"),
    ("es", ["coercive-control", "isolation"], 2, "no quiero que veas mas a tu familia, me oyes"),
    ("ar", ["coercive-control"], 2, "mate5rogeesh mn gher ma testa2zeeny, fahma?"),  # arabizi
    ("cy", ["isolation"], 2, "dwyt ti ddim yn gweld dy ffrindiau eto, deall?"),

    # ── Financial abuse ───────────────────────────────────────────────────────
    ("en", ["financial-abuse"], 2, "i cancelled ur card. u get money when u behave"),
    ("en", ["financial-abuse", "coercive-control"], 2, "hand over ur wages friday like always"),
    ("en", ["financial-abuse"], 2, "show me every receipt from today. all of them"),
    ("en", ["financial-abuse"], 2, "u dont need ur own account, i handle the money"),
    ("fr", ["financial-abuse"], 2, "tu me donnes ta paye, c'est moi qui gere l'argent"),
    ("es", ["financial-abuse"], 2, "ensename en que gastaste mi dinero hoy"),
    ("ar", ["financial-abuse"], 2, "matlmeseesh el 7esab, ana elly bstsaref"),  # arabizi

    # ── Contact breach / harassment ───────────────────────────────────────────
    ("en", ["contact-breach", "harassment"], 2, "answer ur phone. 27 missed calls. ANSWER ME"),
    ("en", ["harassment"], 1, "i can see uve read this. reply. now."),
    ("en", ["contact-breach"], 2, "ill keep textin till u answer, all night if i have to"),
    ("en", ["harassment"], 1, "u dont get to just ignore me and walk off"),
    ("fr", ["contact-breach"], 2, "je t'ai appelee 30 fois, reponds bordel"),
    ("es", ["harassment"], 1, "contestame ya, no puedes ignorarme asi"),

    # ── Child-related ─────────────────────────────────────────────────────────
    ("en", ["child-related", "threat"], 3, "ill tell the court ur an unfit mother and take em"),
    ("en", ["child-related", "coercive-control"], 3, "the kids stay with me or else, ur choice"),
    ("en", ["child-related"], 3, "no judge will EVER give u custody trust me"),
    ("fr", ["child-related", "threat"], 3, "tu reverras jamais les enfants si tu parles"),

    # ── Intimidation ──────────────────────────────────────────────────────────
    ("en", ["intimidation"], 2, "u remember wat happened last time u talked back yeah"),
    ("en", ["intimidation"], 2, "id be very very careful about ur next move"),
    ("en", ["intimidation"], 2, "u've seen wat i can do. dont push me 😊"),
    ("es", ["intimidation"], 2, "ya sabes lo que pasa cuando me haces enojar"),

    # ── Degradation / manipulation ────────────────────────────────────────────
    ("en", ["degradation"], 1, "ur pathetic honestly no one else would ever want u"),
    ("en", ["degradation", "manipulation"], 2, "ur crazy that never happened, ur imaginin things again"),
    ("en", ["manipulation"], 2, "if u leave ill hurt myself and itll be on u"),
    ("en", ["manipulation"], 2, "after everythin ive done for u, this is how u repay me"),
    ("en", ["degradation"], 1, "look at the state of u, who'd want that lol"),
    ("fr", ["manipulation"], 2, "si tu pars je me fais du mal, ce sera ta faute"),
    ("ar", ["manipulation"], 2, "law sebteny hamawet nafsy w hatkoon 3aleky"),  # arabizi
    ("cy", ["degradation"], 1, "ti'n dda i ddim, fyddai neb arall dy eisiau di"),

    # ── Sexual ────────────────────────────────────────────────────────────────
    ("en", ["sexual", "threat"], 4, "leave n those pics of u go straight to ur whole family"),
    ("en", ["sexual", "coercive-control"], 3, "u dont get to say no to me, ur my girlfriend"),
    ("en", ["sexual", "threat"], 4, "i still have the videos. behave."),
    ("es", ["sexual", "threat"], 4, "si te vas mando las fotos a todos"),

    # ── Code-switching (mixed languages in one message) ───────────────────────
    ("en", ["threat"], 3, "wallah if u tell anyone ur finished, i mean it"),
    ("en", ["coercive-control"], 2, "no vas a ningun lado without asking me first"),
    ("en", ["surveillance"], 2, "i saw ur location, kont fen? who were u with"),  # en+arabizi
    ("en", [], 1, "ok habibi see u at 6, dont forget the milk 🥛"),  # benign code-switch
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/gold_eval.jsonl")
    args = ap.parse_args()
    with open(args.out, "w", encoding="utf-8") as f:
        for lang, tags, sev, text in ROWS:
            f.write(
                json.dumps(
                    {"text": text, "lang": lang, "tags": tags, "severity": sev, "source": "gold-eval-draft"},
                    ensure_ascii=False,
                )
                + "\n"
            )
    print(f"{len(ROWS)} gold-eval rows → {args.out}")


if __name__ == "__main__":
    main()
