import { AppLayout } from "@/components/layout/app-layout";
import { useListSessions, useCreateSession, getListSessionsQueryKey } from "@workspace/api-client-react";
import { useAppStore } from "@/store";
import { getTranslation } from "@/lib/i18n";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Smartphone, Trash2, ArrowRight, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";

export default function Sessions() {
  const { data: sessions, isLoading } = useListSessions();
  const { language } = useAppStore();
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(language, key);
  const isRtl = language === 'ar';
  const queryClient = useQueryClient();
  const createMutation = useCreateSession({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        setIsOpen(false);
        setNewName("");
      }
    }
  });

  const [isOpen, setIsOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const handleCreate = () => {
    if (newName.trim()) {
      createMutation.mutate({ data: { name: newName } });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'connecting': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'banned': return 'bg-red-500/10 text-red-500 border-red-500/20';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t('nav_sessions')}</h1>
            <p className="text-muted-foreground mt-1">{t('sess_subtitle')}</p>
          </div>
          
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="font-semibold shadow-lg shadow-primary/20 hover-elevate">
                <Plus className="w-4 h-4 me-2" />
                {t('sess_add_new')}
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-card">
              <DialogHeader>
                <DialogTitle>{t('sess_create_title')}</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <Input 
                  placeholder={t('sess_name_placeholder')}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="bg-background"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsOpen(false)}>{t('cancel')}</Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending || !newName.trim()}>
                  {createMutation.isPending ? t('loading') : t('create')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map(i => <Card key={i} className="h-48 animate-pulse bg-card/50" />)}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {sessions?.map(session => (
              <Card key={session.id} className="glass-card group overflow-hidden flex flex-col hover:border-primary/50 transition-colors duration-300">
                <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Smartphone className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{session.name}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-0.5 font-mono">
                          {session.phoneNumber || t('sess_no_number')}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 flex-1">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm font-medium text-muted-foreground">{t('status')}</span>
                    <Badge variant="outline" className={`${getStatusColor(session.status)} px-3 py-1`}>
                      {t(`sess_status_${session.status}` as Parameters<typeof getTranslation>[1]) || session.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-6">
                    <div className="bg-muted/30 rounded-xl p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1 uppercase font-semibold">{t('dash_sent')}</p>
                      <p className="text-xl font-bold">{session.totalMessagesSent}</p>
                    </div>
                    <div className="bg-muted/30 rounded-xl p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1 uppercase font-semibold">{t('dash_received')}</p>
                      <p className="text-xl font-bold">{session.totalMessagesReceived}</p>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="pt-0 pb-4 px-6">
                  <Button asChild variant="secondary" className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                    <Link href={`/sessions/${session.id}`} className="flex items-center justify-center gap-2">
                      {t('sess_view')}
                      {isRtl
                        ? <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                        : <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      }
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
            {sessions?.length === 0 && (
              <div className="col-span-full py-20 text-center bg-muted/20 rounded-2xl border border-dashed border-border">
                <Smartphone className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-semibold">{t('sess_empty_title')}</h3>
                <p className="text-muted-foreground mt-1">{t('sess_empty_desc')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
