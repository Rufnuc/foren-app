// Legal knowledge base: maps analysis pattern tags to the offences and
// protective orders they MAY engage, per jurisdiction, for the case report.
//
// This is GENERAL LEGAL INFORMATION, not legal advice. It says what the law
// covers, never that an offence has been committed or how a case would resolve.
// Statute references should be checked by a qualified solicitor / legal DV
// specialist before anyone relies on them; the law here is current to 2025.
//
// Jurisdictions differ materially. England & Wales splits coercive control,
// harassment and stalking across several statutes; Scotland folds most abuse
// into one offence (Domestic Abuse (Scotland) Act 2018, s.1). Add further
// jurisdictions (Northern Ireland, etc.) as new entries in JURISDICTIONS.

export interface Offence {
  title: string;
  statute: string;
  summary: string;
}

export interface ProtectiveOrder {
  title: string;
  statute: string;
  summary: string;
}

export interface SupportContact {
  name: string;
  detail: string;
}

export type JurisdictionId = 'england-wales' | 'scotland' | 'northern-ireland';

export interface Jurisdiction {
  id: JurisdictionId;
  name: string;
  disclaimer: string;
  tagOffences: Record<string, Offence[]>;
  protectiveOrders: ProtectiveOrder[];
  supportContacts: SupportContact[];
}

const disclaimerFor = (name: string) =>
  `This report is generated on the device from the information entered. It is general ` +
  `information about the law of ${name}, not legal advice, and does not establish that any ` +
  `offence has been committed. The pattern analysis is machine-assisted and may be wrong. For ` +
  `advice on a specific situation, contact the police or a qualified solicitor or ` +
  `domestic-abuse service.`;

// ── England & Wales ───────────────────────────────────────────────────────────

