import { useEffect } from "react";
import { getIntroSeen } from "../utils/storage";
import { useIntroStore } from "../stores/introStore";

// 앱 부팅 시 기기 로컬의 인트로 노출 여부를 한 번 읽어 introStore 에 반영한다.
// 읽기 실패(스토리지 이상)는 seen=true 로 처리해 인트로가 무한 노출되지 않게 한다.
export function useIntroGate() {
  const setSeen = useIntroStore((s) => s.setSeen);

  useEffect(() => {
    getIntroSeen()
      .then(setSeen)
      .catch(() => setSeen(true));
  }, [setSeen]);
}
