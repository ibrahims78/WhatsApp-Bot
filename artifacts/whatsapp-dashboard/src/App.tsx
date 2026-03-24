import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { useAppStore } from "@/store";

// Pages
import Login from "@/pages/login";
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
  const { setAuth, clearAuth } = useAppStore();
  const { data: user, isError, isSuccess } = useGetMe({
    query: {
      retry: false
    }
  });

  useEffect(() => {
    if (isSuccess && user) {
      // Assuming token is managed by HTTP cookies in standard implementation,
      // we just store the user object to indicate authenticated state.
      setAuth("cookie-auth", user);
    }
    if (isError) {
      clearAuth();
    }
  }, [isSuccess, isError, user, setAuth, clearAuth]);

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={Dashboard} />
      <Route path="/sessions" component={Sessions} />
      <Route path="/sessions/:id" component={SessionDetail} />
      <Route path="/users" component={Users} />
      <Route path="/api-keys" component={ApiKeys} />
      <Route path="/send" component={SendMessage} />
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
        </AuthInit>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