const EW = {
  coerciveControl: {
    title: 'Controlling or coercive behaviour in an intimate or family relationship',
    statute: 'Serious Crime Act 2015, s.76 (extended by the Domestic Abuse Act 2021)',
    summary:
      'Repeated or continuous controlling or coercive behaviour towards a partner, ex-partner ' +
      'or family member that has a serious effect on the victim — isolating them, monitoring ' +
      'them, and controlling money, movement and everyday life. Since 2023 it also covers ' +
      'ex-partners who no longer live together (post-separation abuse).',
  },
  harassment: {
    title: 'Harassment',
    statute: 'Protection from Harassment Act 1997, s.2 (s.4 where it causes fear of violence)',
    summary:
      'A course of conduct (on at least two occasions) that amounts to harassment, which the ' +
      'person knew or ought to have known amounted to harassment.',
  },
  stalking: {
    title: 'Stalking',
    statute: 'Protection from Harassment Act 1997, s.2A / s.4A',
    summary:
      'A course of conduct amounting to stalking — following, watching, contacting, or monitoring. ' +
      's.4A applies where it causes fear of violence, or serious alarm or distress.',
  },
  fearOfViolence: {
    title: 'Putting a person in fear of violence',
    statute: 'Protection from Harassment Act 1997, s.4',
    summary:
      'A course of conduct causing another to fear, on at least two occasions, that violence ' +
      'will be used against them.',
  },
  threatsToKill: {
    title: 'Threats to kill',
    statute: 'Offences Against the Person Act 1861, s.16',
    summary: 'Threatening to kill a person, intending them to fear the threat would be carried out.',
  },
  assault: {
    title: 'Assault (battery, actual and grievous bodily harm)',
    statute: 'Offences Against the Person Act 1861, ss.47/20/18; Criminal Justice Act 1988, s.39',
    summary: 'Physical assault, ranging from battery through actual bodily harm to grievous bodily harm.',
  },
  strangulation: {
    title: 'Non-fatal strangulation or suffocation',
    statute: 'Domestic Abuse Act 2021, s.70',
    summary: 'Intentionally strangling or otherwise affecting another person’s ability to breathe.',
  },
  economicAbuse: {
    title: 'Economic abuse',
    statute: 'Domestic Abuse Act 2021 (statutory definition); Serious Crime Act 2015, s.76',
    summary:
      'Controlling a person’s access to money, property, food, transport or the means to obtain ' +
      'them. Recognised as domestic abuse and commonly charged as coercive control.',
  },
  sexualOffences: {
    title: 'Sexual offences',
    statute: 'Sexual Offences Act 2003',
    summary: 'Non-consensual sexual conduct, including sexual assault and sexual coercion.',
  },
  intimateImages: {
    title: 'Sharing, or threatening to share, intimate images (incl. cyberflashing)',
    statute: 'Sexual Offences Act 2003, ss.66A–66D (inserted by the Online Safety Act 2023)',
    summary:
      'Sharing, or threatening to share, a private sexual or intimate image without consent, ' +
      'and sending an unwanted sexual image (cyberflashing). The 2023 reforms made ' +
      'non-consensual sharing an offence in itself, without needing to prove intent to cause distress.',
  },
  maliciousComms: {
    title: 'Malicious communications',
    statute: 'Malicious Communications Act 1988, s.1',
    summary:
      'Sending a communication that is indecent, grossly offensive, threatening or false, ' +
      'intending to cause the recipient distress or anxiety.',
  },
  menacingComms: {
    title: 'Improper use of a public communications network',
    statute: 'Communications Act 2003, s.127; Online Safety Act 2023 (threatening communications)',
    summary:
      'Sending grossly offensive, menacing or false messages by a public electronic ' +
      'communications network. The Online Safety Act 2023 added further communications offences.',
  },
  unauthorisedAccess: {
    title: 'Unauthorised access to a device or account',
    statute: 'Computer Misuse Act 1990, s.1',
    summary:
      'Accessing another person’s device, messages or accounts without authority — including ' +
      'installing tracking or spyware.',
  },
  breachNonMol: {
    title: 'Breach of a non-molestation order',
    statute: 'Family Law Act 1996, s.42A',
    summary: 'Breaching a non-molestation order is itself a criminal offence.',
  },
  breachRestraining: {
    title: 'Breach of a restraining order',
    statute: 'Protection from Harassment Act 1997, s.5',
    summary: 'Breaching a restraining order is itself a criminal offence.',
  },
  childVictim: {
    title: 'Children as victims of domestic abuse',
    statute: 'Domestic Abuse Act 2021; Children Act 1989',
    summary:
      'Children who see, hear or experience the effects of domestic abuse are victims in their ' +
      'own right. Using children as a means of control is relevant to both criminal and family proceedings.',
  },
  criminalDamage: {
    title: 'Criminal damage',
    statute: 'Criminal Damage Act 1971, s.1',
    summary:
      'Destroying or damaging property belonging to another without lawful excuse — for example ' +
      'breaking a phone, punching walls, or damaging belongings — often used to intimidate or punish.',
  },
  falseImprisonment: {
    title: 'False imprisonment',
    statute: 'Common law',
    summary:
      'Unlawfully restraining a person’s freedom of movement — preventing them from leaving a ' +
      'room or the home, or from going where they choose.',
  },
  harassmentInHome: {
    title: 'Harassment of a person in their home',
    statute: 'Criminal Justice and Police Act 2001, s.42A',
    summary:
      'Being outside or near a person’s home to persuade or deter them from doing something, in a ' +
      'way that causes harassment, alarm or distress.',
  },
  witnessIntimidation: {
    title: 'Intimidation of a witness',
    statute: 'Criminal Justice and Public Order Act 1994, s.51',
    summary:
      'Threatening or harming a person to deter them from reporting to the police or giving ' +
      'evidence, or in revenge for having done so.',
  },
  blackmail: {
    title: 'Blackmail',
    statute: 'Theft Act 1968, s.21',
    summary:
      'Making an unwarranted demand with menaces for gain — including threats to expose, harm or ' +
      'disclose something unless the victim complies.',
  },
  forcedMarriage: {
    title: 'Forced marriage',
    statute: 'Anti-social Behaviour, Crime and Policing Act 2014, s.121',
    summary:
      'Using violence, threats or coercion to force a person into marriage without their free and ' +
      'full consent, or deceiving them into travelling abroad for that purpose.',
  },
  fgm: {
    title: 'Female genital mutilation',
    statute: 'Female Genital Mutilation Act 2003',
    summary:
      'Carrying out, arranging, or failing to protect a girl from female genital mutilation. A ' +
      'stand-alone offence with dedicated FGM protection orders.',
  },
  animalAbuse: {
    title: 'Animal cruelty (used as control)',
    statute: 'Animal Welfare Act 2006, s.4',
    summary:
      'Causing unnecessary suffering to an animal. Harming or threatening a pet is a recognised ' +
      'tactic of coercive control and can be charged in its own right.',
  },
} satisfies Record<string, Offence>;

