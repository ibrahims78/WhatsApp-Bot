import { AppLayout } from "@/components/layout/app-layout";
import { useListSessions } from "@workspace/api-client-react";
import { useAppStore } from "@/store";
import { getTranslation } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Smartphone, Activity, BarChart3, Send } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export default function Dashboard() {
  const { data: sessions, isLoading } = useListSessions();
  const { language } = useAppStore();
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(language, key);

  const totalSessions = sessions?.length || 0;
  const connected = sessions?.filter(s => s.status === 'connected').length || 0;
  const disconnected = sessions?.filter(s => s.status === 'disconnected' || s.status === 'banned').length || 0;
  
  const totalSent = sessions?.reduce((acc, curr) => acc + (curr.totalMessagesSent || 0), 0) || 0;
  const totalReceived = sessions?.reduce((acc, curr) => acc + (curr.totalMessagesReceived || 0), 0) || 0;

  // Mock data for chart - in a real app this would come from an API
  const chartData = [
    { name: 'Mon', sent: 120, received: 98 },
    { name: 'Tue', sent: 230, received: 150 },
    { name: 'Wed', sent: 340, received: 210 },
    { name: 'Thu', sent: 290, received: 180 },
    { name: 'Fri', sent: 450, received: 320 },
    { name: 'Sat', sent: 180, received: 140 },
    { name: 'Sun', sent: 100, received: 80 },
  ];

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
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={35} />
                <Tooltip 
                  cursor={{fill: 'hsl(var(--muted)/0.5)'}}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                />
                <Bar dataKey="sent" name={t('dash_sent')} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="received" name={t('dash_received')} fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
