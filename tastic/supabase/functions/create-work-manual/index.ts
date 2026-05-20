// Supabase Edge Function: create-work-manual
// 사용자가 직접 입력한 메타데이터로 신규 작품 등록
// LLM 호출 없음 - 비용 절약 및 정확도 향상

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface CreateWorkRequest {
  title: string;
  category: 'movie' | 'music' | 'book' | 'art' | 'exhibition' | 'performance';
  venue?: string; // 전시/공연용
  start_date?: string; // YYYY-MM-DD
  end_date?: string; // YYYY-MM-DD
  metadata: Record<string, any>; // 사용자가 직접 입력한 메타데이터
}

interface CreateWorkResponse {
  success: boolean;
  work?: {
    id: string;
    title: string;
    category: string;
    venue?: string;
    metadata: Record<string, any>;
  };
  error?: string;
  duplicate_warning?: {
    message: string;
    similar_works: Array<{ id: string; title: string; similarity_score: number }>;
  };
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
    const {
      title,
      category,
      venue,
      start_date,
      end_date,
      metadata
    }: CreateWorkRequest = await req.json();

    if (!title || !category || !metadata) {
      return new Response(
        JSON.stringify({ error: 'title, category, and metadata are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 카테고리 검증
    if (!['movie', 'music', 'book', 'art', 'exhibition', 'performance'].includes(category)) {
      return new Response(
        JSON.stringify({ error: 'Invalid category' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 전시/공연의 경우 venue 필수
    if (['exhibition', 'performance'].includes(category) && !venue) {
      return new Response(
        JSON.stringify({ error: 'venue is required for exhibitions and performances' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 인증 토큰 확인
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Supabase 클라이언트 초기화
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    // 현재 사용자 확인
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert 직전 중복 체크 (race condition 방지)
    const { data: duplicateCheck, error: duplicateError } = await supabase.rpc('search_works', {
      query_text: title,
      target_category: category,
      query_embedding: null, // 중복 체크는 trigram만으로
      trigram_weight: 1.0,
      embedding_weight: 0.0,
      limit_count: 3
    });

    if (duplicateError) {
      console.error('Duplicate check failed:', duplicateError);
    }

    // 높은 유사도 중복 발견 시 경고 포함해서 응답
    let duplicateWarning;
    if (duplicateCheck && duplicateCheck.length > 0) {
      const highSimilarity = duplicateCheck.filter(w => w.similarity_score > 0.75);
      if (highSimilarity.length > 0) {
        duplicateWarning = {
          message: "이미 있는 작품 같아요",
          similar_works: highSimilarity.map(w => ({
            id: w.id,
            title: w.title,
            similarity_score: w.similarity_score
          }))
        };
      }
    }

    // 작품 데이터 구성
    const workData = {
      user_id: user.id,
      category,
      title,
      venue: venue || null,
      start_date: start_date || null,
      end_date: end_date || null,
      metadata,
      primary_source: 'user',
      is_verified: false, // 사용자 입력은 미검증
    };

    // Works 테이블에 삽입
    const { data: newWork, error: insertError } = await supabase
      .from('works')
      .insert(workData)
      .select()
      .single();

    if (insertError) {
      console.error('Work insertion failed:', insertError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to create work',
          details: insertError.message
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const response: CreateWorkResponse = {
      success: true,
      work: {
        id: newWork.id,
        title: newWork.title,
        category: newWork.category,
        venue: newWork.venue,
        metadata: newWork.metadata,
      },
      duplicate_warning: duplicateWarning,
    };

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Create-work-manual error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});