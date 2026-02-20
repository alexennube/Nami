import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  MessageSquare,
  Pin,
  Brain,
  BookOpen,
  Heart,
  Zap,
  Bot,
  Network,
  Wrench,
  Settings,
  Pause,
  Square,
  Play,
  ChevronDown,
  ChevronRight,
  Waypoints,
  Cpu,
  DollarSign,
  FileText,
} from "lucide-react";
import { useState } from "react";
import type { EngineStatus, PinnedChat } from "@shared/schema";

export function AppSidebar() {
  const [location] = useLocation();
  const [chatsOpen, setChatsOpen] = useState(true);
  const [mindOpen, setMindOpen] = useState(false);
  const isMindPage = location === "/thoughts" || location === "/memory" || location === "/heartbeat" || location === "/skills" || location === "/engine-mind";

  const { data: engineStatus } = useQuery<EngineStatus>({
    queryKey: ["/api/engine/status"],
    refetchInterval: 3000,
  });

  const { data: pinnedChats } = useQuery<PinnedChat[]>({
    queryKey: ["/api/pinned-chats"],
    refetchInterval: 10000,
  });

  const unpinMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/pinned-chats/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pinned-chats"] });
    },
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/engine/start");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engine/status"] });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/engine/pause");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engine/status"] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/engine/stop");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engine/status"] });
    },
  });

  const state = engineStatus?.state || "stopped";
  const isRunning = state === "running";
  const isPaused = state === "paused";

  return (
    <Sidebar>
      <SidebarHeader className="p-4 pb-2">
        <Link href="/">
          <div className="flex items-center gap-3 cursor-pointer" data-testid="link-home">
            <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/20 border border-primary/30">
              <Cpu className="w-5 h-5 text-primary" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight">nami</span>
              <span className="text-[10px] text-muted-foreground leading-none">architect engine</span>
            </div>
          </div>
        </Link>

        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className={`w-2 h-2 rounded-full ${isRunning ? "bg-emerald-400 animate-pulse-glow" : isPaused ? "bg-amber-400" : "bg-muted-foreground/40"}`} />
            <span className={`font-semibold uppercase tracking-wider text-[10px] ${isRunning ? "text-emerald-400" : isPaused ? "text-amber-400" : "text-muted-foreground"}`} data-testid="text-engine-state">
              {state}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <Heart className="w-3 h-3" />
            <span data-testid="text-heartbeat-count">{engineStatus?.heartbeatCount || 0}</span>
            <span>idle {engineStatus?.idleCount || "0/0"}</span>
          </div>

          <div className="flex items-center gap-1 mt-1">
            {state === "stopped" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending}
                data-testid="button-engine-start"
              >
                <Play className="w-3 h-3 mr-1" />
                Start
              </Button>
            )}
            {isRunning && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => pauseMutation.mutate()}
                disabled={pauseMutation.isPending}
                data-testid="button-engine-pause"
              >
                <Pause className="w-3 h-3 mr-1" />
                Pause
              </Button>
            )}
            {isPaused && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending}
                data-testid="button-engine-resume"
              >
                <Play className="w-3 h-3 mr-1" />
                Resume
              </Button>
            )}
            {(isRunning || isPaused) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => stopMutation.mutate()}
                disabled={stopMutation.isPending}
                data-testid="button-engine-stop"
              >
                <Square className="w-3 h-3 mr-1" />
                Stop
              </Button>
            )}
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel
            className="cursor-pointer select-none flex items-center gap-1"
            onClick={() => setChatsOpen(!chatsOpen)}
            data-testid="button-toggle-chats"
          >
            <MessageSquare className="w-3 h-3" />
            <span>Chats</span>
            {chatsOpen ? <ChevronDown className="w-3 h-3 ml-auto" /> : <ChevronRight className="w-3 h-3 ml-auto" />}
          </SidebarGroupLabel>
          {chatsOpen && (
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild data-active={location === "/" || location === "/chat"} className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                    <Link href="/" data-testid="link-main-chat">
                      <span>Main Chat</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {pinnedChats && pinnedChats.length > 0 && pinnedChats.map((pin) => (
                  <SidebarMenuItem key={pin.id} className="group relative">
                    <SidebarMenuButton
                      asChild
                      className="text-sidebar-foreground/70 text-xs h-7"
                      data-testid={`link-pinned-chat-${pin.id}`}
                    >
                      <div title={pin.summary}>
                        <Pin className="w-3 h-3 shrink-0 text-primary/60" />
                        <span className="truncate" data-testid={`text-pin-title-${pin.id}`}>{pin.title}</span>
                      </div>
                    </SidebarMenuButton>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 text-muted-foreground"
                      onClick={() => unpinMutation.mutate(pin.id)}
                      data-testid={`button-unpin-${pin.id}`}
                    >
                      ×
                    </Button>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  data-active={isMindPage}
                  className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                  onClick={() => setMindOpen(!mindOpen)}
                  data-testid="button-toggle-mind"
                >
                  <Brain className="w-4 h-4" />
                  <span>Engine Mind</span>
                  {mindOpen ? <ChevronDown className="w-3 h-3 ml-auto" /> : <ChevronRight className="w-3 h-3 ml-auto" />}
                </SidebarMenuButton>
              </SidebarMenuItem>
              {(mindOpen || isMindPage) && (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={location === "/thoughts"} className="pl-8 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                      <Link href="/thoughts" data-testid="link-thoughts">
                        <Brain className="w-4 h-4" />
                        <span>Thoughts</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={location === "/memory"} className="pl-8 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                      <Link href="/memory" data-testid="link-memory">
                        <BookOpen className="w-4 h-4" />
                        <span>Memory</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={location === "/heartbeat"} className="pl-8 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                      <Link href="/heartbeat" data-testid="link-heartbeat">
                        <Heart className="w-4 h-4" />
                        <span>Heartbeat</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={location === "/skills"} className="pl-8 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                      <Link href="/skills" data-testid="link-skills">
                        <Zap className="w-4 h-4" />
                        <span>Skills</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={location === "/engine-mind"} className="pl-8 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                      <Link href="/engine-mind" data-testid="link-engine-mind">
                        <Waypoints className="w-4 h-4" />
                        <span>Senses</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={location === "/spawns"} className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                  <Link href="/spawns" data-testid="link-spawn">
                    <Bot className="w-4 h-4" />
                    <span>Spawn</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={location === "/swarms"} className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                  <Link href="/swarms" data-testid="link-swarm">
                    <Network className="w-4 h-4" />
                    <span>Swarm</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={location === "/tools"} className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                  <Link href="/tools" data-testid="link-tools">
                    <Wrench className="w-4 h-4" />
                    <span>Tools</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={location === "/docs"} className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                  <Link href="/docs" data-testid="link-docs">
                    <FileText className="w-4 h-4" />
                    <span>Docs</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={location === "/usage"} className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                  <Link href="/usage" data-testid="link-usage">
                    <DollarSign className="w-4 h-4" />
                    <span>Usage</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={location === "/settings"} className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                  <Link href="/settings" data-testid="link-settings">
                    <Settings className="w-4 h-4" />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="text-[10px] text-muted-foreground font-mono truncate" data-testid="text-current-model">
          {engineStatus?.currentModel || "openai/gpt-4o"}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
