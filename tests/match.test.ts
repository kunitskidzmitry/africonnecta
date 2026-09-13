import { describe, expect, it } from 'vitest';

import {
  EXPERTISE_FLOOR,
  rankExpertsForOpportunity,
  scoreExpertAgainstOpportunity,
  type MatchExpert,
  type MatchOpportunity,
} from '@/lib/scoring/match';

const opportunity: MatchOpportunity = {
  id: 'opp-1',
  mode: 'hybrid',
  academicLevel: null,
  requirements: [{ kind: 'expertise', refValue: 'artificial-intelligence', isMandatory: true }],
};

const aiExpert: MatchExpert = {
  id: 'e-ai',
  expertise: [{ slug: 'artificial-intelligence', parentSlug: 'technology' }],
  languages: [{ code: 'en', proficiency: 'c1' }],
  academicLevel: 'lecturer',
  countryIso2: 'RW',
  availabilityModes: ['hybrid'],
  acsTotal: 40,
};

const econExpert: MatchExpert = {
  id: 'e-econ',
  expertise: [{ slug: 'economics', parentSlug: 'business' }],
  languages: [{ code: 'en', proficiency: 'c1' }],
  academicLevel: 'professor',
  countryIso2: 'RW',
  availabilityModes: ['online'],
  acsTotal: 95,
};

describe('matching §6', () => {
  it('drops mandatory expertise misses in stage 1', () => {
    expect(scoreExpertAgainstOpportunity(opportunity, econExpert)).toBeNull();
  });

  it('does not let high ACS promote irrelevant experts (expertise floor)', () => {
    const softOpp: MatchOpportunity = {
      ...opportunity,
      requirements: [
        { kind: 'expertise', refValue: 'artificial-intelligence', isMandatory: false },
      ],
    };
    const scored = scoreExpertAgainstOpportunity(softOpp, econExpert);
    expect(scored).not.toBeNull();
    expect(scored!.factors.expertise).toBeLessThan(EXPERTISE_FLOOR);
    expect(scored!.passedFloor).toBe(false);
  });

  it('ranks relevant experts and records factor contributions', () => {
    const ranked = rankExpertsForOpportunity(opportunity, [aiExpert, econExpert]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.expertId).toBe('e-ai');
    expect(ranked[0]?.factors.research_relevance).toBe(0.5);
    expect(ranked[0]?.totalScore).toBeGreaterThan(0);
  });
});
