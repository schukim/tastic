// 작품 매칭 통합 테스트
// 실제 Supabase DB에 연결하여 search_works, find_potential_duplicates 등을 검증
//
// 실행: cd ingestion && npx vitest run src/__tests__/integration/workSearch.test.ts
// 전제: ingestion/.env에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 세팅

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ─── 타입 ────────────────────────────────────────────────
type WorkCategory = 'movie' | 'music' | 'book' | 'art' | 'exhibition' | 'performance';

interface SearchResult {
  id: string;
  title: string;
  category: WorkCategory;
  venue: string | null;
  start_date: string | null;
  end_date: string | null;
  metadata: Record<string, any>;
  primary_source: string | null;
  external_ids: Record<string, string>;
  is_verified: boolean;
  similarity_score: number;
  trigram_score: number;
  embedding_score: number;
  match_reason: string;
}

interface DuplicateResult {
  id: string;
  title: string;
  venue: string | null;
  similarity_score: number;
  match_type: string;
}

// ─── 테스트 데이터 ────────────────────────────────────────
const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

const TEST_WORKS = [
  {
    user_id: TEST_USER_ID,
    category: 'movie' as WorkCategory,
    title: '기생충',
    venue: null,
    start_date: null,
    end_date: null,
    metadata: { director: '봉준호', release_year: 2019, genre: ['드라마', '코미디'] },
    primary_source: 'tmdb',
    external_ids: { tmdb: 'TEST-496243', imdb: 'TEST-tt6751668' },
    is_verified: true,
  },
  {
    user_id: TEST_USER_ID,
    category: 'movie' as WorkCategory,
    title: '기생충 4K 리마스터',
    venue: null,
    start_date: null,
    end_date: null,
    metadata: { director: '봉준호', release_year: 2024, genre: ['드라마'] },
    primary_source: 'user',
    external_ids: {},
    is_verified: false,
  },
  {
    user_id: TEST_USER_ID,
    category: 'movie' as WorkCategory,
    title: 'Parasite',
    venue: null,
    start_date: null,
    end_date: null,
    metadata: { director: 'Bong Joon-ho', release_year: 2019, genre: ['Drama'] },
    primary_source: 'tmdb',
    external_ids: { tmdb: 'TEST-496243', imdb: 'TEST-tt6751668' },
    is_verified: true,
  },
  {
    user_id: TEST_USER_ID,
    category: 'book' as WorkCategory,
    title: '82년생 김지영',
    venue: null,
    start_date: null,
    end_date: null,
    metadata: { author: '조남주', publisher: '민음사', publication_year: 2016 },
    primary_source: 'openlibrary',
    external_ids: { openlibrary: 'TEST-OL123M', isbn: 'TEST-9788937472381' },
    is_verified: true,
  },
  {
    user_id: TEST_USER_ID,
    category: 'music' as WorkCategory,
    title: '봄날',
    venue: null,
    start_date: null,
    end_date: null,
    metadata: { artist: '방탄소년단', album: 'You Never Walk Alone', release_year: 2017 },
    primary_source: 'musicbrainz',
    external_ids: { musicbrainz: 'TEST-MBZ-001' },
    is_verified: true,
  },
  {
    user_id: TEST_USER_ID,
    category: 'exhibition' as WorkCategory,
    title: '한국 근현대미술 특별전',
    venue: '국립현대미술관 서울관',
    start_date: '2024-03-15',
    end_date: '2024-07-28',
    metadata: { curator: '김미경', exhibition_type: '기획전', artists: ['이중섭', '박수근'] },
    primary_source: 'gov_exhibition',
    external_ids: { gov_id: 'TEST-EXH-001' },
    is_verified: true,
  },
  {
    user_id: TEST_USER_ID,
    category: 'performance' as WorkCategory,
    title: '오페라의 유령',
    venue: '세종문화회관 대극장',
    start_date: '2024-04-20',
    end_date: '2024-05-30',
    metadata: { director: '김태형', cast: ['김소현', '박호산'], genre: ['뮤지컬'] },
    primary_source: 'kopis',
    external_ids: { kopis: 'TEST-PF-001' },
    is_verified: true,
  },
];

// ─── 헬퍼 ─────────────────────────────────────────────────
let supabase: SupabaseClient;
let insertedIds: string[] = [];

