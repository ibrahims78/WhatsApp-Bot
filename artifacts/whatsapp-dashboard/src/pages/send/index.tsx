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
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Send, FileText, Image as ImageIcon, Video, Music, File, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCallback, useRef, useState } from "react";

const messageTypeIds = ['text', 'image', 'video', 'audio', 'file'] as const;
const messageTypeIcons = { text: FileText, image: ImageIcon, video: Video, audio: Music, file: File };

const acceptMap: Record<string, string> = {
  image: "image/jpeg,image/png,image/gif,image/webp",
  video: "video/mp4,video/quicktime,video/x-msvideo",
  audio: "audio/mpeg,audio/ogg,audio/wav,audio/x-m4a,audio/mp4",
  file: "*/*",
};

const sendSchema = z.object({
  sessionId: z.string().min(1, "Session is required"),
  number: z.string().min(1, "Recipient number is required"),
  type: z.enum(['text', 'image', 'video', 'audio', 'file']),
  content: z.string().optional(),
  mediaData: z.string().optional(),
  fileName: z.string().optional(),
}).superRefine((val, ctx) => {
  if (val.type === 'text' && !val.content) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Message content is required", path: ['content'] });
  }
  if (val.type !== 'text' && !val.mediaData) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Please upload a file", path: ['mediaData'] });
  }
});

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function SendMessage() {
  const { data: sessions } = useListSessions();
  const { language } = useAppStore();
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(language, key);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: string; preview?: string } | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  const sendTextMut = useSendText();
  const sendImageMut = useSendImage();
  const sendVideoMut = useSendVideo();
  const sendAudioMut = useSendAudio();
  const sendFileMut = useSendFile();

  const form = useForm<z.infer<typeof sendSchema>>({
    resolver: zodResolver(sendSchema),
    defaultValues: { type: 'text', content: "", mediaData: "", fileName: "" }
  });

  const selectedType = form.watch("type");
  const isPending = sendTextMut.isPending || sendImageMut.isPending || sendVideoMut.isPending || sendAudioMut.isPending || sendFileMut.isPending;

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsConverting(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      form.setValue("mediaData", dataUrl);
      form.setValue("fileName", file.name);
      const sizeKb = file.size / 1024;
      const sizeStr = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb.toFixed(0)} KB`;
      const preview = file.type.startsWith("image/") ? dataUrl : undefined;
      setUploadedFile({ name: file.name, size: sizeStr, preview });
    } catch {
      toast({ variant: "destructive", title: t('error'), description: "Failed to read file" });
    } finally {
      setIsConverting(false);
    }
  }, [form, toast, t]);

  const clearFile = () => {
    setUploadedFile(null);
    form.setValue("mediaData", "");
    form.setValue("fileName", "");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onTypeChange = (val: string) => {
    form.setValue("type", val as any);
    clearFile();
  };

  const onSubmit = (values: z.infer<typeof sendSchema>) => {
    const commonOpts = {
      onSuccess: () => {
        toast({ title: t('success') });
        form.reset({ type: values.type, content: "", mediaData: "", fileName: "" });
        clearFile();
      },
      onError: (e: any) => toast({ variant: "destructive", title: t('error'), description: e.error || "Failed" })
    };

    if (values.type === 'text') {
      sendTextMut.mutate({ data: { sessionId: values.sessionId, number: values.number, message: values.content! } }, commonOpts);
    } else if (values.type === 'image') {
      sendImageMut.mutate({ data: { sessionId: values.sessionId, number: values.number, imageUrl: values.mediaData!, caption: values.content } }, commonOpts);
    } else if (values.type === 'video') {
      sendVideoMut.mutate({ data: { sessionId: values.sessionId, number: values.number, videoUrl: values.mediaData!, caption: values.content } }, commonOpts);
    } else if (values.type === 'audio') {
      sendAudioMut.mutate({ data: { sessionId: values.sessionId, number: values.number, audioUrl: values.mediaData! } }, commonOpts);
    } else if (values.type === 'file') {
      sendFileMut.mutate({ data: { sessionId: values.sessionId, number: values.number, fileUrl: values.mediaData!, fileName: values.fileName!, caption: values.content } }, commonOpts);
    }
  };

  const uploadHintKey = `send_upload_hint_${selectedType === 'file' ? 'file' : selectedType}` as Parameters<typeof getTranslation>[1];

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
                      <FormControl><Input placeholder="e.g. 966501234567" {...field} dir="ltr" className="h-12 bg-background" /></FormControl>
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
                            onClick={() => onTypeChange(typeId)}
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
                  <FormField control={form.control} name="mediaData" render={() => (
                    <FormItem>
                      <FormLabel>{t('send_upload_file')}</FormLabel>
                      <FormControl>
                        <div>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept={acceptMap[selectedType] || "*/*"}
                            onChange={handleFileChange}
                            className="hidden"
                            id="file-upload-input"
                          />

                          {!uploadedFile ? (
                            <label
                              htmlFor="file-upload-input"
                              className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-xl cursor-pointer hover:bg-muted/50 transition-colors bg-background"
                            >
                              {isConverting ? (
                                <p className="text-sm text-muted-foreground animate-pulse">{t('send_uploading')}</p>
                              ) : (
                                <>
                                  <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                                  <p className="text-sm font-medium text-muted-foreground">{t('send_upload_file')}</p>
                                  <p className="text-xs text-muted-foreground/60 mt-1">{t(uploadHintKey)}</p>
                                </>
                              )}
                            </label>
                          ) : (
                            <div className="flex items-center gap-4 p-4 border border-border rounded-xl bg-background">
                              {uploadedFile.preview ? (
                                <img src={uploadedFile.preview} alt="preview" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
                              ) : (
                                <div className="w-14 h-14 flex items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                                  {selectedType === 'video' && <Video className="w-6 h-6 text-primary" />}
                                  {selectedType === 'audio' && <Music className="w-6 h-6 text-primary" />}
                                  {selectedType === 'file' && <File className="w-6 h-6 text-primary" />}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{uploadedFile.name}</p>
                                <p className="text-xs text-muted-foreground mt-1">{uploadedFile.size}</p>
                              </div>
                              <Button type="button" variant="ghost" size="icon" onClick={clearFile} className="flex-shrink-0 rounded-full hover:bg-destructive/10 hover:text-destructive">
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </FormControl>
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

                <Button type="submit" size="lg" className="w-full text-base font-bold hover-elevate shadow-lg shadow-primary/20" disabled={isPending || isConverting}>
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
