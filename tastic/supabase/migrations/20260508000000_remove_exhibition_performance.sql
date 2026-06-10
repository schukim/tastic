-- 공연/전시 카테고리 제거 — 최종 카테고리: movie, music, book, art
-- NOT VALID: 레거시 contents에 exhibition/performance 행이 남아 있어도 적용 가능 (신규 쓰기만 검사)

ALTER TABLE public.contents
  DROP CONSTRAINT IF EXISTS contents_category_check;

ALTER TABLE public.contents
  ADD CONSTRAINT contents_category_check
    CHECK (category IN ('movie', 'music', 'book', 'art')) NOT VALID;