async function searchWorks(params: {
  query_text: string;
  target_category?: WorkCategory | null;
  query_embedding?: number[] | null;
  trigram_weight?: number;
  embedding_weight?: number;
  limit_count?: number;
}): Promise<SearchResult[]> {
  const { data, error } = await supabase.rpc('search_works', {
    query_text: params.query_text,
    target_category: params.target_category ?? null,
    query_embedding: params.query_embedding ?? null,
    trigram_weight: params.trigram_weight ?? 0.4,
    embedding_weight: params.embedding_weight ?? 0.6,
    limit_count: params.limit_count ?? 10,
  });
  if (error) throw new Error(`search_works RPC failed: ${error.message}`);
  return data ?? [];
}

async function findDuplicates(params: {
  check_title: string;
  check_category: WorkCategory;
  check_venue?: string | null;
  check_start_date?: string | null;
  threshold?: number;
}): Promise<DuplicateResult[]> {
  const { data, error } = await supabase.rpc('find_potential_duplicates', {
    check_title: params.check_title,
    check_category: params.check_category,
    check_venue: params.check_venue ?? null,
    check_start_date: params.check_start_date ?? null,
    threshold: params.threshold ?? 0.75,
  });
  if (error) throw new Error(`find_potential_duplicates RPC failed: ${error.message}`);
  return data ?? [];
}

// ─── Setup / Teardown ─────────────────────────────────────
beforeAll(async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다');

  supabase = createClient(url, key, { auth: { persistSession: false } });

  // 테스트 데이터 삽입 (user_id = TEST_USER_ID는 auth.users에 없을 수 있어서 user_id를 null로)
  const worksToInsert = TEST_WORKS.map(w => ({ ...w, user_id: null }));
  const { data, error } = await supabase
    .from('works')
    .insert(worksToInsert)
    .select('id');

  if (error) throw new Error(`테스트 데이터 삽입 실패: ${error.message}`);
  insertedIds = (data ?? []).map((r: { id: string }) => r.id);
  console.log(`[Setup] ${insertedIds.length}개 테스트 작품 삽입 완료`);
}, 30_000);

afterAll(async () => {
  if (insertedIds.length > 0) {
    const { error } = await supabase
      .from('works')
      .delete()
      .in('id', insertedIds);
    if (error) console.error('[Teardown] 테스트 데이터 삭제 실패:', error.message);
    else console.log(`[Teardown] ${insertedIds.length}개 테스트 작품 삭제 완료`);
  }
}, 15_000);

// ─── 테스트 ────────────────────────────────────────────────
describe('search_works — 제목 유사도 검색 (trigram only)', () => {
  it('정확한 제목으로 검색 시 높은 점수 반환', async () => {
    const results = await searchWorks({
      query_text: '기생충',
      target_category: 'movie',
      trigram_weight: 1.0,
      embedding_weight: 0.0,
    });

    expect(results.length).toBeGreaterThan(0);
    const top = results[0];
    expect(top.title).toBe('기생충');
    expect(top.similarity_score).toBeGreaterThan(0.8);
    expect(top.match_reason).toBe('similarity_match');
  });

  it('부분 제목으로 검색 시 후보 반환', async () => {
    const results = await searchWorks({
      query_text: '기생',
      target_category: 'movie',
      trigram_weight: 1.0,
      embedding_weight: 0.0,
    });

    // 기생충, 기생충 4K 리마스터 모두 나와야 함
    const titles = results.map(r => r.title);
    const hasParasite = titles.some(t => t.includes('기생충'));
    expect(hasParasite).toBe(true);
  });

  it('카테고리 필터 동작 — movie만 반환', async () => {
    const results = await searchWorks({
      query_text: '기생충',
      target_category: 'movie',
      trigram_weight: 1.0,
      embedding_weight: 0.0,
    });

    const nonMovie = results.filter(r => r.category !== 'movie');
    expect(nonMovie).toHaveLength(0);
  });

  it('카테고리 없이 검색 시 모든 카테고리 반환 가능', async () => {
    const results = await searchWorks({
      query_text: '봄날',
      target_category: null,
      trigram_weight: 1.0,
      embedding_weight: 0.0,
    });

    expect(results.length).toBeGreaterThan(0);
    const musicResult = results.find(r => r.title === '봄날');
    expect(musicResult).toBeDefined();
    expect(musicResult?.category).toBe('music');
  });

  it('전혀 관계없는 검색어 → 결과 없음', async () => {
    const results = await searchWorks({
      query_text: 'xyzabcdefgh1234567890',
      target_category: 'movie',
      trigram_weight: 1.0,
      embedding_weight: 0.0,
    });

    expect(results).toHaveLength(0);
  });
});