const ENGLAND_WALES: Jurisdiction = {
  id: 'england-wales',
  name: 'England & Wales',
  disclaimer: disclaimerFor('England & Wales'),
  tagOffences: {
    threat: [EW.threatsToKill, EW.fearOfViolence, EW.blackmail, EW.witnessIntimidation, EW.maliciousComms, EW.menacingComms],
    'physical-violence': [EW.assault, EW.strangulation, EW.criminalDamage, EW.falseImprisonment, EW.fgm],
    sexual: [EW.sexualOffences, EW.intimateImages, EW.fgm],
    stalking: [EW.stalking, EW.harassment, EW.harassmentInHome],
    surveillance: [EW.stalking, EW.coerciveControl, EW.unauthorisedAccess],
    coercion: [EW.coerciveControl, EW.falseImprisonment, EW.blackmail],
    'coercive-control': [EW.coerciveControl, EW.falseImprisonment, EW.forcedMarriage, EW.animalAbuse],
    intimidation: [EW.fearOfViolence, EW.harassment, EW.coerciveControl, EW.criminalDamage, EW.witnessIntimidation, EW.animalAbuse],
    harassment: [EW.harassment, EW.harassmentInHome, EW.maliciousComms],
    'contact-flood': [EW.harassment, EW.maliciousComms, EW.menacingComms],
    'contact-breach': [EW.breachNonMol, EW.breachRestraining, EW.harassment, EW.witnessIntimidation],
    isolation: [EW.coerciveControl, EW.falseImprisonment],
    financial: [EW.economicAbuse, EW.coerciveControl, EW.blackmail],
    'financial-abuse': [EW.economicAbuse, EW.coerciveControl, EW.blackmail],
    location: [EW.stalking, EW.coerciveControl],
    'child-related': [EW.childVictim, EW.coerciveControl, EW.forcedMarriage, EW.fgm],
    manipulation: [EW.coerciveControl, EW.blackmail],
    degradation: [EW.coerciveControl, EW.harassment, EW.criminalDamage],
  },
  protectiveOrders: [
    { title: 'Non-molestation order', statute: 'Family Law Act 1996, s.42', summary: 'A family-court order prohibiting a person from harassing, threatening or contacting you.' },
    { title: 'Occupation order', statute: 'Family Law Act 1996, s.33', summary: 'A family-court order regulating who may live in, or enter, the family home.' },
    { title: 'Domestic Abuse Protection Order (DAPO/DAPN)', statute: 'Domestic Abuse Act 2021', summary: 'A flexible protective order (being rolled out) that can impose both prohibitions and requirements.' },
    { title: 'Restraining order', statute: 'Sentencing Act 2020, s.360; Protection from Harassment Act 1997, s.5/s.5A', summary: 'A court order restraining contact, available on conviction and (on acquittal) under s.5A.' },
    { title: 'Stalking Protection Order', statute: 'Stalking Protection Act 2019', summary: 'A police-applied order imposing restrictions on someone suspected of stalking.' },
    { title: 'Forced Marriage Protection Order (FMPO)', statute: 'Family Law Act 1996, Part 4A', summary: 'A family-court order to protect someone from being forced into marriage; breach is a criminal offence.' },
    { title: 'FGM Protection Order (FGMPO)', statute: 'Female Genital Mutilation Act 2003, Schedule 2', summary: 'A family-court order to protect a girl or woman at risk of female genital mutilation.' },
  ],
  supportContacts: [
    { name: 'Emergency', detail: '999 (police). Non-emergency: 101.' },
    { name: 'National Domestic Abuse Helpline (24h, run by Refuge)', detail: '0808 2000 247' },
    { name: 'Live Fear Free (Wales, 24h)', detail: '0808 80 10 800' },
    { name: 'Men’s Advice Line', detail: '0808 8010 327' },
    { name: 'Galop (LGBT+ domestic abuse)', detail: '0800 999 5428' },
    { name: 'Rights of Women (free legal advice)', detail: 'rightsofwomen.org.uk' },
  ],
};

