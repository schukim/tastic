-- 공연/전시 카테고리 제거 — 최종 카테고리: movie, music, book, art

ALTER TABLE public.contents
  DROP CONSTRAINT IF EXISTS contents_category_check,
  ADD CONSTRAINT contents_category_check
    CHECK (category IN ('movie', 'music', 'book', 'art'));