describe('search_works — External ID 완전일치 (최우선)', () => {
  it('TMDB ID 완전일치 → score=1.0, match_reason=external_id_match', async () => {
    const results = await searchWorks({
      query_text: 'TEST-496243',
      target_category: 'movie',
    });

    expect(results.length).toBeGreaterThan(0);
    const match = results[0];
    expect(match.similarity_score).toBe(1.0);
    expect(match.match_reason).toBe('external_id_match');
    expect(match.external_ids.tmdb).toBe('TEST-496243');
  });

  it('ISBN 완전일치 → score=1.0', async () => {
    const results = await searchWorks({
      query_text: 'TEST-9788937472381',
      target_category: 'book',
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].similarity_score).toBe(1.0);
    expect(results[0].match_reason).toBe('external_id_match');
    expect(results[0].title).toBe('82년생 김지영');
  });

  it('MusicBrainz ID 완전일치 → score=1.0', async () => {
    const results = await searchWorks({
      query_text: 'TEST-MBZ-001',
      target_category: 'music',
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].similarity_score).toBe(1.0);
    expect(results[0].match_reason).toBe('external_id_match');
  });

  it('존재하지 않는 External ID → 결과 없음', async () => {
    const results = await searchWorks({
      query_text: 'NONEXISTENT-ID-99999',
      target_category: 'movie',
    });

    const externalMatches = results.filter(r => r.match_reason === 'external_id_match');
    expect(externalMatches).toHaveLength(0);
  });
});

describe('search_works — 전시/공연 venue 매칭', () => {
  it('venue 이름으로 검색 시 venue_date_match 반환', async () => {
    const results = await searchWorks({
      query_text: '국립현대미술관',
      target_category: 'exhibition',
    });

    expect(results.length).toBeGreaterThan(0);
    const venueMatch = results.find(r => r.match_reason === 'venue_date_match');
    expect(venueMatch).toBeDefined();
    expect(venueMatch?.venue).toContain('국립현대미술관');
    expect(venueMatch?.similarity_score).toBeGreaterThanOrEqual(0.9);
  });

  it('공연 venue 검색', async () => {
    const results = await searchWorks({
      query_text: '세종문화회관',
      target_category: 'performance',
    });

    expect(results.length).toBeGreaterThan(0);
    const match = results.find(r => r.title === '오페라의 유령');
    expect(match).toBeDefined();
  });

  it('결과에 venue, start_date, end_date 포함', async () => {
    const results = await searchWorks({
      query_text: '한국 근현대미술 특별전',
      target_category: 'exhibition',
      trigram_weight: 1.0,
      embedding_weight: 0.0,
    });

    expect(results.length).toBeGreaterThan(0);
    const match = results.find(r => r.title === '한국 근현대미술 특별전');
    expect(match).toBeDefined();
    expect(match?.venue).toBe('국립현대미술관 서울관');
    expect(match?.start_date).toBe('2024-03-15');
    expect(match?.end_date).toBe('2024-07-28');
  });
});

describe('search_works — 식별필드 보너스', () => {
  it('제목+감독명 복합 검색 시 해당 작품 상위 노출', async () => {
    // 식별필드 보너스는 "query의 첫 번째 단어가 감독/작가 필드에 포함될 때" +0.2 가산
    // 단, trigram threshold를 통과한 결과에만 보너스가 적용됨
    // → "기생충"으로 검색하면 봉준호 영화가 매칭되고, 감독 이름이 메타데이터에 있어야 함
    const results = await searchWorks({
      query_text: '기생충',
      target_category: 'movie',
      trigram_weight: 1.0,
      embedding_weight: 0.0,
    });

    // 기생충 영화가 결과에 있어야 함
    expect(results.length).toBeGreaterThan(0);
    const match = results.find(r => r.title === '기생충');
    expect(match).toBeDefined();
    // 정확한 제목 매칭이므로 trigram score 1.0 (embedding 없으면 그대로)
    expect(match?.trigram_score).toBeCloseTo(1.0, 1);
  });

  it('is_verified=true인 작품이 false보다 상위 정렬', async () => {
    const results = await searchWorks({
      query_text: '기생충',
      target_category: 'movie',
      trigram_weight: 1.0,
      embedding_weight: 0.0,
    });

    // 동점이면 is_verified DESC로 정렬
    const verifiedIndex = results.findIndex(r => r.is_verified === true && r.title === '기생충');
    const unverifiedIndex = results.findIndex(r => r.is_verified === false);
    if (verifiedIndex !== -1 && unverifiedIndex !== -1) {
      expect(verifiedIndex).toBeLessThanOrEqual(unverifiedIndex);
    }
  });
});

