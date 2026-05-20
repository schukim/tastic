// Supabase Edge Function: embed-and-search
// 작품 제목을 임베딩으로 변환 후 유사도 검색 수행
// 매칭 경로 전용 - LLM 호출 없음

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 임계치 상수 (work-matching.md 기준)
const THRESHOLDS = {
  AUTO_MATCH: 0.85,
  SUGGEST_CANDIDATES: 0.6,
} as const;

interface EmbedSearchRequest {
  title: string;
  category: 'movie' | 'music' | 'book' | 'art' | 'exhibition' | 'performance';
}

interface SearchResult {
  id: string;
  title: string;
  category: string;
  venue?: string;
  metadata: Record<string, any>;
  similarity_score: number;
  match_reason: string;
}

interface EmbedSearchResponse {
  status: 'auto' | 'candidates' | 'none';
  works: SearchResult[];
  scores: number[];
}

// 임베딩 생성 함수 (OpenAI text-embedding-3-small)
async function generateEmbedding(text: string): Promise<number[]> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: text,
      model: 'text-embedding-3-small', // 384차원
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

serve(async (req) => {
  // CORS 헤더
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // 요청 검증
    const { title, category }: EmbedSearchRequest = await req.json();

    if (!title || !category) {
      return new Response(
        JSON.stringify({ error: 'title and category are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['movie', 'music', 'book', 'art', 'exhibition', 'performance'].includes(category)) {
      return new Response(
        JSON.stringify({ error: 'Invalid category' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Supabase 클라이언트 초기화 (anon key 사용)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
      },
    });

    // 1. 임베딩 생성
    let queryEmbedding: number[];
    try {
      queryEmbedding = await generateEmbedding(title);
    } catch (error) {
      console.error('Embedding generation failed:', error);
      // 임베딩 실패 시 trigram만으로 검색
      queryEmbedding = [];
    }

    // 2. search_works RPC 호출
    const { data: searchResults, error: searchError } = await supabase.rpc('search_works', {
      query_text: title,
      target_category: category,
      query_embedding: queryEmbedding.length > 0 ? queryEmbedding : null,
      trigram_weight: 0.4,
      embedding_weight: 0.6,
      limit_count: 10
    });

    if (searchError) {
      console.error('Search RPC error:', searchError);
      return new Response(
        JSON.stringify({ error: 'Search failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = searchResults || [];

    // 3. 임계치 기준으로 분류
    let status: 'auto' | 'candidates' | 'none';
    let returnWorks: SearchResult[];
    let scores: number[];

    if (results.length === 0) {
      status = 'none';
      returnWorks = [];
      scores = [];
    } else {
      const topScore = results[0].similarity_score;

      if (topScore >= THRESHOLDS.AUTO_MATCH || results[0].match_reason === 'external_id_match') {
        // Auto-match: 최고 점수 작품만 반환
        status = 'auto';
        returnWorks = [results[0]];
        scores = [results[0].similarity_score];
      } else if (topScore >= THRESHOLDS.SUGGEST_CANDIDATES) {
        // Suggest-candidates: 임계치 이상 작품들 반환 (최대 5개)
        const candidates = results.filter(r => r.similarity_score >= THRESHOLDS.SUGGEST_CANDIDATES);
        status = 'candidates';
        returnWorks = candidates.slice(0, 5);
        scores = returnWorks.map(w => w.similarity_score);
      } else {
        // New-entry: 임계치 미달
        status = 'none';
        returnWorks = [];
        scores = [];
      }
    }

    const response: EmbedSearchResponse = {
      status,
      works: returnWorks,
      scores,
    };

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Embed-and-search error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});