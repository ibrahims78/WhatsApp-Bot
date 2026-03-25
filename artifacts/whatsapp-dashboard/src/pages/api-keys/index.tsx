import { AppLayout } from "@/components/layout/app-layout";
import { useListApiKeys, useCreateApiKey, useDeleteApiKey, getListApiKeysQueryKey } from "@workspace/api-client-react";
import { useAppStore } from "@/store";
import { getTranslation } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Key, Copy, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
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

export default function ApiKeys() {
  const { data: keys, isLoading } = useListApiKeys();
  const { language } = useAppStore();
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(language, key);
  const [isOpen, setIsOpen] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useCreateApiKey({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListApiKeysQueryKey() });
        setNewSecret(data.secret);
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
                    <code className="flex-1 break-all">{newSecret}</code>
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
                        <FormControl><Input placeholder="e.g. Production Server" {...field} /></FormControl>
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

        <Card className="glass-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>{t('name')}</TableHead>
                  <TableHead>{t('key_prefix')}</TableHead>
                  <TableHead>{t('created_at')}</TableHead>
                  <TableHead className="text-end">{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8">{t('loading')}</TableCell></TableRow>
                ) : keys?.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">{t('key_empty')}</TableCell></TableRow>
                ) : keys?.map(k => (
                  <TableRow key={k.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium flex items-center gap-3">
                      <Key className="w-4 h-4 text-muted-foreground" />
                      {k.name}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{k.keyPrefix}••••••••</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(k.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-end">
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
