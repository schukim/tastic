// Supabase 클라이언트 mock
// 테스트에서 실제 DB 연결 없이 응답을 시뮬레이션합니다.
import { vi } from "vitest";

// functions.invoke mock (claude.ts용)
export const mockInvoke = vi.fn();

// from().insert/select/update/delete 체이닝 mock (review.ts용)
export const mockSingle = vi.fn();
export const mockSelect = vi.fn();
export const mockInsert = vi.fn();
export const mockUpdate = vi.fn();
export const mockDelete = vi.fn();
export const mockEq = vi.fn();
export const mockGte = vi.fn();
export const mockLte = vi.fn();
export const mockOrder = vi.fn();

// 체인을 반환하도록 연결
const buildChain = () => {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.delete = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.gte = vi.fn(() => chain);
  chain.lte = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.single = mockSingle;
  return chain;
};

export const mockFrom = vi.fn(() => buildChain());

vi.mock("../../services/supabase", () => ({
  supabase: {
    functions: {
      invoke: mockInvoke,
    },
    from: mockFrom,
  },
}));
