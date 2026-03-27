import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { useEffect, useLayoutEffect } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { useAppStore } from "@/store";

// Pages
import Login from "@/pages/login";
import { ForceChangePassword } from "@/components/force-change-password";
import Dashboard from "@/pages/dashboard";
import Sessions from "@/pages/sessions/index";
import SessionDetail from "@/pages/sessions/detail";
import Users from "@/pages/users/index";
import ApiKeys from "@/pages/api-keys/index";
import SendMessage from "@/pages/send/index";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// A component that ensures global auth state is checked on load
function AuthInit({ children }: { children: React.ReactNode }) {
  const { setAuth, clearAuth, token } = useAppStore();
  const { data: user, isError, isSuccess } = useGetMe({
    query: {
      retry: false,
      enabled: !!(token && token !== "cookie-auth"),
    }
  });

  useEffect(() => {
    if (isSuccess && user && token && token !== "cookie-auth") {
      setAuth(token, user);
    }
    if (isError) {
      clearAuth();
    }
  }, [isSuccess, isError, user, setAuth, clearAuth, token]);

  return <>{children}</>;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const token = useAppStore((s) => s.token);
  const [, setLocation] = useLocation();

  useLayoutEffect(() => {
    if (!token || token === "cookie-auth") {
      setLocation("/login");
    }
  }, [token, setLocation]);

  if (!token || token === "cookie-auth") return null;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">{() => <ProtectedRoute component={Dashboard} />}</Route>
      <Route path="/sessions">{() => <ProtectedRoute component={Sessions} />}</Route>
      <Route path="/sessions/:id">{() => <ProtectedRoute component={SessionDetail} />}</Route>
      <Route path="/users">{() => <ProtectedRoute component={Users} />}</Route>
      <Route path="/api-keys">{() => <ProtectedRoute component={ApiKeys} />}</Route>
      <Route path="/send">{() => <ProtectedRoute component={SendMessage} />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthInit>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <ForceChangePassword />
        </AuthInit>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
