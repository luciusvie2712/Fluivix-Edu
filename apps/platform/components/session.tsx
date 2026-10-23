"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createApiClient } from "@fluivix/api-client";
export const api = createApiClient(
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, "") ??
    "http://localhost:4000",
);
api.use({
  onResponse({ request, response }) {
    if (
      response.status === 401 &&
      request.headers.has("Authorization") &&
      typeof window !== "undefined"
    )
      window.dispatchEvent(new Event("platform-session-expired"));
    return response;
  },
});
let pendingRefresh: Promise<string> | null = null;
function refreshToken() {
  pendingRefresh ??= api
    .POST("/api/v1/platform/auth/refresh", {
      headers: { "Content-Type": "application/json" },
    })
    .then((result) => result.data?.data.accessToken ?? "")
    .catch(() => "")
    .finally(() => {
      pendingRefresh = null;
    });
  return pendingRefresh;
}
type Session = {
  token: string;
  ready: boolean;
  accept: (token: string) => void;
  clear: () => void;
};
const Context = createContext<Session | null>(null);
export function PlatformProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
        },
      }),
  );
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const epoch = useRef(0);
  function clear() {
    epoch.current++;
    void queryClient.cancelQueries();
    queryClient.clear();
    setToken("");
  }
  useEffect(() => {
    window.addEventListener("platform-session-expired", clear);
    return () => window.removeEventListener("platform-session-expired", clear);
  });
  useEffect(() => {
    let active = true;
    const version = epoch.current;
    void refreshToken().then((value) => {
      if (active && epoch.current === version) {
        setToken(value);
        setReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!token) return;
    const timer = setTimeout(() => {
      const version = epoch.current;
      void refreshToken().then((value) => {
        if (epoch.current === version) {
          if (value) setToken(value);
          else clear();
        }
      });
    }, 4 * 60000);
    return () => clearTimeout(timer);
  }, [token]);
  return (
    <QueryClientProvider client={queryClient}>
      <Context.Provider
        value={{
          token,
          ready,
          clear,
          accept(value) {
            epoch.current++;
            queryClient.clear();
            setToken(value);
            setReady(true);
          },
        }}
      >
        {children}
      </Context.Provider>
    </QueryClientProvider>
  );
}
export function usePlatform() {
  const value = useContext(Context);
  if (!value) throw new Error("Platform provider missing");
  return value;
}
