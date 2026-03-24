import { AppLayout } from "@/components/layout/app-layout";
import { useRoute } from "wouter";
import { 
  useGetSession, 
  useGetSessionQr, 
  useConnectSession, 
  useDisconnectSession,
  getGetSessionQueryKey,
  useGetSessionMessages,
  useUpdateSessionWebhook,
  useUpdateSessionFeatures
} from "@workspace/api-client-react";
import { useAppStore } from "@/store";
import { getTranslation } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { QRCodeSVG } from "qrcode.react";
import { Smartphone, RefreshCw, PowerOff, Settings, MessageSquare, Activity, Send } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { useWebSocket } from "@/hooks/use-websocket";

const featureList = [
  'sendText', 'sendImage', 'sendVideo', 'sendAudio', 'sendFile',
  'receiveText', 'receiveImage', 'receiveVideo', 'receiveAudio', 'receiveFile'
];

export default function SessionDetail() {
  const [, params] = useRoute("/sessions/:id");
  const id = params?.id || "";
  const { language } = useAppStore();
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(language, key);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Initialize WebSocket connection to listen for real-time updates for this session
  useWebSocket();

  const { data: session, isLoading } = useGetSession(id);
  const { data: qrData } = useGetSessionQr(id, { query: { enabled: session?.status === 'connecting' } });
  const { data: messages } = useGetSessionMessages(id, { limit: 50 }, { query: { enabled: !!session } });

  const connectMutation = useConnectSession({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(id) }),
      onError: (e) => toast({ variant: "destructive", title: t('error'), description: "Failed to connect" })
    }
  });

  const disconnectMutation = useDisconnectSession({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(id) }),
      onError: (e) => toast({ variant: "destructive", title: t('error'), description: "Failed to disconnect" })
    }
  });

  const updateWebhookMutation = useUpdateSessionWebhook({
    mutation: {
      onSuccess: () => toast({ title: t('success'), description: "Webhook updated" })
    }
  });

  const updateFeaturesMutation = useUpdateSessionFeatures({
    mutation: {
      onSuccess: () => toast({ title: t('success'), description: "Features updated" })
    }
  });

  const [webhookUrl, setWebhookUrl] = useState("");
  const [features, setFeatures] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (session) {
      setWebhookUrl(session.webhookUrl || "");
      try {
        if (session.features) setFeatures(JSON.parse(session.features));
      } catch (e) {}
    }
  }, [session]);

  const handleWebhookSave = () => {
    updateWebhookMutation.mutate({ id, data: { webhookUrl } });
  };

  const handleFeatureToggle = (feat: string, checked: boolean) => {
    const newFeatures = { ...features, [feat]: checked };
    setFeatures(newFeatures);
    updateFeaturesMutation.mutate({ id, data: { features: JSON.stringify(newFeatures) } });
  };

  if (isLoading) return <AppLayout><div className="p-8 text-center">{t('loading')}</div></AppLayout>;
  if (!session) return <AppLayout><div className="p-8 text-center text-destructive">Session not found</div></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-6 rounded-2xl shadow-sm border border-border">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Smartphone className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{session.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-muted-foreground font-mono">{session.phoneNumber || 'No Number Linked'}</span>
                <Badge variant={session.status === 'connected' ? 'default' : 'secondary'} className="capitalize">
                  {session.status}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {session.status === 'disconnected' && (
              <Button onClick={() => connectMutation.mutate({ id })} disabled={connectMutation.isPending} className="hover-elevate">
                <RefreshCw className={`w-4 h-4 me-2 ${connectMutation.isPending ? 'animate-spin' : ''}`} />
                {t('sess_connect')}
              </Button>
            )}
            {(session.status === 'connected' || session.status === 'connecting') && (
              <Button variant="destructive" onClick={() => disconnectMutation.mutate({ id })} disabled={disconnectMutation.isPending} className="hover-elevate">
                <PowerOff className="w-4 h-4 me-2" />
                {t('sess_disconnect')}
              </Button>
            )}
          </div>
        </div>

        {session.status === 'connecting' && (
          <Card className="glass-card border-primary/20 shadow-primary/5">
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <h3 className="text-xl font-bold mb-2">{t('sess_scan_qr')}</h3>
              <p className="text-muted-foreground mb-8 max-w-md">{t('sess_scan_desc')}</p>
              
              <div className="bg-white p-4 rounded-xl shadow-lg inline-block">
                {qrData?.qr ? (
                  qrData.qr.startsWith('http') || qrData.qr.startsWith('data:') ? 
                    <img src={qrData.qr} alt="QR Code" className="w-64 h-64" /> :
                    <QRCodeSVG value={qrData.qr} size={256} />
                ) : (
                  <div className="w-64 h-64 flex items-center justify-center bg-muted/30 rounded-lg animate-pulse">
                    <RefreshCw className="w-8 h-8 text-muted-foreground animate-spin" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3 max-w-md mb-6">
            <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Activity className="w-4 h-4 me-2"/> {t('sd_overview')}</TabsTrigger>
            <TabsTrigger value="messages"><MessageSquare className="w-4 h-4 me-2"/> {t('sd_messages')}</TabsTrigger>
            <TabsTrigger value="settings"><Settings className="w-4 h-4 me-2"/> {t('sd_settings')}</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-lg">Message Statistics</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-muted/30 rounded-xl">
                    <p className="text-sm text-muted-foreground mb-1">Total Sent</p>
                    <p className="text-3xl font-bold text-primary">{session.totalMessagesSent}</p>
                  </div>
                  <div className="p-4 bg-muted/30 rounded-xl">
                    <p className="text-sm text-muted-foreground mb-1">Total Received</p>
                    <p className="text-3xl font-bold text-accent">{session.totalMessagesReceived}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-lg">Session Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-muted-foreground">ID</span>
                    <span className="font-mono text-sm">{session.id}</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-muted-foreground">Created</span>
                    <span className="text-sm">{new Date(session.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-muted-foreground">Last Updated</span>
                    <span className="text-sm">{new Date(session.updatedAt).toLocaleDateString()}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="messages">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Recent Messages</CardTitle>
                <CardDescription>Last 50 messages for this session</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {messages?.map(msg => (
                    <div key={msg.id} className={`flex flex-col p-4 rounded-xl max-w-[80%] ${msg.direction === 'outbound' ? 'bg-primary/10 ml-auto border border-primary/20' : 'bg-muted border border-border mr-auto'}`}>
                      <div className="flex justify-between items-start mb-2 gap-4">
                        <span className="font-semibold text-sm">
                          {msg.direction === 'outbound' ? 'To: ' + msg.toNumber : 'From: ' + msg.fromNumber}
                        </span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(msg.timestamp), "MMM d, HH:mm")}
                        </span>
                      </div>
                      <p className="text-sm">{msg.content || `[${msg.messageType}]`}</p>
                    </div>
                  ))}
                  {(!messages || messages.length === 0) && (
                    <div className="text-center py-8 text-muted-foreground">No messages yet.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>{t('sd_webhook_url')}</CardTitle>
                <CardDescription>Send incoming messages and events to your n8n workflow</CardDescription>
              </CardHeader>
              <CardContent className="flex gap-4">
                <Input 
                  value={webhookUrl} 
                  onChange={(e) => setWebhookUrl(e.target.value)} 
                  placeholder="https://your-n8n-instance.com/webhook/..."
                  className="bg-background"
                />
                <Button onClick={handleWebhookSave} disabled={updateWebhookMutation.isPending}>
                  {t('save')}
                </Button>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle>{t('sd_features')}</CardTitle>
                <CardDescription>Enable or disable specific features for this bot</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  {featureList.map(feat => (
                    <div key={feat} className="flex items-center space-x-3 rtl:space-x-reverse">
                      <Checkbox 
                        id={feat} 
                        checked={features[feat] || false}
                        onCheckedChange={(checked) => handleFeatureToggle(feat, checked as boolean)}
                      />
                      <label htmlFor={feat} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 capitalize">
                        {feat.replace(/([A-Z])/g, ' $1').trim()}
                      </label>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
