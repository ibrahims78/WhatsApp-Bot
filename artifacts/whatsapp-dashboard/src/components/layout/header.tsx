import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Moon, Sun, Globe } from "lucide-react";
import { useAppStore } from "@/store";

export function Header() {
  const { theme, setTheme, language, setLanguage, user } = useAppStore();

  return (
    <header className="flex items-center justify-between px-4 md:px-6 py-4 glass border-b border-border/50 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <SidebarTrigger data-testid="button-sidebar-toggle" className="hover-elevate" />
      </div>
      
      <div className="flex items-center gap-2">
        <Button 
          variant="ghost" 
          size="icon" 
          className="rounded-full hover-elevate"
          onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
          title="Toggle Language"
        >
          <Globe className="w-5 h-5" />
          <span className="sr-only">Toggle Language</span>
        </Button>
        
        <Button 
          variant="ghost" 
          size="icon" 
          className="rounded-full hover-elevate"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title="Toggle Theme"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          <span className="sr-only">Toggle Theme</span>
        </Button>

        <div className="hidden sm:flex items-center gap-3 ms-2 ps-4 border-s border-border">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
            {user?.username?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-none">{user?.username}</span>
            <span className="text-xs text-muted-foreground capitalize">{user?.role}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