// ── Scotland ──────────────────────────────────────────────────────────────────

const SC = {
  abusiveBehaviour: {
    title: 'Abusive behaviour towards a partner or ex-partner',
    statute: 'Domestic Abuse (Scotland) Act 2018, s.1',
    summary:
      'A course of behaviour that is abusive of a partner or ex-partner — covering violence and ' +
      'psychological abuse such as controlling, isolating, degrading or frightening them. A single ' +
      'offence that captures coercive control and physical abuse together.',
  },
  threateningBehaviour: {
    title: 'Threatening or abusive behaviour',
    statute: 'Criminal Justice and Licensing (Scotland) Act 2010, s.38',
    summary: 'Behaving in a threatening or abusive manner likely to cause a reasonable person fear or alarm.',
  },
  stalking: {
    title: 'Stalking',
    statute: 'Criminal Justice and Licensing (Scotland) Act 2010, s.39',
    summary:
      'A course of conduct causing another person fear or alarm — following, watching, contacting ' +
      'or monitoring them.',
  },
  assault: {
    title: 'Assault',
    statute: 'Common law (Scotland); Domestic Abuse (Scotland) Act 2018 aggravation',
    summary: 'A deliberate attack on another person. Domestic abuse is a statutory aggravation on sentencing.',
  },
  sexualOffences: {
    title: 'Sexual offences',
    statute: 'Sexual Offences (Scotland) Act 2009',
    summary: 'Non-consensual sexual conduct, including rape and sexual assault.',
  },
  intimateImages: {
    title: 'Disclosing, or threatening to disclose, an intimate image',
    statute: 'Abusive Behaviour and Sexual Harm (Scotland) Act 2016, s.2',
    summary:
      'Disclosing or threatening to disclose an intimate photograph or film without consent, ' +
      'intending to cause fear, alarm or distress.',
  },
  menacingComms: {
    title: 'Improper use of a public communications network',
    statute: 'Communications Act 2003, s.127 (applies UK-wide)',
    summary: 'Sending grossly offensive, menacing or false messages by a public electronic communications network.',
  },
  unauthorisedAccess: {
    title: 'Unauthorised access to a device or account',
    statute: 'Computer Misuse Act 1990, s.1 (applies UK-wide)',
    summary: 'Accessing another person’s device, messages or accounts without authority, including spyware or tracking.',
  },
  breachOrder: {
    title: 'Breach of a non-harassment order or interdict',
    statute: 'Protection from Abuse (Scotland) Act 2001; Protection from Harassment Act 1997, s.9',
    summary: 'Breaching a non-harassment order, or an interdict with power of arrest, is a criminal offence.',
  },
  childAggravation: {
    title: 'Domestic abuse involving a child',
    statute: 'Domestic Abuse (Scotland) Act 2018, s.5; Children (Scotland) Act 1995',
    summary: 'A statutory aggravation where the abuse involves a child, or a child sees, hears or is present during it.',
  },
  vandalism: {
    title: 'Vandalism (damage to property)',
    statute: 'Criminal Law (Consolidation) (Scotland) Act 1995, s.52',
    summary:
      'Wilfully or recklessly destroying or damaging another person’s property — for example a ' +
      'phone or belongings — often used to intimidate or punish.',
  },
  falseImprisonment: {
    title: 'Unlawful detention (false imprisonment)',
    statute: 'Common law (Scotland)',
    summary:
      'Unlawfully restraining a person’s freedom of movement — preventing them from leaving or ' +
      'going where they choose.',
  },
  extortion: {
    title: 'Extortion',
    statute: 'Common law (Scotland)',
    summary:
      'Using threats to force a person to hand over money or property, or to do something against ' +
      'their will — the Scottish equivalent of blackmail.',
  },
  forcedMarriage: {
    title: 'Forced marriage',
    statute: 'Anti-social Behaviour, Crime and Policing Act 2014, s.122',
    summary:
      'Using violence, threats or coercion to force a person into marriage without their free and ' +
      'full consent.',
  },
  fgm: {
    title: 'Female genital mutilation',
    statute: 'Prohibition of Female Genital Mutilation (Scotland) Act 2005',
    summary:
      'Carrying out, arranging, or failing to protect a girl from female genital mutilation. FGM ' +
      'protection orders are available.',
  },
  witnessIntimidation: {
    title: 'Intimidation of a witness / attempting to pervert the course of justice',
    statute: 'Common law (Scotland)',
    summary:
      'Threatening or harming a person to deter them from reporting to the police or giving ' +
      'evidence, or in revenge for having done so.',
  },
  animalAbuse: {
    title: 'Animal cruelty (used as control)',
    statute: 'Animal Health and Welfare (Scotland) Act 2006, s.19',
    summary:
      'Causing unnecessary suffering to an animal. Harming or threatening a pet is a recognised ' +
      'tactic of coercive control.',
  },
} satisfies Record<string, Offence>;

