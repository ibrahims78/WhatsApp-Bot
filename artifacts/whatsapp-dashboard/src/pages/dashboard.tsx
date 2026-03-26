import { AppLayout } from "@/components/layout/app-layout";
import { useAppStore } from "@/store";
import { getTranslation } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Smartphone, Activity, BarChart3, Send } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useQuery } from "@tanstack/react-query";

interface DashboardStats {
  totalSessions: number;
  connected: number;
  totalSent: number;
  totalReceived: number;
  chartData: { date: string; sent: number; received: number }[];
}

async function fetchDashboardStats(token: string | null): Promise<DashboardStats> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch("/api/dashboard/stats", { headers });
  if (!res.ok) throw new Error("Failed to fetch dashboard stats");
  return res.json();
}

function formatDateLabel(dateStr: string, language: string): string {
  const date = new Date(dateStr + "T12:00:00Z");
  const dayNames: Record<string, string[]> = {
    en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    ar: ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"],
  };
  const names = dayNames[language] ?? dayNames["en"];
  return names[date.getUTCDay()];
}

export default function Dashboard() {
  const { language, token } = useAppStore();
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(language, key);

  const { data, isLoading } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: () => fetchDashboardStats(token),
    refetchInterval: 30_000,
  });

  const totalSessions = data?.totalSessions ?? 0;
  const connected = data?.connected ?? 0;
  const totalSent = data?.totalSent ?? 0;
  const totalReceived = data?.totalReceived ?? 0;

  const chartData = (data?.chartData ?? []).map((row) => ({
    name: formatDateLabel(row.date, language),
    sent: row.sent,
    received: row.received,
  }));

  return (
    <AppLayout>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t('nav_dashboard')}</h1>
          <p className="text-muted-foreground mt-2 font-medium">{t('dash_subtitle')}</p>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:gap-6 grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <Card key={i} className="h-28 animate-pulse bg-card/50" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:gap-6 grid-cols-2 lg:grid-cols-4">
            <Card className="glass-card hover:-translate-y-1 transition-transform duration-300">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs sm:text-sm font-semibold">{t('dash_total_sessions')}</CardTitle>
                <Smartphone className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground shrink-0" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl sm:text-3xl font-bold">{totalSessions}</div>
              </CardContent>
            </Card>

            <Card className="glass-card border-s-4 border-s-green-500 hover:-translate-y-1 transition-transform duration-300">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs sm:text-sm font-semibold">{t('dash_connected')}</CardTitle>
                <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 shrink-0" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl sm:text-3xl font-bold text-green-500">{connected}</div>
              </CardContent>
            </Card>

            <Card className="glass-card hover:-translate-y-1 transition-transform duration-300">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs sm:text-sm font-semibold">{t('dash_sent')}</CardTitle>
                <Send className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl sm:text-3xl font-bold text-primary">{totalSent}</div>
              </CardContent>
            </Card>

            <Card className="glass-card hover:-translate-y-1 transition-transform duration-300">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs sm:text-sm font-semibold">{t('dash_received')}</CardTitle>
                <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5 text-accent shrink-0" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl sm:text-3xl font-bold text-accent">{totalReceived}</div>
              </CardContent>
            </Card>
          </div>
        )}

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
              {t('dash_message_volume')}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[280px] sm:h-[380px]">
            {isLoading ? (
              <div className="h-full animate-pulse bg-muted/40 rounded-lg" />
            ) : chartData.length === 0 || chartData.every(d => d.sent === 0 && d.received === 0) ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                {language === "ar" ? "لا توجد رسائل في آخر 7 أيام" : "No messages in the last 7 days"}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={35} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted)/0.5)' }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  />
                  <Bar dataKey="sent" name={t('dash_sent')} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="received" name={t('dash_received')} fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
