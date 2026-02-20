import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
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
      <Route path="/tools" component={Tools} />
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <AppContent />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