const SCOTLAND: Jurisdiction = {
  id: 'scotland',
  name: 'Scotland',
  disclaimer: disclaimerFor('Scotland'),
  tagOffences: {
    threat: [SC.threateningBehaviour, SC.abusiveBehaviour, SC.extortion, SC.witnessIntimidation],
    'physical-violence': [SC.assault, SC.abusiveBehaviour, SC.vandalism, SC.falseImprisonment, SC.fgm],
    sexual: [SC.sexualOffences, SC.intimateImages, SC.fgm],
    stalking: [SC.stalking, SC.abusiveBehaviour],
    surveillance: [SC.abusiveBehaviour, SC.unauthorisedAccess, SC.stalking],
    coercion: [SC.abusiveBehaviour, SC.falseImprisonment, SC.extortion],
    'coercive-control': [SC.abusiveBehaviour, SC.falseImprisonment, SC.forcedMarriage, SC.animalAbuse],
    intimidation: [SC.threateningBehaviour, SC.abusiveBehaviour, SC.vandalism, SC.witnessIntimidation, SC.animalAbuse],
    harassment: [SC.threateningBehaviour, SC.stalking],
    'contact-flood': [SC.threateningBehaviour, SC.menacingComms],
    'contact-breach': [SC.breachOrder, SC.witnessIntimidation],
    isolation: [SC.abusiveBehaviour, SC.falseImprisonment],
    financial: [SC.abusiveBehaviour, SC.extortion],
    'financial-abuse': [SC.abusiveBehaviour, SC.extortion],
    location: [SC.stalking, SC.abusiveBehaviour],
    'child-related': [SC.childAggravation, SC.abusiveBehaviour, SC.forcedMarriage, SC.fgm],
    manipulation: [SC.abusiveBehaviour, SC.extortion],
    degradation: [SC.abusiveBehaviour, SC.threateningBehaviour, SC.vandalism],
  },
  protectiveOrders: [
    { title: 'Domestic Abuse Protection Notice / Order (DAPN/DAPO)', statute: 'Domestic Abuse (Protection) (Scotland) Act 2021', summary: 'Police and court protective orders that can remove a suspected abuser and impose conditions.' },
    { title: 'Non-harassment order', statute: 'Protection from Harassment Act 1997, s.8', summary: 'A court order prohibiting harassment, breach of which is an offence.' },
    { title: 'Interdict with power of arrest', statute: 'Protection from Abuse (Scotland) Act 2001', summary: 'A civil order (interdict) that can attach a power of arrest for breach.' },
    { title: 'Exclusion order', statute: 'Matrimonial Homes (Family Protection) (Scotland) Act 1981', summary: 'An order suspending an abuser’s right to occupy the family home.' },
    { title: 'Forced Marriage Protection Order (FMPO)', statute: 'Forced Marriage etc. (Protection and Jurisdiction) (Scotland) Act 2011', summary: 'A court order to protect someone from being forced into marriage; breach is a criminal offence.' },
    { title: 'FGM Protection Order (FGMPO)', statute: 'Female Genital Mutilation (Protection and Guidance) (Scotland) Act 2020', summary: 'A court order to protect a girl or woman at risk of female genital mutilation.' },
  ],
  supportContacts: [
    { name: 'Emergency', detail: '999 (police). Non-emergency: 101.' },
    { name: 'Scotland’s Domestic Abuse and Forced Marriage Helpline (24h)', detail: '0800 027 1234' },
    { name: 'Scottish Women’s Aid', detail: 'womensaid.scot' },
    { name: 'Men’s Advice Line', detail: '0808 8010 327' },
    { name: 'Galop (LGBT+ domestic abuse)', detail: '0800 999 5428' },
  ],
};

