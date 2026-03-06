import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { useLanguage } from "@/lib/i18n";

export default function NotFound() {
  const { t } = useLanguage();

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 text-center space-y-4">
          <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto" />
          <div>
            <h1 className="text-xl font-serif font-bold text-foreground">{t.common.notFound}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t.common.notFoundDesc}
            </p>
          </div>
          <Link href="/">
            <Button data-testid="button-go-home">{t.common.backToDashboard}</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
