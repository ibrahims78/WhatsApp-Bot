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
import { Smartphone, RefreshCw, PowerOff, Settings, MessageSquare, Activity, BookOpen, Copy } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { useWebSocket, useQrEvent } from "@/hooks/use-websocket";

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
  
  // Live QR state — updated immediately from WebSocket
  const [liveQr, setLiveQr] = useState<string | null>(null);

  // Initialize WebSocket
  useWebSocket();

  // Listen for QR events directly from WebSocket
  useQrEvent(id, (qr) => {
    setLiveQr(qr);
  });

  const { data: session, isLoading } = useGetSession(id, {
    query: { refetchInterval: 2000 }
  });

  const isWaitingForQr = session?.status === 'connecting' || session?.status === 'notLogged';

  // Also poll QR via API as a fallback (every 3 seconds while connecting or waiting for scan)
  const { data: qrData } = useGetSessionQr(id, {
    query: {
      enabled: isWaitingForQr,
      refetchInterval: 3000,
      onSuccess: (data: any) => {
        if (data?.qr) setLiveQr(data.qr);
      },
    }
  });

  // Reset live QR when session disconnects or connects
  useEffect(() => {
    if (session?.status !== 'connecting' && session?.status !== 'notLogged') {
      setLiveQr(null);
    }
    // Also seed from API data if available
    if (qrData?.qr && !liveQr) {
      setLiveQr(qrData.qr);
    }
  }, [session?.status, qrData?.qr]);

  const { data: messages } = useGetSessionMessages(id, { limit: 50 }, { query: { enabled: !!session } });

  const connectMutation = useConnectSession({
    mutation: {
      onSuccess: () => {
        setLiveQr(null);
        queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(id) });
      },
      onError: () => toast({ variant: "destructive", title: t('error'), description: t('sd_connect_error') })
    }
  });

  const disconnectMutation = useDisconnectSession({
    mutation: {
      onSuccess: () => {
        setLiveQr(null);
        queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(id) });
      },
      onError: () => toast({ variant: "destructive", title: t('error'), description: t('sd_disconnect_error') })
    }
  });

  const updateWebhookMutation = useUpdateSessionWebhook({
    mutation: {
      onSuccess: () => toast({ title: t('success'), description: t('sd_webhook_updated') })
    }
  });

  const updateFeaturesMutation = useUpdateSessionFeatures({
    mutation: {
      onSuccess: () => toast({ title: t('success'), description: t('sd_features_updated') })
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
  if (!session) return <AppLayout><div className="p-8 text-center text-destructive">{t('sess_not_found')}</div></AppLayout>;

  const displayQr = liveQr || qrData?.qr || null;

  return (
    <AppLayout>
      <div className="space-y-6 animate-in fade-in duration-500">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-6 rounded-2xl shadow-sm border border-border">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Smartphone className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{session.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-muted-foreground font-mono text-sm">{session.phoneNumber || t('sess_no_number')}</span>
                <Badge variant={session.status === 'connected' ? 'default' : session.status === 'connecting' ? 'outline' : 'secondary'}>
                  {t(`sess_status_${session.status}` as any) || session.status}
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
            {(session.status === 'connected' || session.status === 'connecting' || session.status === 'notLogged') && (
              <Button variant="destructive" onClick={() => disconnectMutation.mutate({ id })} disabled={disconnectMutation.isPending} className="hover-elevate">
                <PowerOff className="w-4 h-4 me-2" />
                {t('sess_disconnect')}
              </Button>
            )}
          </div>
        </div>

        {/* QR Code Section */}
        {isWaitingForQr && (
          <Card className="glass-card border-primary/20 shadow-primary/5">
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Smartphone className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2">{t('sess_scan_qr')}</h3>
              <p className="text-muted-foreground mb-8 max-w-md">{t('sess_scan_desc')}</p>
              
              <div className="bg-white p-5 rounded-2xl shadow-xl inline-block">
                {displayQr ? (
                  displayQr.startsWith('data:') ? (
                    <img src={displayQr} alt="QR Code" className="w-64 h-64 object-contain" />
                  ) : (
                    <QRCodeSVG value={displayQr} size={256} />
                  )
                ) : (
                  <div className="w-64 h-64 flex flex-col items-center justify-center gap-4 bg-muted/10 rounded-xl">
                    <RefreshCw className="w-10 h-10 text-primary animate-spin" />
                    <p className="text-sm text-muted-foreground font-medium">{t('sess_qr_generating')}</p>
                  </div>
                )}
              </div>

              {displayQr && (
                <p className="mt-6 text-sm text-muted-foreground">
                  {t('sess_qr_refresh_hint')}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3 max-w-md mb-6">
            <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Activity className="w-4 h-4 me-2"/>
              {t('sd_overview')}
            </TabsTrigger>
            <TabsTrigger value="messages">
              <MessageSquare className="w-4 h-4 me-2"/>
              {t('sd_messages')}
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="w-4 h-4 me-2"/>
              {t('sd_settings')}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-lg">{t('sd_stats_title')}</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl text-center">
                    <p className="text-sm text-muted-foreground mb-1">{t('sd_total_sent')}</p>
                    <p className="text-3xl font-bold text-primary">{session.totalMessagesSent}</p>
                  </div>
                  <div className="p-4 bg-green-500/5 border border-green-500/10 rounded-xl text-center">
                    <p className="text-sm text-muted-foreground mb-1">{t('sd_total_received')}</p>
                    <p className="text-3xl font-bold text-green-500">{session.totalMessagesReceived}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-lg">{t('sd_session_info')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-muted-foreground text-sm">ID</span>
                    <span className="font-mono text-xs bg-muted px-2 py-1 rounded">{session.id}</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-muted-foreground text-sm">{t('sd_created')}</span>
                    <span className="text-sm">{new Date(session.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-muted-foreground text-sm">{t('sd_updated')}</span>
                    <span className="text-sm">{new Date(session.updatedAt).toLocaleDateString()}</span>
                  </div>
                  {session.phoneNumber && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-sm">{t('sd_phone')}</span>
                      <span className="font-mono text-sm">{session.phoneNumber}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="messages">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>{t('sd_messages')}</CardTitle>
                <CardDescription>{t('sd_messages_desc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {messages?.map(msg => (
                    <div
                      key={msg.id}
                      className={`flex flex-col p-4 rounded-xl max-w-[80%] ${
                        msg.direction === 'outbound'
                          ? 'bg-primary/10 ms-auto border border-primary/20'
                          : 'bg-muted border border-border me-auto'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2 gap-4">
                        <span className="font-semibold text-sm">
                          {msg.direction === 'outbound' ? `→ ${msg.toNumber}` : `← ${msg.fromNumber}`}
                        </span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(msg.timestamp), "dd/MM HH:mm")}
                        </span>
                      </div>
                      <p className="text-sm">{msg.content || `[${msg.messageType}]`}</p>
                    </div>
                  ))}
                  {(!messages || messages.length === 0) && (
                    <div className="text-center py-12 text-muted-foreground">
                      <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-30" />
                      <p>{t('sd_no_messages')}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>{t('sd_webhook_url')}</CardTitle>
                <CardDescription>{t('sd_webhook_desc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex gap-3">
                  <Input 
                    value={webhookUrl} 
                    onChange={(e) => setWebhookUrl(e.target.value)} 
                    placeholder="https://your-n8n.com/webhook/..."
                    className="bg-background"
                    dir="ltr"
                  />
                  <Button onClick={handleWebhookSave} disabled={updateWebhookMutation.isPending}>
                    {t('save')}
                  </Button>
                </div>

                {/* Webhook setup guide */}
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4">
                  <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                    <BookOpen className="w-4 h-4 flex-shrink-0" />
                    {t('sd_webhook_guide_title')}
                  </div>
                  <ol className="space-y-2">
                    {([
                      t('sd_webhook_guide_step1'),
                      t('sd_webhook_guide_step2'),
                      t('sd_webhook_guide_step3'),
                      t('sd_webhook_guide_step4'),
                      t('sd_webhook_guide_step5'),
                    ] as string[]).map((step, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                        <span className="text-muted-foreground">{step}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="text-xs text-muted-foreground border-t border-primary/10 pt-3">{t('sd_webhook_note')}</p>
                </div>

                {/* Payload preview */}
                <div>
                  <p className="text-sm font-semibold text-muted-foreground mb-2">{t('sd_webhook_payload')}</p>
                  <div className="relative group">
                    <pre className="bg-muted/80 border border-border rounded-lg p-4 text-xs font-mono overflow-x-auto leading-relaxed" dir="ltr">{`{
  "event": "message.received",
  "sessionId": "session_abc123",
  "data": {
    "type": "chat",
    "from": "966501234567@c.us",
    "to": "966509876543@c.us",
    "body": "Hello!",
    "timestamp": 1706000000,
    "mediaUrl": null,
    "fileName": null,
    "caption": null,
    "mimetype": null
  }
}`}</pre>
                    <button
                      onClick={() => { navigator.clipboard.writeText(`{"event":"message.received","sessionId":"session_abc123","data":{"type":"chat","from":"966501234567@c.us","to":"966509876543@c.us","body":"Hello!","timestamp":1706000000,"mediaUrl":null,"fileName":null,"caption":null,"mimetype":null}}`); toast({ title: t('copied') }); }}
                      className="absolute top-2 end-2 p-1.5 rounded-md bg-background border border-border opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
                    >
                      <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle>{t('sd_features')}</CardTitle>
                <CardDescription>{t('sd_features_desc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                  {featureList.map(feat => (
                    <div key={feat} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                      <Checkbox 
                        id={feat} 
                        checked={features[feat] || false}
                        onCheckedChange={(checked) => handleFeatureToggle(feat, checked as boolean)}
                      />
                      <label htmlFor={feat} className="text-sm font-medium leading-none cursor-pointer capitalize">
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
