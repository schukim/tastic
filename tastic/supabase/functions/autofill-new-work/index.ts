// Supabase Edge Function: autofill-new-work
// Claude API로 메타데이터 자동 채움 후 신규 작품 등록
//
// FALLBACK 용도: 외부 ingestion이 커버하는 범위가 늘어날수록
// 이 함수 호출 빈도는 줄어든다. 궁극적으로는 사용자가 직접
// 등록하는 작품(개인 갤러리 작품, 소규모 공연 등)에만 사용됨.
//
// Claude API 호출은 오직 이 함수에서만 발생한다. (비용 절감 원칙)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface AutofillRequest {
  title: string;
  category: 'movie' | 'music' | 'book' | 'art' | 'exhibition' | 'performance';
}

interface AutofillResponse {
  success: boolean;
  work?: {
    id: string;
    title: string;
    category: string;
    metadata: Record<string, any>;
  };
  error?: string;
  duplicate_warning?: {
    message: string;
    similar_works: Array<{ id: string; title: string; similarity_score: number }>;
  };
}

// 카테고리별 메타데이터 자동 채움 프롬프트
function getMetadataPrompt(title: string, category: string): string {
  const baseInstruction = `다음 ${category} 작품의 메타데이터를 JSON 형식으로 생성해주세요. 정확한 정보를 모르면 null을 사용하세요.

작품명: "${title}"
카테고리: ${category}

JSON 응답만 제공하고 다른 설명은 하지 마세요.`;

  switch (category) {
    case 'movie':
      return `${baseInstruction}

필요한 필드:
{
  "director": "감독명 (string)",
  "release_year": 출시연도 (number),
  "genre": ["장르1", "장르2"] (array of strings),
  "duration_minutes": 상영시간분 (number),
  "cast": ["주연1", "주연2"] (array of strings),
  "synopsis": "줄거리 요약" (string),
  "poster_url": null,
  "rating": "관람등급" (string)
}`;

    case 'music':
      return `${baseInstruction}

필요한 필드:
{
  "artist": "아티스트명" (string),
  "album": "앨범명" (string),
  "release_year": 출시연도 (number),
  "genre": ["장르1", "장르2"] (array of strings),
  "duration_seconds": 재생시간초 (number),
  "track_number": 트랙번호 (number),
  "album_cover_url": null,
  "lyrics_preview": "가사 미리보기" (string)
}`;

    case 'book':
      return `${baseInstruction}

필요한 필드:
{
  "author": "저자명" (string),
  "publisher": "출판사" (string),
  "publication_year": 출판연도 (number),
  "isbn": "ISBN번호" (string),
  "genre": ["장르1", "장르2"] (array of strings),
  "page_count": 페이지수 (number),
  "cover_url": null,
  "summary": "내용 요약" (string)
}`;

    case 'art':
      return `${baseInstruction}

필요한 필드:
{
  "artist": "작가명" (string),
  "creation_year": 제작연도 (number),
  "medium": "재료/기법" (string),
  "dimensions": "크기(cm)" (string),
  "style": ["양식/스타일"] (array of strings),
  "collection": "소장처" (string),
  "image_url": null,
  "description": "작품 설명" (string)
}`;

    case 'exhibition':
      return `${baseInstruction}

필요한 필드:
{
  "curator": "큐레이터" (string),
  "artists": ["참여작가1", "참여작가2"] (array of strings),
  "exhibition_type": "전시 유형" (string),
  "poster_url": null,
  "description": "전시 설명" (string)
}`;

    case 'performance':
      return `${baseInstruction}

필요한 필드:
{
  "director": "연출가" (string),
  "cast": ["출연자1", "출연자2"] (array of strings),
  "performance_dates": ["2024-04-20"] (array of date strings),
  "genre": ["공연장르"] (array of strings),
  "duration_minutes": 공연시간분 (number),
  "age_rating": "관람연령" (string),
  "poster_url": null,
  "synopsis": "공연 개요" (string)
}`;

    default:
      return baseInstruction;
  }
}

// Claude API 호출
async function generateMetadata(title: string, category: string): Promise<Record<string, any>> {
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const prompt = getMetadataPrompt(title, category);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ANTHROPIC_API_KEY}`,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307', // 비용 절감을 위해 Haiku 사용
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Claude API error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const content = data.content[0].text;

  // JSON 파싱 시도
  try {
    return JSON.parse(content);
  } catch (parseError) {
    console.error('Failed to parse Claude response as JSON:', content);
    // JSON 파싱 실패 시 기본 메타데이터 반환
    return {};
  }
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
    const { title, category }: AutofillRequest = await req.json();

    if (!title || !category) {
      return new Response(
        JSON.stringify({ error: 'title and category are required' }),
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

    // Supabase 클라이언트 초기화 (사용자 토큰 사용)
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

    // 1. Claude API로 메타데이터 생성
    let metadata: Record<string, any>;
    try {
      metadata = await generateMetadata(title, category);
    } catch (error) {
      console.error('Metadata generation failed:', error);
      // Claude API 실패 시 빈 메타데이터로 진행
      metadata = {};
    }

    // 2. Insert 직전 중복 체크 (race condition 방지)
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

    // 3. 작품 데이터 구성
    const workData = {
      user_id: user.id,
      category,
      title,
      metadata,
      primary_source: 'user',
      is_verified: false,
    };

    // 전시/공연의 경우 venue, start_date, end_date 별도 처리
    if (category === 'exhibition' || category === 'performance') {
      if (metadata.venue) {
        workData.venue = metadata.venue;
        delete metadata.venue;
      }
      if (metadata.start_date) {
        workData.start_date = metadata.start_date;
        delete metadata.start_date;
      }
      if (metadata.end_date) {
        workData.end_date = metadata.end_date;
        delete metadata.end_date;
      }
    }

    // 4. Works 테이블에 삽입
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

    const response: AutofillResponse = {
      success: true,
      work: {
        id: newWork.id,
        title: newWork.title,
        category: newWork.category,
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
    console.error('Autofill-new-work error:', error);
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