import React from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "./ConfirmDialog";
import { useGuestStore } from "../../stores/guestStore";

interface GuestSignInDialogProps {
  visible: boolean;
  title: string;
  message: string;
  // 어느 인증 화면으로 보낼지. 체험 평론을 지키려는 맥락(저장·체험 소진)은 회원가입.
  target?: "login" | "signUp";
  onClose: () => void;
}

/**
 * 게스트에게 계정 생성을 유도하는 확인 모달.
 *
 * 버튼을 누르면 isGuest 를 내려 RootNavigator 가 Auth 스택으로 전환한다.
 * 보관 중인 평론은 AsyncStorage 에 있으므로 이 전환으로 유실되지 않고,
 * **새 계정 가입이 완료되면** useAuth 가 그 계정으로 이전한다.
 */
export function GuestSignInDialog({
  visible,
  title,
  message,
  target = "signUp",
  onClose,
}: GuestSignInDialogProps) {
  const { t } = useTranslation();
  const exitGuestToAuth = useGuestStore((s) => s.exitGuestToAuth);

  return (
    <ConfirmDialog
      visible={visible}
      title={title}
      message={message}
      actions={[
        {
          label: target === "signUp" ? t("guest.signUp") : t("guest.signIn"),
          onPress: () => {
            onClose();
            exitGuestToAuth(target);
          },
          variant: "primary",
        },
        { label: t("guest.later"), onPress: onClose },
      ]}
      onClose={onClose}
    />
  );
}
