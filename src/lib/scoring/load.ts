import 'server-only';

import { createHash } from 'node:crypto';

import { computeAcs, proficiencyToScore, type AcsInputs, type AcsResult } from '@/lib/scoring/acs';
import {
  MATCH_ALGORITHM_VERSION,
  rankExpertsForOpportunity,
  type MatchExpert,
  type MatchOpportunity,
} from '@/lib/scoring/match';
import { createClient } from '@/lib/supabase/server';

export type StoredAcs = {
  id: string;
  expert_id: string;
  algorithm_version: string;
  total: number;
  components: AcsResult['components'];
  computed_at: string;
};

function yearsBetween(startedOn: string | null, endedOn: string | null): number {
  if (!startedOn) return 1;
  const start = new Date(startedOn);
  const end = endedOn ? new Date(endedOn) : new Date();
  const years = (end.getTime() - start.getTime()) / (365.25 * 24 * 3600 * 1000);
  return Math.max(0.5, Math.round(years * 10) / 10);
}

export async function buildAcsInputs(expertId: string): Promise<AcsInputs | null> {
  const supabase = await createClient();

  const { data: expert } = await supabase
    .from('experts')
    .select(
      'id, country_id, academic_level, countries(is_african), expert_expertise(years_experience, expertise(slug)), expert_languages(proficiency, languages(iso639_1))',
    )
    .eq('id', expertId)
    .maybeSingle();

  if (!expert) return null;

  const { data: experiences } = await supabase
    .from('experiences')
    .select('type, started_on, ended_on, countries(is_african)')
    .eq('expert_id', expertId);

  const { data: affiliation } = await supabase
    .from('verification_requests')
    .select('id')
    .eq('subject_type', 'expert_affiliation')
    .eq('subject_id', expertId)
    .eq('status', 'approved')
    .limit(1)
    .maybeSingle();

  const country = Array.isArray(expert.countries) ? expert.countries[0] : expert.countries;
  const expertiseRows = expert.expert_expertise ?? [];
  const languageRows = expert.expert_languages ?? [];

  const claimedYears = expertiseRows.reduce((sum, row) => sum + (row.years_experience ?? 0), 0);

  return {
    residenceIsAfrican: Boolean(country && 'is_african' in country && country.is_african),
    experiences: (experiences ?? []).map((row) => {
      const c = Array.isArray(row.countries) ? row.countries[0] : row.countries;
      return {
        type: row.type,
        countryIsAfrican: Boolean(c && 'is_african' in c && c.is_african),
        years: yearsBetween(row.started_on, row.ended_on),
      };
    }),
    languages: languageRows.map((row) => {
      const lang = Array.isArray(row.languages) ? row.languages[0] : row.languages;
      const code = lang && 'iso639_1' in lang ? String(lang.iso639_1) : '';
      return {
        code,
        proficiencyScore: proficiencyToScore(
          row.proficiency as 'a1' | 'a2' | 'b1' | 'b2' | 'c1' | 'c2' | 'native',
        ),
      };
    }),
    expertiseSlugs: expertiseRows
      .map((row) => {
        const e = Array.isArray(row.expertise) ? row.expertise[0] : row.expertise;
        return e && 'slug' in e ? String(e.slug) : null;
      })
      .filter((s): s is string => Boolean(s)),
    claimedYearsExperience: claimedYears,
    affiliationVerified: Boolean(affiliation),
  };
}

export async function getLatestAcs(expertId: string): Promise<StoredAcs | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('african_context_scores')
    .select('id, expert_id, algorithm_version, total, components, computed_at')
    .eq('expert_id', expertId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return {
    ...data,
    total: Number(data.total),
    components: data.components as AcsResult['components'],
  };
}

export async function persistAcs(
  expertId: string,
  result: AcsResult,
  computedBy: string | null,
): Promise<StoredAcs> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('african_context_scores')
    .insert({
      expert_id: expertId,
      algorithm_version: result.algorithmVersion,
      total: result.total,
      components: result.components,
      inputs_hash: result.inputsHash,
      computed_by: computedBy,
    })
    .select('id, expert_id, algorithm_version, total, components, computed_at')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to store ACS');
  }

  return {
    ...data,
    total: Number(data.total),
    components: data.components as AcsResult['components'],
  };
}

export async function recomputeAndStoreAcs(
  expertId: string,
  computedBy: string | null,
): Promise<StoredAcs> {
  const inputs = await buildAcsInputs(expertId);
  if (!inputs) throw new Error('Expert not found');
  const result = computeAcs(inputs);
  return persistAcs(expertId, result, computedBy);
}

