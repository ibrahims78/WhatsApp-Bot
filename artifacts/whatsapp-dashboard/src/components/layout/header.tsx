import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Moon, Sun, Globe, LogOut, User, ShieldCheck, Mail, CalendarDays, ChevronDown } from "lucide-react";
import { useAppStore } from "@/store";
import { useLocation } from "wouter";

export function Header() {
  const { theme, setTheme, language, setLanguage, user, clearAuth } = useAppStore();
  const isRtl = language === "ar";
  const [, navigate] = useLocation();

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "U";

  const roleLabel = isRtl
    ? user?.role === "admin" ? "مدير" : "موظف"
    : user?.role === "admin" ? "Administrator" : "Employee";

  const roleColor =
    user?.role === "admin"
      ? "text-amber-500"
      : "text-blue-500";

  const joinedDate = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(
        isRtl ? "ar-SA" : "en-US",
        { year: "numeric", month: "long", day: "numeric" }
      )
    : null;

  function handleLogout() {
    clearAuth();
    navigate("/login");
  }

  return (
    <header className="flex items-center justify-between px-4 md:px-6 py-3 glass border-b border-border/50 sticky top-0 z-30 shrink-0">
      <div className="flex items-center gap-4">
        <SidebarTrigger data-testid="button-sidebar-toggle" className="hover-elevate" />
      </div>

      <div className="flex items-center gap-1">
        {/* Language toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full hover-elevate shrink-0"
          onClick={() => setLanguage(language === "en" ? "ar" : "en")}
          title={language === "ar" ? "English" : "عربي"}
        >
          <Globe className="w-5 h-5" />
          <span className="sr-only">Toggle Language</span>
        </Button>

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full hover-elevate shrink-0"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title="Toggle Theme"
        >
          {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          <span className="sr-only">Toggle Theme</span>
        </Button>

        {/* User dropdown */}
        <div className="ms-1 ps-3 border-s border-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-2 px-2 py-1.5 h-auto rounded-xl hover:bg-accent/50 transition-colors"
              >
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-primary/15 text-primary font-bold text-sm">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:flex flex-col items-start min-w-0">
                  <span className="text-sm font-semibold leading-tight truncate max-w-[120px]">
                    {user?.username}
                  </span>
                  <span className={`text-xs leading-tight font-medium ${roleColor}`}>
                    {roleLabel}
                  </span>
                </div>
                <ChevronDown className="hidden sm:block w-3.5 h-3.5 text-muted-foreground shrink-0" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align={isRtl ? "start" : "end"}
              sideOffset={8}
              className="w-72"
            >
              {/* User profile header */}
              <DropdownMenuLabel className="p-0">
                <div className="flex items-center gap-3 p-4">
                  <Avatar className="w-12 h-12 shrink-0">
                    <AvatarFallback className="bg-primary/15 text-primary font-bold text-lg">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                    <span className="text-base font-bold leading-tight truncate">
                      {user?.username}
                    </span>
                    {user?.email && (
                      <span className="text-xs text-muted-foreground truncate mt-0.5">
                        {user.email}
                      </span>
                    )}
                    <span className={`text-xs font-semibold mt-1 ${roleColor}`}>
                      {roleLabel}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              {/* Info rows */}
              <div className="px-2 py-1 space-y-0.5">
                <div className="flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-muted-foreground">
                  <User className="w-4 h-4 shrink-0 text-primary/70" />
                  <span className="truncate">
                    {isRtl ? "اسم المستخدم: " : "Username: "}
                    <span className="font-medium text-foreground">{user?.username}</span>
                  </span>
                </div>

                {user?.email && (
                  <div className="flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-muted-foreground">
                    <Mail className="w-4 h-4 shrink-0 text-primary/70" />
                    <span className="truncate">
                      <span className="font-medium text-foreground">{user.email}</span>
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-muted-foreground">
                  <ShieldCheck className={`w-4 h-4 shrink-0 ${roleColor}`} />
                  <span>
                    {isRtl ? "الصلاحية: " : "Role: "}
                    <span className={`font-semibold ${roleColor}`}>{roleLabel}</span>
                  </span>
                </div>

                {joinedDate && (
                  <div className="flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-muted-foreground">
                    <CalendarDays className="w-4 h-4 shrink-0 text-primary/70" />
                    <span className="truncate">
                      {isRtl ? "تاريخ الانضمام: " : "Joined: "}
                      <span className="font-medium text-foreground">{joinedDate}</span>
                    </span>
                  </div>
                )}
              </div>

              <DropdownMenuSeparator />

              {/* Logout */}
              <div className="p-2">
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-500 focus:text-red-500 focus:bg-red-500/10 cursor-pointer font-medium"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  {isRtl ? "تسجيل الخروج" : "Sign Out"}
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
