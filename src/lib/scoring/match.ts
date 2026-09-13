/**
 * Opportunity matching (§6) — pure ranking.
 * Embeddings deferred (Q7 [BLOCKED]): expertise = hierarchical tag_overlap only (ADR-0011).
 */

export const MATCH_ALGORITHM_VERSION = 'match.1';
export const EXPERTISE_FLOOR = 0.35;

export type MatchRequirement = {
  kind: 'expertise' | 'language' | 'academic_level' | 'country';
  refValue: string;
  isMandatory: boolean;
};

export type MatchOpportunity = {
  id: string;
  mode: 'online' | 'hybrid' | 'onsite' | null;
  academicLevel: string | null;
  requirements: MatchRequirement[];
};

export type MatchExpert = {
  id: string;
  /** Expertise slugs; parent slug optional for hierarchy credit */
  expertise: { slug: string; parentSlug: string | null }[];
  languages: { code: string; proficiency: string }[];
  academicLevel: string | null;
  countryIso2: string | null;
  availabilityModes: Array<'online' | 'hybrid' | 'onsite'>;
  /** Latest ACS total 0–100; missing → treated as 0 for ranking factor */
  acsTotal: number | null;
};

export type MatchFactors = {
  expertise: number;
  african_context_score: number;
  research_relevance: number;
  language_match: number;
  availability: number;
};

export type MatchScored = {
  expertId: string;
  totalScore: number;
  factors: MatchFactors;
  passedFloor: boolean;
};

function tagOverlap(requiredSlugs: string[], expert: MatchExpert['expertise']): number {
  if (requiredSlugs.length === 0) return 1;

  let score = 0;
  for (const req of requiredSlugs) {
    const exact = expert.some((e) => e.slug === req);
    const parent = expert.some((e) => e.parentSlug === req || e.slug === req);
    const childOfReq = expert.some((e) => e.parentSlug === req);
    if (exact) score += 1;
    else if (childOfReq || parent) score += 0.5;
  }
  return Math.min(1, score / requiredSlugs.length);
}

function languageFactor(requiredCodes: string[], languages: MatchExpert['languages']): number {
  if (requiredCodes.length === 0) return 1;

  let best = 0;
  for (const code of requiredCodes) {
    const hit = languages.find((l) => l.code === code);
    if (!hit) continue;
    const p = hit.proficiency;
    const score = p === 'c1' || p === 'c2' || p === 'native' ? 1 : p === 'b2' ? 0.7 : 0;
    best = Math.max(best, score);
  }
  return best;
}

function availabilityFactor(
  opportunityMode: MatchOpportunity['mode'],
  modes: MatchExpert['availabilityModes'],
): number {
  if (!opportunityMode) return 1;
  if (modes.length === 0) return 0.6; // unknown → soft neutral
  if (modes.includes(opportunityMode)) return 1;
  if (opportunityMode === 'hybrid') {
    if (modes.includes('online') || modes.includes('onsite')) return 0.6;
  }
  if ((opportunityMode === 'online' || opportunityMode === 'onsite') && modes.includes('hybrid')) {
    return 0.6;
  }
  return 0;
}

function passesHardFilters(opportunity: MatchOpportunity, expert: MatchExpert): boolean {
  for (const req of opportunity.requirements.filter((r) => r.isMandatory)) {
    if (req.kind === 'expertise') {
      const overlap = tagOverlap([req.refValue], expert.expertise);
      if (overlap < 0.5) return false;
    }
    if (req.kind === 'language') {
      if (languageFactor([req.refValue], expert.languages) <= 0) return false;
    }
    if (req.kind === 'academic_level') {
      if (expert.academicLevel !== req.refValue) return false;
    }
    if (req.kind === 'country') {
      if (expert.countryIso2 !== req.refValue) return false;
    }
  }
  return true;
}

export function scoreExpertAgainstOpportunity(
  opportunity: MatchOpportunity,
  expert: MatchExpert,
): MatchScored | null {
  if (!passesHardFilters(opportunity, expert)) return null;

  const expertiseSlugs = opportunity.requirements
    .filter((r) => r.kind === 'expertise')
    .map((r) => r.refValue);
  const languageCodes = opportunity.requirements
    .filter((r) => r.kind === 'language')
    .map((r) => r.refValue);

  const expertise = tagOverlap(expertiseSlugs, expert.expertise);
  if (expertise < EXPERTISE_FLOOR) {
    return {
      expertId: expert.id,
      totalScore: 0,
      factors: {
        expertise,
        african_context_score: 0,
        research_relevance: 0.5,
        language_match: 0,
        availability: 0,
      },
      passedFloor: false,
    };
  }

  const factors: MatchFactors = {
    expertise,
    african_context_score: Math.min(1, Math.max(0, (expert.acsTotal ?? 0) / 100)),
    // Neutral until publications / ORCID (Phase 1.5) and embeddings (Q7).
    research_relevance: 0.5,
    language_match: languageFactor(languageCodes, expert.languages),
    availability: availabilityFactor(opportunity.mode, expert.availabilityModes),
  };

  const totalScore =
    0.4 * factors.expertise +
    0.25 * factors.african_context_score +
    0.15 * factors.research_relevance +
    0.1 * factors.language_match +
    0.1 * factors.availability;

  return {
    expertId: expert.id,
    totalScore: Math.round(totalScore * 10000) / 10000,
    factors,
    passedFloor: true,
  };
}

export function rankExpertsForOpportunity(
  opportunity: MatchOpportunity,
  experts: MatchExpert[],
  limit = 50,
): MatchScored[] {
  const scored: MatchScored[] = [];
  for (const expert of experts) {
    const row = scoreExpertAgainstOpportunity(opportunity, expert);
    if (row && row.passedFloor) scored.push(row);
  }
  scored.sort((a, b) => b.totalScore - a.totalScore || a.expertId.localeCompare(b.expertId));
  return scored.slice(0, limit);
}
