import { useAppStore } from "@/store";
import { getTranslation } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  const { language } = useAppStore();
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(language, key);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4 glass-card">
        <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">404</h1>
            <p className="text-muted-foreground mt-1">{t('not_found')}</p>
          </div>
          <Button asChild className="mt-2">
            <Link href="/">{t('nav_dashboard')}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