// ── Northern Ireland ──────────────────────────────────────────────────────────

const NI = {
  domesticAbuse: {
    title: 'Domestic abuse offence',
    statute: 'Domestic Abuse and Civil Proceedings Act (Northern Ireland) 2021, s.1',
    summary:
      'A course of abusive behaviour towards a partner, ex-partner or family member — covering ' +
      'violence and psychological abuse such as controlling, isolating, degrading or frightening ' +
      'them. Captures coercive control and physical abuse together.',
  },
  harassment: {
    title: 'Harassment',
    statute: 'Protection from Harassment (Northern Ireland) Order 1997, art.4',
    summary: 'A course of conduct amounting to harassment which the person knew or ought to have known was harassment.',
  },
  fearOfViolence: {
    title: 'Putting a person in fear of violence',
    statute: 'Protection from Harassment (Northern Ireland) Order 1997, art.6',
    summary: 'A course of conduct causing another to fear, on at least two occasions, that violence will be used against them.',
  },
  stalking: {
    title: 'Stalking',
    statute: 'Protection from Stalking Act (Northern Ireland) 2022',
    summary: 'A specific offence of stalking — following, watching, contacting or monitoring — with associated protection orders.',
  },
  threatsToKill: {
    title: 'Threats to kill',
    statute: 'Offences Against the Person Act 1861, s.16 (extends to Northern Ireland)',
    summary: 'Threatening to kill a person, intending them to fear the threat would be carried out.',
  },
  assault: {
    title: 'Assault (actual and grievous bodily harm)',
    statute: 'Offences Against the Person Act 1861, ss.47/20/18 (extends to Northern Ireland)',
    summary: 'Physical assault, ranging from common assault through actual bodily harm to grievous bodily harm.',
  },
  sexualOffences: {
    title: 'Sexual offences',
    statute: 'Sexual Offences (Northern Ireland) Order 2008',
    summary: 'Non-consensual sexual conduct, including rape and sexual assault.',
  },
  intimateImages: {
    title: 'Disclosing private sexual images',
    statute: 'Justice Act (Northern Ireland) 2016, s.51',
    summary: 'Disclosing private sexual photographs or films without consent, with intent to cause distress ("revenge porn").',
  },
  maliciousComms: {
    title: 'Malicious communications',
    statute: 'Malicious Communications (Northern Ireland) Order 1988',
    summary: 'Sending a communication that is indecent, grossly offensive, threatening or false, intending to cause distress or anxiety.',
  },
  menacingComms: {
    title: 'Improper use of a public communications network',
    statute: 'Communications Act 2003, s.127 (applies UK-wide)',
    summary: 'Sending grossly offensive, menacing or false messages by a public electronic communications network.',
  },
  unauthorisedAccess: {
    title: 'Unauthorised access to a device or account',
    statute: 'Computer Misuse Act 1990, s.1 (applies UK-wide)',
    summary: 'Accessing another person’s device, messages or accounts without authority, including spyware or tracking.',
  },
  breachNonMol: {
    title: 'Breach of a non-molestation order',
    statute: 'Family Homes and Domestic Violence (Northern Ireland) Order 1998',
    summary: 'Breaching a non-molestation order is a criminal offence.',
  },
  childAggravation: {
    title: 'Domestic abuse involving a child',
    statute: 'Domestic Abuse and Civil Proceedings Act (Northern Ireland) 2021',
    summary: 'An aggravation where the abuse involves a child, or a child sees, hears or is present during it.',
  },
  criminalDamage: {
    title: 'Criminal damage',
    statute: 'Criminal Damage (Northern Ireland) Order 1977, art.3',
    summary:
      'Destroying or damaging another person’s property without lawful excuse — for example ' +
      'breaking a phone or belongings — often used to intimidate or punish.',
  },
  falseImprisonment: {
    title: 'False imprisonment',
    statute: 'Common law',
    summary:
      'Unlawfully restraining a person’s freedom of movement — preventing them from leaving or ' +
      'going where they choose.',
  },
  blackmail: {
    title: 'Blackmail',
    statute: 'Theft Act (Northern Ireland) 1969, s.20',
    summary:
      'Making an unwarranted demand with menaces for gain — including threats to expose, harm or ' +
      'disclose something unless the victim complies.',
  },
  forcedMarriage: {
    title: 'Forced marriage',
    statute:
      'Human Trafficking and Exploitation (Criminal Justice and Support for Victims) Act (Northern Ireland) 2015, s.16',
    summary:
      'Using violence, threats or coercion to force a person into marriage without their free and ' +
      'full consent.',
  },
  fgm: {
    title: 'Female genital mutilation',
    statute: 'Female Genital Mutilation Act 2003 (extends to Northern Ireland)',
    summary:
      'Carrying out, arranging, or failing to protect a girl from female genital mutilation. FGM ' +
      'protection orders are available.',
  },
  witnessIntimidation: {
    title: 'Intimidation of a witness / perverting the course of justice',
    statute: 'Common law; Criminal Justice and Public Order Act 1994, s.51',
    summary:
      'Threatening or harming a person to deter them from reporting to the police or giving ' +
      'evidence, or in revenge for having done so.',
  },
  animalAbuse: {
    title: 'Animal cruelty (used as control)',
    statute: 'Welfare of Animals Act (Northern Ireland) 2011, s.4',
    summary:
      'Causing unnecessary suffering to an animal. Harming or threatening a pet is a recognised ' +
      'tactic of coercive control.',
  },
} satisfies Record<string, Offence>;

