/**
 * African Context Score (§5) — pure, server-side, versioned.
 * Weights remain [FILL] per §14; change ACS_WEIGHTS without touching call sites.
 */

export const ACS_ALGORITHM_VERSION = 'acs.1';

/** Fairness threshold §5.3: RW vs CA twins may differ by at most this many points. */
export const ACS_FAIRNESS_MAX_DELTA = 5;

export const ACS_WEIGHTS = {
  academic_engagement: 25,
  geographical_expertise: 25,
  policy_development: 20,
  contribution: 15,
  language_cultural: 15,
} as const;

export type AcsConfidence = 0.5 | 0.8 | 1.0;

export type AcsExperience = {
  type: 'academic' | 'policy' | 'development' | 'industry';
  countryIsAfrican: boolean;
  years: number;
};

export type AcsLanguage = {
  /** ISO 639-1 */
  code: string;
  /** 0–1 from CEFR mapping */
  proficiencyScore: number;
};

export type AcsInputs = {
  residenceIsAfrican: boolean;
  experiences: AcsExperience[];
  languages: AcsLanguage[];
  /** Expertise slugs on the profile */
  expertiseSlugs: string[];
  /** Claimed years in primary expertise (fallback when no experiences) */
  claimedYearsExperience: number;
  /** Affiliation verified externally / domain → confidence bump */
  affiliationVerified: boolean;
};

export type AcsComponentDetail = {
  raw: number;
  confidence: AcsConfidence;
  weighted: number;
  local?: number;
  diaspora?: number;
};

export type AcsResult = {
  algorithmVersion: string;
  total: number;
  components: {
    academic_engagement: AcsComponentDetail;
    geographical_expertise: AcsComponentDetail;
    policy_development: AcsComponentDetail;
    contribution: AcsComponentDetail;
    language_cultural: AcsComponentDetail;
  };
  inputsHash: string;
};

const AFRICAN_LANGUAGE_CODES = new Set(['rw', 'sw']);

const POLICY_SLUGS = new Set([
  'public-policy',
  'law-and-policy',
  'development-studies',
  'economics',
]);

export function proficiencyToScore(
  level: 'a1' | 'a2' | 'b1' | 'b2' | 'c1' | 'c2' | 'native',
): number {
  switch (level) {
    case 'a1':
      return 0.2;
    case 'a2':
      return 0.35;
    case 'b1':
      return 0.5;
    case 'b2':
      return 0.7;
    case 'c1':
      return 0.85;
    case 'c2':
    case 'native':
      return 1;
  }
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function yearsFromExperiences(
  experiences: AcsExperience[],
  predicate: (e: AcsExperience) => boolean,
): number {
  return experiences.filter(predicate).reduce((sum, e) => sum + Math.max(0, e.years), 0);
}

function confidenceFor(inputs: AcsInputs): AcsConfidence {
  return inputs.affiliationVerified ? 1.0 : 0.5;
}

function academicEngagementRaw(inputs: AcsInputs): number {
  const africanAcademicYears = yearsFromExperiences(
    inputs.experiences,
    (e) => e.type === 'academic' && e.countryIsAfrican,
  );
  if (africanAcademicYears > 0) {
    return clamp(africanAcademicYears * 10);
  }
  if (inputs.residenceIsAfrican && inputs.claimedYearsExperience > 0) {
    return clamp(inputs.claimedYearsExperience * 8);
  }
  return inputs.residenceIsAfrican ? 20 : 0;
}

function geographicalRaw(inputs: AcsInputs): number {
  const africanCountries = new Set<string>();
  if (inputs.residenceIsAfrican) africanCountries.add('residence');
  for (const e of inputs.experiences) {
    if (e.countryIsAfrican) africanCountries.add(`${e.type}:${e.years}`);
  }
  const depth = yearsFromExperiences(inputs.experiences, (e) => e.countryIsAfrican);
  return clamp(africanCountries.size * 25 + Math.min(depth, 10) * 2.5);
}

function policyRaw(inputs: AcsInputs): number {
  const policyYears = yearsFromExperiences(
    inputs.experiences,
    (e) => e.type === 'policy' || e.type === 'development',
  );
  const tagHit = inputs.expertiseSlugs.some((s) => POLICY_SLUGS.has(s));
  return clamp(policyYears * 12 + (tagHit ? 30 : 0));
}

function contributionParts(inputs: AcsInputs): { local: number; diaspora: number } {
  const africanWorkYears = yearsFromExperiences(
    inputs.experiences,
    (e) => e.countryIsAfrican && (e.type === 'academic' || e.type === 'development'),
  );
  const workScore = Math.min(40, africanWorkYears * 8);

  const local = clamp((inputs.residenceIsAfrican ? 60 : 0) + workScore);
  const diaspora = clamp((inputs.residenceIsAfrican ? 0 : 60) + workScore);
  return { local, diaspora };
}

function languageRaw(inputs: AcsInputs): number {
  const africanLangs = inputs.languages.filter((l) => AFRICAN_LANGUAGE_CODES.has(l.code));
  if (africanLangs.length === 0) {
    return inputs.residenceIsAfrican ? 15 : 0;
  }
  const best = Math.max(...africanLangs.map((l) => l.proficiencyScore));
  return clamp(best * 70 + africanLangs.length * 15);
}

function hashInputs(inputs: AcsInputs): string {
  const s = JSON.stringify(inputs);
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return `h${(h >>> 0).toString(16)}_${s.length}`;
}

export function computeAcs(inputs: AcsInputs): AcsResult {
  const confidence = confidenceFor(inputs);
  const contribution = contributionParts(inputs);
  const contributionRaw = Math.max(contribution.local, contribution.diaspora);

  const details = {
    academic_engagement: {
      raw: round2(academicEngagementRaw(inputs)),
      confidence,
      weighted: 0,
    },
    geographical_expertise: {
      raw: round2(geographicalRaw(inputs)),
      confidence,
      weighted: 0,
    },
    policy_development: {
      raw: round2(policyRaw(inputs)),
      confidence,
      weighted: 0,
    },
    contribution: {
      raw: round2(contributionRaw),
      confidence,
      weighted: 0,
      local: round2(contribution.local),
      diaspora: round2(contribution.diaspora),
    },
    language_cultural: {
      raw: round2(languageRaw(inputs)),
      confidence,
      weighted: 0,
    },
  } satisfies AcsResult['components'];

  let total = 0;
  for (const key of Object.keys(ACS_WEIGHTS) as (keyof typeof ACS_WEIGHTS)[]) {
    const weight = ACS_WEIGHTS[key] / 100;
    const component = details[key];
    component.weighted = round2(component.raw * component.confidence * weight);
    total += component.weighted;
  }

  return {
    algorithmVersion: ACS_ALGORITHM_VERSION,
    total: round2(clamp(total)),
    components: details,
    inputsHash: hashInputs(inputs),
  };
}

/** Build twin inputs that differ only by residence continent (fairness §5.3). */
export function fairnessTwinInputs(base: Omit<AcsInputs, 'residenceIsAfrican'>): {
  kigali: AcsInputs;
  toronto: AcsInputs;
} {
  return {
    kigali: { ...base, residenceIsAfrican: true },
    toronto: { ...base, residenceIsAfrican: false },
  };
}
