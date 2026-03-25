import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin } from "@workspace/api-client-react";
import { useAppStore } from "@/store";
import { useLocation } from "wouter";
import { getTranslation } from "@/lib/i18n";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export default function Login() {
  const [, setLocation] = useLocation();
  const { setAuth, language } = useAppStore();
  const { toast } = useToast();
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(language, key);
  
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        setAuth(data.token, data.user);
        setLocation("/");
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: t('error'),
          description: error.error || "Login failed",
        });
      }
    }
  });

  function onSubmit(values: z.infer<typeof loginSchema>) {
    loginMutation.mutate({ data: values });
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-background">
      {/* Abstract Background */}
      <div className="absolute inset-0 z-0">
        <img 
          src={`${import.meta.env.BASE_URL}images/auth-bg.png`} 
          alt="Background" 
          className="w-full h-full object-cover opacity-40 dark:opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      </div>

      <div className="z-10 w-full max-w-md p-4">
        <Card className="glass-card border-border/20 shadow-2xl">
          <CardHeader className="space-y-4 items-center text-center pb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/30">
              <MessageSquare className="w-8 h-8 text-primary-foreground" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-3xl font-bold tracking-tight">{t('login_title')}</CardTitle>
              <CardDescription className="text-base font-medium text-muted-foreground">
                {t('login_subtitle')}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold">{t('login_username')}</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="admin" 
                          {...field} 
                          dir="ltr"
                          className="h-12 bg-background/50 border-border/50 focus:bg-background transition-colors"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold">{t('login_password')}</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder="••••••••" 
                          {...field} 
                          className="h-12 bg-background/50 border-border/50 focus:bg-background transition-colors"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button 
                  type="submit" 
                  className="w-full h-12 text-base font-bold shadow-lg shadow-primary/25 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary" 
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : t('login_btn')}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
