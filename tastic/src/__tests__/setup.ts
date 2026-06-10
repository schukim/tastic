// 모든 테스트 전에 실행되는 전역 설정
import { vi } from "vitest";

// React Native 모듈 mock (Node 환경에서 import되는 것 방지)
vi.mock("react-native", () => ({}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));
