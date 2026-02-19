import { useLocation, Link } from "wouter";
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
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  Network,
  Settings,
  Activity,
  Zap,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { SystemStats } from "@shared/schema";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Chat", url: "/chat", icon: MessageSquare },
  { title: "Spawns", url: "/spawns", icon: Bot },
  { title: "Swarms", url: "/swarms", icon: Network },
  { title: "Activity", url: "/activity", icon: Activity },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { data: stats } = useQuery<SystemStats>({ queryKey: ["/api/stats"] });

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer" data-testid="link-home">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight">Nami</span>
              <span className="text-[10px] text-muted-foreground leading-none">AgentNami.com</span>
            </div>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location === item.url || (item.url !== "/" && location.startsWith(item.url));
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild data-active={isActive} className="data-[active=true]:bg-sidebar-accent">
                      <Link href={item.url} data-testid={`link-${item.title.toLowerCase()}`}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                        {item.title === "Spawns" && stats && stats.activeAgents > 0 && (
                          <Badge variant="secondary" className="ml-auto text-[10px]">
                            {stats.activeAgents}
                          </Badge>
                        )}
                        {item.title === "Swarms" && stats && stats.activeSwarms > 0 && (
                          <Badge variant="secondary" className="ml-auto text-[10px]">
                            {stats.activeSwarms}
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          <div className="flex items-center justify-between gap-2">
            <span>Tokens used</span>
            <span className="font-mono">{stats ? stats.totalTokensUsed.toLocaleString() : "0"}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Messages</span>
            <span className="font-mono">{stats ? stats.totalMessagesProcessed.toLocaleString() : "0"}</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
