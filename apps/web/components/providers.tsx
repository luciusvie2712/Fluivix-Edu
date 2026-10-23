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
import {
  getMe,
  refresh,
  setAccessToken,
  type Me,
  type Role,
  switchContext,
  login,
  logout,
} from "../lib/api";
type Session = {
  me: Me | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  select: (tenantId: string, role: Role) => Promise<void>;
  signOut: () => Promise<void>;
  clear: () => void;
};
const Context = createContext<Session | null>(null);
export function Providers({ children }: { children: ReactNode }) {
  const [cache] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: 0,
            gcTime: 0,
            refetchOnWindowFocus: true,
          },
          mutations: { retry: false },
        },
      }),
  );
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const epoch = useRef(0);
  useEffect(() => {
    let active = true;
    const revision = epoch.current;
    void refresh()
      .then(async (result) => {
        if (!active || epoch.current !== revision) return;
        setAccessToken(result.data.accessToken);
        const identity = await getMe();
        if (active && epoch.current === revision) setMe(identity.data);
      })
      .catch(() => {
        if (active && epoch.current === revision) {
          setAccessToken(null);
          setMe(null);
        }
      })
      .finally(() => {
        if (active && epoch.current === revision) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const expired = () => {
      epoch.current++;
      setAccessToken(null);
      setMe(null);
      setReady(true);
      cache.clear();
    };
    window.addEventListener("fluivix-session-expired", expired);
    return () => window.removeEventListener("fluivix-session-expired", expired);
  }, [cache]);
  function clear() {
    epoch.current++;
    setAccessToken(null);
    setMe(null);
    cache.clear();
  }
  async function signIn(email: string, password: string) {
    clear();
    const result = await login({ email, password });
    setAccessToken(result.data.accessToken);
    const identity = await getMe();
    setMe(identity.data);
    setReady(true);
  }
  async function select(tenantId: string, role: Role) {
    const revision = ++epoch.current;
    setReady(false);
    setMe(null);
    await cache.cancelQueries();
    cache.clear();
    try {
      const result = await switchContext({ tenantId, role });
      if (revision !== epoch.current) return;
      setAccessToken(result.data.accessToken);
      const identity = await getMe();
      if (revision === epoch.current) setMe(identity.data);
    } finally {
      if (revision === epoch.current) setReady(true);
    }
  }
  async function signOut() {
    try {
      await logout();
    } finally {
      clear();
    }
  }
  return (
    <QueryClientProvider client={cache}>
      <Context.Provider value={{ me, ready, signIn, select, signOut, clear }}>
        {children}
      </Context.Provider>
    </QueryClientProvider>
  );
}
export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing session provider");
  return value;
}
