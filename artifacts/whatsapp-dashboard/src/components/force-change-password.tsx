import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAppStore } from "@/store";
import { getTranslation } from "@/lib/i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Lock } from "lucide-react";

function passwordSchema(t: (k: any) => string) {
  return z.object({
    password: z
      .string()
      .min(6, t('password_too_short'))
      .refine((v) => /[A-Z]/.test(v), t('password_no_upper'))
      .refine((v) => /[a-z]/.test(v), t('password_no_lower'))
      .refine((v) => /[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(v), t('password_no_digit')),
    confirm: z.string(),
  }).refine((d) => d.password === d.confirm, {
    message: "force_change_mismatch",
    path: ["confirm"],
  });
}

export function ForceChangePassword() {
  const { language, user, token, setMustChangePassword, mustChangePassword } = useAppStore();
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(language, key);
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const schema = passwordSchema(t);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  if (!mustChangePassword || !user) return null;

  async function onSubmit(values: z.infer<typeof schema>) {
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${user!.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token && token !== "cookie-auth" ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ password: values.password }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: t("error"), description: err.error || t("error") });
        return;
      }

      setMustChangePassword(false);
      toast({ title: t("force_change_success") });
    } catch {
      toast({ variant: "destructive", title: t("error") });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[420px] [&>button]:hidden" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="w-5 h-5 text-primary" />
            </div>
            <DialogTitle>{t("force_change_title")}</DialogTitle>
          </div>
          <DialogDescription>{t("force_change_desc")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <FormField control={form.control} name="password" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("force_change_new")}</FormLabel>
                <FormControl><Input {...field} type="password" autoComplete="new-password" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="confirm" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("force_change_confirm")}</FormLabel>
                <FormControl><Input {...field} type="password" autoComplete="new-password" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <Button type="submit" className="w-full" disabled={loading}>
              {t("force_change_btn")}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