export async function runOpportunityMatch(params: {
  opportunityId: string;
  actorUserId: string;
  institutionId: string;
}): Promise<{
  runId: string;
  results: Array<{ expertId: string; rank: number; totalScore: number }>;
}> {
  const supabase = await createClient();

  const { data: opportunity, error: oppError } = await supabase
    .from('opportunities')
    .select('id, mode, institution_id, opportunity_requirements(kind, ref_value, is_mandatory)')
    .eq('id', params.opportunityId)
    .eq('institution_id', params.institutionId)
    .maybeSingle();

  if (oppError || !opportunity) {
    throw new Error('Opportunity not found');
  }

  const expertiseById = new Map<number, { slug: string; parentSlug: string | null }>();
  const { data: expertiseRows } = await supabase.from('expertise').select('id, slug, parent_id');
  for (const row of expertiseRows ?? []) {
    const parent = expertiseRows?.find((e) => e.id === row.parent_id);
    expertiseById.set(row.id, {
      slug: row.slug,
      parentSlug: parent?.slug ?? null,
    });
  }

  const resolveExpertiseRef = (ref: string): string => {
    const asId = Number(ref);
    if (Number.isFinite(asId) && expertiseById.has(asId)) {
      return expertiseById.get(asId)!.slug;
    }
    return ref;
  };

  const requirements = (opportunity.opportunity_requirements ?? []).map((r) => ({
    kind: r.kind as MatchOpportunity['requirements'][number]['kind'],
    refValue: r.kind === 'expertise' ? resolveExpertiseRef(r.ref_value) : r.ref_value,
    isMandatory: r.is_mandatory,
  }));

  const matchOpp: MatchOpportunity = {
    id: opportunity.id,
    mode: opportunity.mode,
    academicLevel: requirements.find((r) => r.kind === 'academic_level')?.refValue ?? null,
    requirements,
  };

  const { data: experts } = await supabase
    .from('experts')
    .select(
      'id, academic_level, country_id, countries(iso2), expert_expertise(expertise(slug, parent_id)), expert_languages(proficiency, languages(iso639_1))',
    )
    .not('published_at', 'is', null)
    .eq('profile_visibility', 'public')
    .is('deleted_at', null)
    .limit(500);

  const expertIds = (experts ?? []).map((e) => e.id);
  const availabilityByExpert = new Map<string, Array<'online' | 'hybrid' | 'onsite'>>();
  if (expertIds.length > 0) {
    const { data: availability } = await supabase
      .from('expert_availability')
      .select('expert_id, mode')
      .in('expert_id', expertIds);
    for (const row of availability ?? []) {
      const list = availabilityByExpert.get(row.expert_id) ?? [];
      list.push(row.mode);
      availabilityByExpert.set(row.expert_id, list);
    }
  }
  const acsByExpert = new Map<string, number>();
  if (expertIds.length > 0) {
    const { data: acsRows } = await supabase
      .from('african_context_scores')
      .select('expert_id, total, computed_at')
      .in('expert_id', expertIds)
      .order('computed_at', { ascending: false });
    for (const row of acsRows ?? []) {
      if (!acsByExpert.has(row.expert_id)) {
        acsByExpert.set(row.expert_id, Number(row.total));
      }
    }
  }

  const matchExperts: MatchExpert[] = [];
  for (const expert of experts ?? []) {
    const country = Array.isArray(expert.countries) ? expert.countries[0] : expert.countries;

    matchExperts.push({
      id: expert.id,
      academicLevel: expert.academic_level,
      countryIso2: country && 'iso2' in country ? String(country.iso2) : null,
      expertise: (expert.expert_expertise ?? []).map((row) => {
        const e = Array.isArray(row.expertise) ? row.expertise[0] : row.expertise;
        const slug = e && 'slug' in e ? String(e.slug) : '';
        const parentId = e && 'parent_id' in e ? (e.parent_id as number | null) : null;
        return {
          slug,
          parentSlug: parentId != null ? (expertiseById.get(parentId)?.slug ?? null) : null,
        };
      }),
      languages: (expert.expert_languages ?? []).map((row) => {
        const lang = Array.isArray(row.languages) ? row.languages[0] : row.languages;
        return {
          code: lang && 'iso639_1' in lang ? String(lang.iso639_1) : '',
          proficiency: row.proficiency,
        };
      }),
      availabilityModes: availabilityByExpert.get(expert.id) ?? [],
      acsTotal: acsByExpert.get(expert.id) ?? null,
    });
  }

  const ranked = rankExpertsForOpportunity(matchOpp, matchExperts, 50);

  const queryFingerprint = createHash('sha256')
    .update(JSON.stringify({ opportunityId: params.opportunityId, requirements }))
    .digest('hex')
    .slice(0, 32);

  const { data: run, error: runError } = await supabase
    .from('match_runs')
    .insert({
      actor_user_id: params.actorUserId,
      institution_id: params.institutionId,
      opportunity_id: params.opportunityId,
      query: {
        opportunityId: params.opportunityId,
        requirements,
        fingerprint: queryFingerprint,
      },
      algorithm_version: MATCH_ALGORITHM_VERSION,
    })
    .select('id')
    .single();

  if (runError || !run) {
    throw new Error(runError?.message ?? 'Failed to create match run');
  }

  if (ranked.length > 0) {
    const { error: resultsError } = await supabase.from('match_results').insert(
      ranked.map((row, index) => ({
        match_run_id: run.id,
        expert_id: row.expertId,
        rank: index + 1,
        total_score: row.totalScore,
        factors: row.factors,
      })),
    );
    if (resultsError) {
      throw new Error(resultsError.message);
    }
  }

  return {
    runId: run.id,
    results: ranked.map((row, index) => ({
      expertId: row.expertId,
      rank: index + 1,
      totalScore: row.totalScore,
    })),
  };
}
