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
import type { Me, Role } from "../lib/api";
import { BrowserSession } from "../lib/browser-session";
import { Button } from "./ui/button";
type Session = {
  me: Me | null;
  ready: boolean;
  refreshProfile: () => Promise<void>;
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
  const [state, setState] = useState<{
    me: Me | null;
    ready: boolean;
    notice: string;
  }>({ me: null, ready: false, notice: "" });
  const session = useRef<BrowserSession | null>(null);
  useEffect(() => {
    const controller = new BrowserSession({
      clear: async () => {
        await cache.cancelQueries();
        cache.clear();
      },
      update: (me, ready, notice) => setState({ me, ready, notice }),
      navigate: (path) => {
        window.location.replace(path);
      },
    });
    session.current = controller;
    void controller.start();
    return () => {
      session.current = null;
      controller.destroy();
    };
  }, [cache]);
  const current = () => {
    if (!session.current) throw new Error("Đang xác minh phiên đăng nhập.");
    return session.current;
  };
  return (
    <QueryClientProvider client={cache}>
      <Context.Provider
        value={{
          me: state.me,
          ready: state.ready,
          refreshProfile: () => current().refreshProfile(),
          signIn: (email, password) => current().signIn(email, password),
          select: (tenantId, role) => current().select(tenantId, role),
          signOut: () => current().signOut(),
          clear: () => current().clear(),
        }}
      >
        {state.notice && (
          <section
            className="notice session-notice"
            aria-label="Trạng thái phiên đăng nhập"
          >
            <p role="alert">{state.notice}</p>
            <Button
              variant="outline"
              disabled={!state.ready}
              onClick={() => void current().retry()}
            >
              {state.ready ? "Thử lại phiên đăng nhập" : "Đang xác minh phiên…"}
            </Button>
          </section>
        )}
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