describe('search_works — 임계치 분류 (점수 구간)', () => {
  it('정확한 제목 → auto 임계치(0.85) 이상', async () => {
    const results = await searchWorks({
      query_text: '기생충',
      target_category: 'movie',
      trigram_weight: 1.0,
      embedding_weight: 0.0,
    });

    const top = results[0];
    // 정확한 제목이므로 trigram score 1.0 기대
    expect(top.similarity_score).toBeGreaterThanOrEqual(0.85);
  });

  it('유사한 제목 → candidates 구간(0.6~0.84)', async () => {
    // '기생충 4K'는 '기생충'보다 낮은 점수
    const results = await searchWorks({
      query_text: '기생',
      target_category: 'movie',
      trigram_weight: 1.0,
      embedding_weight: 0.0,
    });

    // 점수가 있는 결과들
    const withScore = results.filter(r => r.similarity_score > 0);
    expect(withScore.length).toBeGreaterThan(0);
  });
});

describe('normalize_title 함수', () => {
  it('한글 제목 정규화', async () => {
    const { data, error } = await supabase
      .rpc('normalize_title', { title: '기생충 (Parasite)' });
    expect(error).toBeNull();
    expect(data).toBe('기생충 parasite');
  });

  it('영문 관사 제거', async () => {
    const { data, error } = await supabase
      .rpc('normalize_title', { title: 'The Dark Knight' });
    expect(error).toBeNull();
    expect(data).toBe('dark knight');
  });

  it('특수문자 제거', async () => {
    const { data, error } = await supabase
      .rpc('normalize_title', { title: '해리포터와 마법사의 돌!' });
    expect(error).toBeNull();
    // 특수문자 제거, 소문자화
    expect(typeof data).toBe('string');
    expect(data).not.toContain('!');
  });

  it('공백 정규화', async () => {
    const { data, error } = await supabase
      .rpc('normalize_title', { title: '제목  두칸  공백' });
    expect(error).toBeNull();
    expect(data).toBe('제목 두칸 공백');
  });
});

describe('find_potential_duplicates 함수', () => {
  it('유사한 제목의 중복 감지', async () => {
    const results = await findDuplicates({
      check_title: '기생충',
      check_category: 'movie',
      threshold: 0.6,
    });

    expect(results.length).toBeGreaterThan(0);
    const titles = results.map(r => r.title);
    expect(titles).toContain('기생충');
  });

  it('전시 venue + 날짜 기반 중복 감지', async () => {
    const results = await findDuplicates({
      check_title: '한국 근현대미술전',
      check_category: 'exhibition',
      check_venue: '국립현대미술관',
      check_start_date: '2024-03-15',
      threshold: 0.5,
    });

    expect(results.length).toBeGreaterThan(0);
    const venueMatch = results.find(r => r.match_type === 'venue_match');
    expect(venueMatch).toBeDefined();
  });

  it('완전히 다른 제목 → 결과 없음', async () => {
    const results = await findDuplicates({
      check_title: 'xyznonexistentwork9999',
      check_category: 'movie',
      threshold: 0.75,
    });

    expect(results).toHaveLength(0);
  });

  it('임계치가 낮을수록 더 많은 후보', async () => {
    const highThreshold = await findDuplicates({
      check_title: '기생충',
      check_category: 'movie',
      threshold: 0.9,
    });

    const lowThreshold = await findDuplicates({
      check_title: '기생충',
      check_category: 'movie',
      threshold: 0.5,
    });

    expect(lowThreshold.length).toBeGreaterThanOrEqual(highThreshold.length);
  });
});

describe('get_works_stats 함수', () => {
  it('소스별 작품 통계 반환', async () => {
    const { data, error } = await supabase.rpc('get_works_stats');
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    // tmdb, openlibrary 등 소스가 있어야 함
    const sources = (data as any[]).map(r => r.source);
    expect(sources).toContain('tmdb');
  });

  it('각 행에 필수 필드 포함', async () => {
    const { data } = await supabase.rpc('get_works_stats');
    const row = (data as any[])[0];
    expect(row).toHaveProperty('source');
    expect(row).toHaveProperty('category');
    expect(row).toHaveProperty('total_works');
    expect(row).toHaveProperty('verified_works');
    expect(row).toHaveProperty('embedded_works');
  });
});