const NORTHERN_IRELAND: Jurisdiction = {
  id: 'northern-ireland',
  name: 'Northern Ireland',
  disclaimer: disclaimerFor('Northern Ireland'),
  tagOffences: {
    threat: [NI.threatsToKill, NI.fearOfViolence, NI.domesticAbuse, NI.blackmail, NI.witnessIntimidation, NI.maliciousComms],
    'physical-violence': [NI.assault, NI.domesticAbuse, NI.criminalDamage, NI.falseImprisonment, NI.fgm],
    sexual: [NI.sexualOffences, NI.intimateImages, NI.fgm],
    stalking: [NI.stalking, NI.harassment],
    surveillance: [NI.domesticAbuse, NI.unauthorisedAccess, NI.stalking],
    coercion: [NI.domesticAbuse, NI.falseImprisonment, NI.blackmail],
    'coercive-control': [NI.domesticAbuse, NI.falseImprisonment, NI.forcedMarriage, NI.animalAbuse],
    intimidation: [NI.fearOfViolence, NI.harassment, NI.domesticAbuse, NI.criminalDamage, NI.witnessIntimidation, NI.animalAbuse],
    harassment: [NI.harassment, NI.maliciousComms],
    'contact-flood': [NI.harassment, NI.maliciousComms, NI.menacingComms],
    'contact-breach': [NI.breachNonMol, NI.harassment, NI.witnessIntimidation],
    isolation: [NI.domesticAbuse, NI.falseImprisonment],
    financial: [NI.domesticAbuse, NI.blackmail],
    'financial-abuse': [NI.domesticAbuse, NI.blackmail],
    location: [NI.stalking, NI.domesticAbuse],
    'child-related': [NI.childAggravation, NI.domesticAbuse, NI.forcedMarriage, NI.fgm],
    manipulation: [NI.domesticAbuse, NI.blackmail],
    degradation: [NI.domesticAbuse, NI.harassment, NI.criminalDamage],
  },
  protectiveOrders: [
    { title: 'Non-molestation order', statute: 'Family Homes and Domestic Violence (Northern Ireland) Order 1998', summary: 'A court order prohibiting a person from harassing, threatening or contacting you.' },
    { title: 'Occupation order', statute: 'Family Homes and Domestic Violence (Northern Ireland) Order 1998', summary: 'A court order regulating who may live in, or enter, the family home.' },
    { title: 'Stalking Protection Order', statute: 'Protection from Stalking Act (Northern Ireland) 2022', summary: 'An order imposing restrictions on someone suspected of stalking.' },
    { title: 'Restraining order', statute: 'Protection from Harassment (Northern Ireland) Order 1997', summary: 'A court order restraining contact; breach is an offence.' },
    { title: 'FGM Protection Order (FGMPO)', statute: 'Female Genital Mutilation Act 2003, Schedule 2 (extends to Northern Ireland)', summary: 'A court order to protect a girl or woman at risk of female genital mutilation.' },
  ],
  supportContacts: [
    { name: 'Emergency', detail: '999 (police). Non-emergency: 101.' },
    { name: 'Domestic and Sexual Abuse Helpline (NI, 24h)', detail: '0808 802 1414' },
    { name: 'Women’s Aid Federation Northern Ireland', detail: 'womensaidni.org' },
    { name: 'Men’s Advice Line', detail: '0808 8010 327' },
    { name: 'Galop (LGBT+ domestic abuse)', detail: '0800 999 5428' },
  ],
};

// ── Registry ──────────────────────────────────────────────────────────────────

export const JURISDICTIONS: Record<JurisdictionId, Jurisdiction> = {
  'england-wales': ENGLAND_WALES,
  scotland: SCOTLAND,
  'northern-ireland': NORTHERN_IRELAND,
};

export const JURISDICTION_LIST: Jurisdiction[] = [ENGLAND_WALES, SCOTLAND, NORTHERN_IRELAND];
export const DEFAULT_JURISDICTION: JurisdictionId = 'england-wales';

export function getJurisdiction(id: JurisdictionId): Jurisdiction {
  return JURISDICTIONS[id] ?? ENGLAND_WALES;
}

/** Distinct offences for a set of pattern tags within a jurisdiction, in tag order. */
export function offencesForTags(tags: string[], jurisdiction: JurisdictionId): Offence[] {
  const table = getJurisdiction(jurisdiction).tagOffences;
  const seen = new Set<string>();
  const out: Offence[] = [];
  for (const tag of tags) {
    for (const offence of table[tag] ?? []) {
      const key = offence.statute + offence.title;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(offence);
    }
  }
  return out;
}
