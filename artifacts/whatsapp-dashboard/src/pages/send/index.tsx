import { AppLayout } from "@/components/layout/app-layout";
import { 
  useListSessions, 
  useSendText, 
  useSendImage, 
  useSendVideo, 
  useSendAudio, 
  useSendFile 
} from "@workspace/api-client-react";
import { useAppStore } from "@/store";
import { getTranslation } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Send, FileText, Image as ImageIcon, Video, Music, File } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const messageTypeIds = ['text', 'image', 'video', 'audio', 'file'] as const;
const messageTypeIcons = { text: FileText, image: ImageIcon, video: Video, audio: Music, file: File };

const sendSchema = z.object({
  sessionId: z.string().min(1, "Session is required"),
  number: z.string().min(1, "Recipient number is required"),
  type: z.enum(['text', 'image', 'video', 'audio', 'file']),
  content: z.string().optional(),
  mediaUrl: z.string().url().optional().or(z.literal("")),
  fileName: z.string().optional(),
}).superRefine((val, ctx) => {
  if (val.type === 'text' && !val.content) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Message content is required", path: ['content'] });
  }
  if (val.type !== 'text' && !val.mediaUrl) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Media URL is required", path: ['mediaUrl'] });
  }
  if (val.type === 'file' && !val.fileName) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "File name is required", path: ['fileName'] });
  }
});

export default function SendMessage() {
  const { data: sessions } = useListSessions();
  const { language } = useAppStore();
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(language, key);
  const { toast } = useToast();

  const sendTextMut = useSendText();
  const sendImageMut = useSendImage();
  const sendVideoMut = useSendVideo();
  const sendAudioMut = useSendAudio();
  const sendFileMut = useSendFile();

  const form = useForm<z.infer<typeof sendSchema>>({
    resolver: zodResolver(sendSchema),
    defaultValues: { type: 'text', content: "", mediaUrl: "", fileName: "" }
  });

  const selectedType = form.watch("type");
  const isPending = sendTextMut.isPending || sendImageMut.isPending || sendVideoMut.isPending || sendAudioMut.isPending || sendFileMut.isPending;

  const onSubmit = (values: z.infer<typeof sendSchema>) => {
    const commonOpts = {
      onSuccess: () => {
        toast({ title: t('success') });
        form.reset({ ...values, content: "", mediaUrl: "" });
      },
      onError: (e: any) => toast({ variant: "destructive", title: t('error'), description: e.error || "Failed" })
    };

    if (values.type === 'text') {
      sendTextMut.mutate({ data: { sessionId: values.sessionId, number: values.number, message: values.content! } }, commonOpts);
    } else if (values.type === 'image') {
      sendImageMut.mutate({ data: { sessionId: values.sessionId, number: values.number, imageUrl: values.mediaUrl!, caption: values.content } }, commonOpts);
    } else if (values.type === 'video') {
      sendVideoMut.mutate({ data: { sessionId: values.sessionId, number: values.number, videoUrl: values.mediaUrl!, caption: values.content } }, commonOpts);
    } else if (values.type === 'audio') {
      sendAudioMut.mutate({ data: { sessionId: values.sessionId, number: values.number, audioUrl: values.mediaUrl! } }, commonOpts);
    } else if (values.type === 'file') {
      sendFileMut.mutate({ data: { sessionId: values.sessionId, number: values.number, fileUrl: values.mediaUrl!, fileName: values.fileName!, caption: values.content } }, commonOpts);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t('send_title')}</h1>
          <p className="text-muted-foreground mt-1">{t('send_subtitle')}</p>
        </div>

        <Card className="glass-card border-border/50 shadow-xl">
          <CardContent className="p-6 md:p-8">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <FormField control={form.control} name="sessionId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('send_select_session')}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger className="h-12 bg-background"><SelectValue placeholder={t('send_choose_session')} /></SelectTrigger></FormControl>
                        <SelectContent>
                          {sessions?.filter(s => s.status === 'connected').map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name} ({s.phoneNumber})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="number" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('send_recipient')}</FormLabel>
                      <FormControl><Input placeholder="e.g. 1234567890" {...field} dir="ltr" className="h-12 bg-background" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('send_type')}</FormLabel>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3">
                      {messageTypeIds.map(typeId => {
                        const Icon = messageTypeIcons[typeId];
                        const isSelected = field.value === typeId;
                        const labelKey = `msg_${typeId === 'file' ? 'document' : typeId}` as Parameters<typeof getTranslation>[1];
                        return (
                          <div 
                            key={typeId} 
                            onClick={() => field.onChange(typeId)}
                            className={`flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl border-2 cursor-pointer transition-all ${isSelected ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background hover:bg-muted'}`}
                          >
                            <Icon className="w-5 h-5 sm:w-6 sm:h-6 mb-2" />
                            <span className="text-xs font-semibold">{t(labelKey)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </FormItem>
                )} />

                {selectedType !== 'text' && (
                  <FormField control={form.control} name="mediaUrl" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('send_media_url')}</FormLabel>
                      <FormControl><Input placeholder="https://example.com/media.jpg" {...field} dir="ltr" className="h-12 bg-background" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}

                {selectedType === 'file' && (
                  <FormField control={form.control} name="fileName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('send_file_name')}</FormLabel>
                      <FormControl><Input placeholder="document.pdf" {...field} className="h-12 bg-background" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}

                {selectedType !== 'audio' && (
                  <FormField control={form.control} name="content" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{selectedType === 'text' ? t('send_content') : t('send_caption')}</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder={t('send_placeholder')} 
                          {...field} 
                          className="min-h-[120px] bg-background resize-none" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}

                <Button type="submit" size="lg" className="w-full text-base font-bold hover-elevate shadow-lg shadow-primary/20" disabled={isPending}>
                  <Send className="w-5 h-5 me-2" />
                  {isPending ? t('loading') : t('send_btn')}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
