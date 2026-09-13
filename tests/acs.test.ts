import { describe, expect, it } from 'vitest';

import {
  ACS_FAIRNESS_MAX_DELTA,
  computeAcs,
  fairnessTwinInputs,
  proficiencyToScore,
  type AcsInputs,
} from '@/lib/scoring/acs';

const sharedBase: Omit<AcsInputs, 'residenceIsAfrican'> = {
  experiences: [
    {
      type: 'academic',
      countryIsAfrican: true,
      years: 5,
    },
    {
      type: 'policy',
      countryIsAfrican: true,
      years: 2,
    },
  ],
  languages: [
    { code: 'rw', proficiencyScore: proficiencyToScore('native') },
    { code: 'en', proficiencyScore: proficiencyToScore('c1') },
  ],
  expertiseSlugs: ['economics', 'public-policy', 'climate-change'],
  claimedYearsExperience: 8,
  affiliationVerified: false,
};

describe('ACS §5', () => {
  it('produces a deterministic total in 0–100', () => {
    const a = computeAcs({ ...sharedBase, residenceIsAfrican: true });
    const b = computeAcs({ ...sharedBase, residenceIsAfrican: true });
    expect(a.total).toBe(b.total);
    expect(a.total).toBeGreaterThan(0);
    expect(a.total).toBeLessThanOrEqual(100);
    expect(a.algorithmVersion).toBe('acs.1');
    expect(a.inputsHash).toBe(b.inputsHash);
  });

  it('stores local/diaspora branches and uses max for contribution (Q4)', () => {
    const result = computeAcs({ ...sharedBase, residenceIsAfrican: true });
    expect(result.components.contribution.local).toBeDefined();
    expect(result.components.contribution.diaspora).toBeDefined();
    expect(result.components.contribution.raw).toBe(
      Math.max(result.components.contribution.local!, result.components.contribution.diaspora!),
    );
  });

  it('fairness §5.3: Kigali vs Toronto twins stay within threshold', () => {
    const { kigali, toronto } = fairnessTwinInputs(sharedBase);
    const local = computeAcs(kigali);
    const diaspora = computeAcs(toronto);
    const delta = Math.abs(local.total - diaspora.total);
    expect(delta).toBeLessThanOrEqual(ACS_FAIRNESS_MAX_DELTA);
  });

  it('external affiliation confidence raises the score vs claimed-only', () => {
    const claimed = computeAcs({
      ...sharedBase,
      residenceIsAfrican: true,
      affiliationVerified: false,
    });
    const verified = computeAcs({
      ...sharedBase,
      residenceIsAfrican: true,
      affiliationVerified: true,
    });
    expect(verified.total).toBeGreaterThan(claimed.total);
  });
});
