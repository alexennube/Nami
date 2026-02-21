import { useState } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useNamiEvents } from "@/hooks/use-nami-events";
import NotFound from "@/pages/not-found";
import Chat from "@/pages/chat";
import Thoughts from "@/pages/thoughts";
import MemoryPage from "@/pages/memory";
import Heartbeat from "@/pages/heartbeat";
import Spawns from "@/pages/spawns";
import Swarms from "@/pages/swarms";
import Tools from "@/pages/tools";
import Activity from "@/pages/activity";
import SkillsPage from "@/pages/skills";
import Settings from "@/pages/settings";
import EngineMindPage from "@/pages/engine-mind";
import SwarmDetail from "@/pages/swarm-detail";
import UsagePage from "@/pages/usage";
import DocsPage from "@/pages/docs";
import LoginPage from "@/pages/login";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Chat} />
      <Route path="/chat" component={Chat} />
      <Route path="/thoughts" component={Thoughts} />
      <Route path="/memory" component={MemoryPage} />
      <Route path="/heartbeat" component={Heartbeat} />
      <Route path="/skills" component={SkillsPage} />
      <Route path="/engine-mind" component={EngineMindPage} />
      <Route path="/spawns" component={Spawns} />
      <Route path="/swarms" component={Swarms} />
      <Route path="/swarms/:id" component={SwarmDetail} />
      <Route path="/tools" component={Tools} />
      <Route path="/usage" component={UsagePage} />
      <Route path="/docs" component={DocsPage} />
      <Route path="/activity" component={Activity} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  useNamiEvents();

  const style = {
    "--sidebar-width": "14rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <main className="flex-1 overflow-auto">
            <Router />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AuthGate() {
  const [authKey, setAuthKey] = useState(0);
  const { data, isLoading } = useQuery<{ authenticated: boolean } | null>({
    queryKey: ["/api/auth/check", authKey],
    queryFn: async () => {
      const res = await fetch("/api/auth/check", { credentials: "include" });
      if (res.status === 401) return null;
      return res.json();
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "#00ff41", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (!data?.authenticated) {
    return <LoginPage onLogin={() => setAuthKey((k) => k + 1)} />;
  }

  return <AppContent />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <AuthGate />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
