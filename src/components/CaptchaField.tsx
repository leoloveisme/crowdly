import { useCallback, useEffect, useState } from "react";
import DOMPurify from "dompurify";
import EditableText from "@/components/EditableText";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

// CAPTCHA state + field shared by the /support forms. Same flow as
// src/pages/Feedback.tsx: POST /api/captcha for an SVG challenge, sanitize
// it with DOMPurify, send { captchaId, captchaAnswer } with the submission.

export function useCaptcha(enabled: boolean) {
  const [captchaId, setCaptchaId] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(false);
    setAnswer("");
    try {
      const res = await fetch("/api/captcha", { method: "POST" });
      if (!res.ok) throw new Error("captcha request failed");
      const data = await res.json();
      setCaptchaId(data.id);
      setSvg(data.svg);
    } catch {
      setCaptchaId(null);
      setSvg(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);

  return { enabled, captchaId, svg, answer, setAnswer, loading, error, reload };
}

export type CaptchaState = ReturnType<typeof useCaptcha>;

interface CaptchaFieldProps {
  captcha: CaptchaState;
  /** Unique per form so the input's DOM id doesn't clash. */
  inputId: string;
  /** EditableText id prefix, e.g. "support" → support-captcha-label. */
  textPrefix: string;
}

const CaptchaField = ({ captcha, inputId, textPrefix }: CaptchaFieldProps) => {
  if (!captcha.enabled) return null;
  const sanitizedSvg = captcha.svg
    ? DOMPurify.sanitize(captcha.svg, { USE_PROFILES: { svg: true, svgFilters: true } })
    : null;

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId} className="text-indigo-800 dark:text-indigo-100">
        <EditableText id={`${textPrefix}-captcha-label`}>Enter the code shown below</EditableText>
      </Label>
      <div className="flex items-center gap-2 rounded-md border border-indigo-100 dark:border-indigo-800/60 bg-gradient-to-tr from-pink-50 to-indigo-50 dark:from-indigo-900/30 dark:to-pink-900/20 p-2">
        {captcha.loading ? (
          <div className="flex h-12 w-32 items-center justify-center text-muted-foreground text-sm">
            <EditableText id={`${textPrefix}-captcha-loading`}>Loading CAPTCHA…</EditableText>
          </div>
        ) : sanitizedSvg ? (
          <div
            className="h-12 w-32 flex items-center justify-center [&_svg]:h-full"
            dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
          />
        ) : (
          <div className="flex h-12 w-32 items-center justify-center text-muted-foreground text-sm">
            <EditableText id={`${textPrefix}-captcha-unavailable`}>CAPTCHA unavailable</EditableText>
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={captcha.reload}
          disabled={captcha.loading}
          aria-label="Refresh CAPTCHA"
          className="text-indigo-500 hover:text-indigo-700 hover:bg-indigo-100/60"
        >
          <RefreshCw className={`h-4 w-4 ${captcha.loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {captcha.error && (
        <p className="text-sm text-destructive">
          <EditableText id={`${textPrefix}-captcha-load-error`}>Could not load the CAPTCHA. Please try refreshing.</EditableText>
        </p>
      )}
      <Input
        id={inputId}
        value={captcha.answer}
        onChange={(e) => captcha.setAnswer(e.target.value)}
        placeholder="Enter the code above"
        className="border-indigo-100 dark:border-indigo-800/60 focus-visible:ring-indigo-400"
      />
    </div>
  );
};

export default CaptchaField;
