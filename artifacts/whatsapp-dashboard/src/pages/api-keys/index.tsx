import { AppLayout } from "@/components/layout/app-layout";
import { useListApiKeys, useCreateApiKey, useDeleteApiKey, getListApiKeysQueryKey, useListSessions } from "@workspace/api-client-react";
import { useAppStore } from "@/store";
import { getTranslation } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Key, Copy, AlertTriangle, Code2, Terminal, Download, BookOpen, Settings2, Shield } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const keySchema = z.object({
  name: z.string().min(1, "Name is required"),
});

function CodeBlock({ code, onCopy }: { code: string; onCopy: () => void }) {
  return (
    <div className="relative group">
      <pre className="bg-muted/80 border border-border rounded-lg p-4 text-xs font-mono overflow-x-auto leading-relaxed" dir="ltr">
        {code}
      </pre>
      <button
        onClick={onCopy}
        className="absolute top-2 end-2 p-1.5 rounded-md bg-background border border-border opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
      >
        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}

type ApiKeyRow = {
  id: number;
  userId: number;
  name: string;
  keyPrefix: string;
  allowedSessionIds?: string | null;
  ownerUsername?: string;
  createdAt: string;
  lastUsedAt?: string | null;
};

export default function ApiKeys() {
  const { data: keys, isLoading } = useListApiKeys();
  const { data: sessions } = useListSessions();
  const { language, user: currentUser } = useAppStore();
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(language, key);
  const isRTL = language === "ar";
  const isAdmin = currentUser?.role === "admin";

  const [isOpen, setIsOpen] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Restrict sessions dialog
  const [restrictingKey, setRestrictingKey] = useState<ApiKeyRow | null>(null);
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDownloadWorkflow = async () => {
    setIsDownloading(true);
    try {
      const res = await fetch("/api/n8n-workflow/download", { credentials: "include" });
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        toast({
          variant: "destructive",
          title: isRTL ? "مفتاح API مطلوب" : "API Key Required",
          description: body.message ?? (isRTL
            ? "يجب إنشاء مفتاح API أولاً قبل تحميل الـ workflow."
            : "You must create an API key before downloading the workflow."),
        });
        return;
      }
      if (!res.ok) throw new Error("Failed to download");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "n8n-workflow-whatsapp.json";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: t("success") });
    } catch {
      toast({ variant: "destructive", title: t("error") });
    } finally {
      setIsDownloading(false);
    }
  };

  const createMutation = useCreateApiKey({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListApiKeysQueryKey() });
        setNewSecret((data as any).secret);
        form.reset();
      },
      onError: () => toast({ variant: "destructive", title: t('error') })
    }
  });

  const deleteMutation = useDeleteApiKey({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListApiKeysQueryKey() })
    }
  });

  const form = useForm<z.infer<typeof keySchema>>({
    resolver: zodResolver(keySchema),
    defaultValues: { name: "" }
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: t('copied') });
  };

  // Open restrict sessions dialog for a key
  function openRestrict(key: ApiKeyRow) {
    setRestrictingKey(key);
    try {
      const current = key.allowedSessionIds ? JSON.parse(key.allowedSessionIds) : [];
      setSelectedSessions(Array.isArray(current) ? current : []);
    } catch {
      setSelectedSessions([]);
    }
  }

  async function saveRestrictions() {
    if (!restrictingKey) return;
    try {
      await fetch(`/api/api-keys/${restrictingKey.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedSessionIds: selectedSessions }),
      });
      queryClient.invalidateQueries({ queryKey: getListApiKeysQueryKey() });
      toast({ title: t("success") });
      setRestrictingKey(null);
    } catch {
      toast({ variant: "destructive", title: t("error") });
    }
  }

  function getAllowedLabel(key: ApiKeyRow): React.ReactNode {
    if (!key.allowedSessionIds) return <span className="text-xs text-muted-foreground">{t("key_sessions_all")}</span>;
    try {
      const ids: string[] = JSON.parse(key.allowedSessionIds);
      if (ids.length === 0) return <span className="text-xs text-muted-foreground">{t("key_sessions_all")}</span>;
      const names = ids.map((id) => {
        const sess = (sessions as any[])?.find((s: any) => s.id === id);
        return sess?.name || id;
      });
      return (
        <Badge variant="outline" className="text-xs max-w-[160px] truncate" title={names.join(", ")}>
          {names.length === 1 ? names[0] : `${names.length} ${t("key_sessions")}`}
        </Badge>
      );
    } catch {
      return <span className="text-xs text-muted-foreground">{t("key_sessions_all")}</span>;
    }
  }

  const curlExample = `curl -X POST https://your-app.replit.app/api/sessions/{SESSION_ID}/send/text \\
  -H "X-API-Key: sk_xxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"number": "{PHONE}", "message": "Hello from API!"}'`;

  const headerExample = `X-API-Key: sk_xxxxxxxxxxxxxxxx`;

  return (
    <AppLayout>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t('nav_api_keys')}</h1>
            <p className="text-muted-foreground mt-1">{t('key_subtitle')}</p>
          </div>
          
          <Dialog open={isOpen} onOpenChange={(open) => {
            setIsOpen(open);
            if (!open) setNewSecret(null);
          }}>
            <DialogTrigger asChild>
              <Button className="font-semibold shadow-lg shadow-primary/20 hover-elevate">
                <Plus className="w-4 h-4 me-2" />
                {t('key_add_new')}
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-card sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{t('key_add_new')}</DialogTitle>
              </DialogHeader>
              
              {newSecret ? (
                <div className="space-y-4 pt-4">
                  <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{t('important')}</AlertTitle>
                    <AlertDescription>{t('key_secret_warning')}</AlertDescription>
                  </Alert>
                  <div className="flex gap-2 items-center p-3 bg-muted rounded-lg font-mono text-sm border border-border">
                    <code className="flex-1 break-all" dir="ltr">{newSecret}</code>
                    <Button variant="ghost" size="icon" onClick={() => copyToClipboard(newSecret)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button className="w-full mt-4" onClick={() => setIsOpen(false)}>{t('done')}</Button>
                </div>
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit((v) => createMutation.mutate({ data: v }))} className="space-y-4 pt-4">
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('name')}</FormLabel>
                        <FormControl><Input placeholder={t('key_name_placeholder')} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                      {createMutation.isPending ? t('loading') : t('create')}
                    </Button>
                  </form>
                </Form>
              )}
            </DialogContent>
          </Dialog>
        </div>

        {/* Restrict Sessions Dialog (Admin only) */}
        <Dialog open={!!restrictingKey} onOpenChange={(open) => { if (!open) setRestrictingKey(null); }}>
          <DialogContent className="glass-card sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>{t("key_restrict_title")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">{t("key_restrict_desc")}</p>
              {restrictingKey && (
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  {t("key_for_user")}: <span className="text-foreground font-semibold">{restrictingKey.ownerUsername}</span>
                </div>
              )}
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {(sessions as any[])?.length === 0 && (
                  <p className="text-xs text-muted-foreground">{t("none")}</p>
                )}
                {(sessions as any[])?.map((sess: any) => (
                  <label key={sess.id} className="flex items-center gap-2.5 cursor-pointer text-sm hover:text-foreground">
                    <Checkbox
                      checked={selectedSessions.includes(sess.id)}
                      onCheckedChange={(checked) => {
                        setSelectedSessions((prev) =>
                          checked ? [...prev, sess.id] : prev.filter((id) => id !== sess.id)
                        );
                      }}
                    />
                    <span>{sess.name}</span>
                    <span className="text-xs text-muted-foreground font-mono ms-auto" dir="ltr">{sess.id.slice(0, 14)}…</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setRestrictingKey(null)}>{t("cancel")}</Button>
                <Button className="flex-1" onClick={saveRestrictions}>{t("key_restrict_save")}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Card className="glass-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>{t('name')}</TableHead>
                  <TableHead>{t('key_prefix')}</TableHead>
                  {isAdmin && <TableHead>{t('key_owner')}</TableHead>}
                  {isAdmin && <TableHead>{t('key_sessions')}</TableHead>}
                  <TableHead>{t('created_at')}</TableHead>
                  <TableHead className="text-end">{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={isAdmin ? 6 : 4} className="text-center py-8">{t('loading')}</TableCell></TableRow>
                ) : (keys as ApiKeyRow[] | undefined)?.length === 0 ? (
                  <TableRow><TableCell colSpan={isAdmin ? 6 : 4} className="text-center py-8 text-muted-foreground">{t('key_empty')}</TableCell></TableRow>
                ) : (keys as ApiKeyRow[] | undefined)?.map(k => (
                  <TableRow key={k.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <Key className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        {k.name}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground" dir="ltr">{k.keyPrefix}••••••••</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm">
                          <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                          {k.ownerUsername || "—"}
                        </div>
                      </TableCell>
                    )}
                    {isAdmin && (
                      <TableCell>{getAllowedLabel(k)}</TableCell>
                    )}
                    <TableCell className="text-muted-foreground">{new Date(k.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-1">
                        {/* Copy prefix to clipboard */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-full"
                          title={t("copied")}
                          onClick={() => copyToClipboard(k.keyPrefix)}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        {/* Restrict to sessions (admin only) */}
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full"
                            title={t("restrict")}
                            onClick={() => openRestrict(k)}
                          >
                            <Settings2 className="w-4 h-4" />
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full"
                          onClick={() => {
                            if (confirm(t('are_you_sure_key'))) {
                              deleteMutation.mutate({ id: k.id });
                            }
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Usage Guide */}
        <Card className="glass-card border-primary/20">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Terminal className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">{t('key_usage_title')}</CardTitle>
                <CardDescription className="mt-0.5">{t('key_usage_desc')}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                <Code2 className="w-4 h-4" />
                Header
              </p>
              <CodeBlock code={headerExample} onCopy={() => copyToClipboard(headerExample)} />
            </div>

            <div>
              <p className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                <Code2 className="w-4 h-4" />
                {t('key_usage_example')}
              </p>
              <CodeBlock code={curlExample} onCopy={() => copyToClipboard(curlExample)} />
              <p className="text-xs text-muted-foreground mt-2">{t('key_usage_note')}</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 pt-2">
              {[
                { method: "GET", path: "/api/sessions", desc: language === 'ar' ? "جلب كل الجلسات" : "List all sessions" },
                { method: "POST", path: "/api/sessions/:id/send/text", desc: language === 'ar' ? "إرسال رسالة نصية" : "Send text message" },
                { method: "POST", path: "/api/sessions/:id/send/image", desc: language === 'ar' ? "إرسال صورة" : "Send image" },
                { method: "POST", path: "/api/sessions/:id/send/file", desc: language === 'ar' ? "إرسال مستند" : "Send document" },
              ].map(ep => (
                <div key={ep.path} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-md font-mono flex-shrink-0 ${ep.method === 'GET' ? 'bg-blue-500/15 text-blue-600' : 'bg-green-500/15 text-green-600'}`} dir="ltr">
                    {ep.method}
                  </span>
                  <div className="min-w-0">
                    <code className="text-xs text-muted-foreground break-all" dir="ltr">{ep.path}</code>
                    <p className="text-xs text-foreground mt-0.5">{ep.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* n8n Workflow Download */}
        <Card className="glass-card border-green-500/20">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Download className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <CardTitle className="text-lg">{t('key_n8n_title')}</CardTitle>
                <CardDescription className="mt-0.5">{t('key_n8n_desc')}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handleDownloadWorkflow}
                disabled={isDownloading}
                className="bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-500/20"
              >
                <Download className="w-4 h-4 me-2" />
                {isDownloading ? t('loading') : t('key_n8n_download')}
              </Button>
              <Button
                variant="outline"
                asChild
              >
                <a href="/api/doc/n8n-workflow-guide" target="_blank" rel="noopener noreferrer">
                  <BookOpen className="w-4 h-4 me-2" />
                  {t('key_n8n_guide')}
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
