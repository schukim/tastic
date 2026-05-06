import "./global.css";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { useAuthStore } from "./src/stores/authStore";
import { useThemeStore } from "./src/stores/themeStore";
import { supabase } from "./src/services/supabase";
import "./src/i18n";

const MOCK_USER_ID = "11111111-1111-1111-1111-111111111111";

function AppContent() {
  const setUser = useAuthStore((s) => s.setUser);
  const setSession = useAuthStore((s) => s.setSession);
  const setLoading = useAuthStore((s) => s.setLoading);
  const initTheme = useThemeStore((s) => s.init);

  useEffect(() => {
    initTheme();
    initializeMockUser();
  }, [setUser, setSession, setLoading]);

  const initializeMockUser = async () => {
    try {
      console.log("Initializing mock user...");

      // 일단 로컬 상태부터 설정 (DB 에러와 무관하게 앱이 작동하도록)
      setUser({
        id: MOCK_USER_ID,
        nickname: "테스터",
        avatar_url: null,
        preferred_categories: [],
        language: "ko",
        created_at: new Date().toISOString(),
      });
      setSession({ user: { id: MOCK_USER_ID } } as never);

      console.log("Mock user state initialized with ID:", MOCK_USER_ID);

      // 백그라운드에서 DB 사용자 생성 시도 (실패해도 무시)
      try {
        const { data: existingUser, error: fetchError } = await supabase
          .from('users')
          .select('*')
          .eq('id', MOCK_USER_ID)
          .single();

        if (!existingUser && fetchError?.code === 'PGRST116') {
          console.log('Attempting to create mock user in users table...');
          const { data: newUser, error: createError } = await supabase
            .from('users')
            .insert({
              id: MOCK_USER_ID,
              nickname: '테스터',
              avatar_url: null,
              preferred_categories: [],
              language: 'ko'
            })
            .select()
            .single();

          if (createError) {
            console.log('User creation failed, but app will continue:', createError.message);
          } else {
            console.log('Mock user created successfully in DB:', newUser);
          }
        } else if (existingUser) {
          console.log('Mock user already exists in DB:', existingUser);
        }
      } catch (dbError) {
        console.log('DB user creation failed, but app will continue:', dbError);
      }
    } catch (error) {
      console.error('Error during initialization:', error);
      // 어떤 에러가 있어도 최소한 로컬 상태는 설정
      setUser({
        id: MOCK_USER_ID,
        nickname: "테스터",
        avatar_url: null,
        preferred_categories: [],
        language: "ko",
        created_at: new Date().toISOString(),
      });
      setSession({ user: { id: MOCK_USER_ID } } as never);
    } finally {
      setLoading(false);
    }
  };

  return <RootNavigator />;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <StatusBar style="auto" />
          <AppContent />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
