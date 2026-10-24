import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import NetInfo from "@react-native-community/netinfo";
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import { NativeSession, type Me } from "./session-client";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 0, gcTime: 0 },
    mutations: { retry: false },
  },
});
const credentialKey = "fluivixedu.native.refresh.v1";
const apiUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
function useSessionState() {
  const [me, setMe] = useState<Me | null>(null);
  const [child, setChild] = useState<{ id: string; fullName: string } | null>(
    null,
  );
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(true);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState("");
  const client = useMemo(
    () =>
      new NativeSession(
        apiUrl,
        {
          get: () => SecureStore.getItemAsync(credentialKey),
          set: (value) =>
            SecureStore.setItemAsync(credentialKey, value, {
              keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
            }),
          remove: () => SecureStore.deleteItemAsync(credentialKey),
        },
        () => {
          queryClient.clear();
          setChild(null);
        },
        () => setMe(null),
        undefined,
        () =>
          setError(
            "Quyền truy cập đã thay đổi hoặc nội dung không còn khả dụng. Vui lòng kiểm tra lại ngữ cảnh.",
          ),
      ),
    [],
  );
  async function restore() {
    client.invalidate();
    setReady(false);
    setError("");
    try {
      setMe(await client.restore());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể kết nối.");
    } finally {
      setReady(true);
    }
  }
  useEffect(() => {
    void restore();
    return NetInfo.addEventListener((state) => {
      const connected =
        state.isConnected !== false && state.isInternetReachable !== false;
      setOnline(connected);
      onlineManager.setOnline(connected);
    });
    // Client is stable for the app lifetime.
    // eslint hooks plugin is not used by this repository.
  }, [client]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      setVisible(false);
      queryClient.clear();
      if (state === "active") {
        void (async () => {
          try {
            const current = await client.me();
            if (child) {
              const result = await client.api.GET(
                "/api/v1/mobile/guardian/students/{id}/profile",
                { params: { path: { id: child.id } } },
              );
              if (!result.data) {
                setChild(null);
                throw new Error("Liên kết học viên không còn khả dụng.");
              }
            }
            setMe(current);
            setError("");
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Vui lòng kiểm tra kết nối.",
            );
          } finally {
            setVisible(true);
          }
        })();
      }
    });
    return () => sub.remove();
  }, [client, child]);
  useEffect(() => {
    if (!child || me?.activeRole !== "guardian" || !visible) return;
    const timer = setInterval(() => {
      void client.api
        .GET("/api/v1/mobile/guardian/students/{id}/profile", {
          params: { path: { id: child.id } },
        })
        .catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [client, child, me?.activeRole, visible]);
  const activeTenant = me?.memberships.find(
    (m) => m.tenant.id === me.activeTenantId,
  )?.tenant;
  return {
    client,
    me,
    setMe,
    child,
    ready,
    visible,
    online,
    error,
    setError,
    restore,
    activeTenant,
    canWrite:
      !!activeTenant &&
      ["ACTIVE", "PAST_DUE_GRACE"].includes(activeTenant.status),
    selectChild(next: { id: string; fullName: string }) {
      client.invalidate();
      setChild(next);
    },
    clearChild() {
      client.invalidate();
      setChild(null);
    },
    scope: [me?.id, me?.activeTenantId, me?.activeRole, child?.id] as const,
  };
}
type SessionState = ReturnType<typeof useSessionState>;
const Context = createContext<SessionState | null>(null);
export function SessionProvider({ children }: PropsWithChildren) {
  const state = useSessionState();
  return (
    <QueryClientProvider client={queryClient}>
      <Context.Provider value={state}>{children}</Context.Provider>
    </QueryClientProvider>
  );
}
export function useSession() {
  const state = useContext(Context);
  if (!state) throw new Error("SessionProvider required");
  return state;
}
