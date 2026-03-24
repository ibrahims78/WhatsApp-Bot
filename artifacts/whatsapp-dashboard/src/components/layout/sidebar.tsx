import { MessageSquare, LayoutDashboard, Users, Key, Send, LogOut } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAppStore } from "@/store";
import { getTranslation } from "@/lib/i18n";
import { Link, useLocation } from "wouter";
import { useLogout } from "@workspace/api-client-react";

export function AppSidebar() {
  const { language, user, clearAuth } = useAppStore();
  const [location] = useLocation();
  const logoutMutation = useLogout();
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(language, key);

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        clearAuth();
      }
    });
  };

  const menuItems = [
    { title: t('nav_dashboard'), url: "/", icon: LayoutDashboard, show: true },
    { title: t('nav_sessions'), url: "/sessions", icon: MessageSquare, show: true },
    { title: t('nav_send_message'), url: "/send", icon: Send, show: true },
    { title: t('nav_users'), url: "/users", icon: Users, show: user?.role === 'admin' },
    { title: t('nav_api_keys'), url: "/api-keys", icon: Key, show: true },
  ];

  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar glass">
      <SidebarContent>
        <div className="p-4 md:p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-lg shadow-primary/25">
            <MessageSquare className="w-5 h-5 text-primary-foreground" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-sidebar-foreground">
            {t('app_name')}
          </h2>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider px-6">
            Menu
          </SidebarGroupLabel>
          <SidebarGroupContent className="px-3 mt-2">
            <SidebarMenu>
              {menuItems.filter(item => item.show).map((item) => {
                const isActive = location === item.url || (item.url !== '/' && location.startsWith(item.url));
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild data-active={isActive} className="data-[active=true]:bg-primary/10 data-[active=true]:text-primary transition-all rounded-xl hover-elevate">
                      <Link href={item.url} className="flex items-center gap-3 py-3">
                        <item.icon className="w-5 h-5" />
                        <span className="font-medium">{item.title}</span>
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
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton 
              onClick={handleLogout} 
              className="text-destructive hover:text-destructive hover:bg-destructive/10 transition-colors rounded-xl"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">{t('nav_logout')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
