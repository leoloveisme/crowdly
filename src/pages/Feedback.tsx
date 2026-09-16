import React, { useEffect, useState, useCallback } from "react";
import DOMPurify from "dompurify";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import EditableText from "@/components/EditableText";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Feedback = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [captchaId, setCaptchaId] = useState<string | null>(null);
  const [captchaSvg, setCaptchaSvg] = useState<string | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [captchaError, setCaptchaError] = useState(false);

  const loadCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    setCaptchaError(false);
    setCaptchaAnswer("");
    try {
      const res = await fetch("/api/captcha", { method: "POST" });
      if (!res.ok) throw new Error("captcha request failed");
      const data = await res.json();
      setCaptchaId(data.id);
      setCaptchaSvg(data.svg);
    } catch {
      setCaptchaId(null);
      setCaptchaSvg(null);
      setCaptchaError(true);
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCaptcha();
  }, [loadCaptcha]);

  const sanitizedCaptchaSvg = captchaSvg
    ? DOMPurify.sanitize(captchaSvg, { USE_PROFILES: { svg: true, svgFilters: true } })
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (feedback.trim().length === 0) {
      toast({ variant: "destructive", description: "Please enter some feedback text." });
      return;
    }
    if (!EMAIL_RE.test(email)) {
      toast({ variant: "destructive", description: "Please enter a valid email address." });
      return;
    }
    if (!captchaId || captchaAnswer.trim().length === 0) {
      toast({ variant: "destructive", description: "Please enter the code shown in the CAPTCHA image." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, feedback, captchaId, captchaAnswer }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not send your feedback right now. Please try again.");
      }
      setSubmitted(true);
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Could not send your feedback right now. Please try again.",
      });
      loadCaptcha();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-tr from-indigo-100 via-pink-50 to-white dark:from-indigo-950 dark:via-slate-950 dark:to-pink-950">
      <CrowdlyHeader />
      <main className="flex-1 container mx-auto px-4 py-12 flex justify-center">
        <Card className="w-full max-w-lg rounded-3xl border-pink-200/40 dark:border-indigo-800/60 shadow-xl">
          <CardHeader>
            <CardTitle>
              {submitted ? (
                <EditableText
                  id="feedback-thank-you-title"
                  as="span"
                  className="bg-gradient-to-r from-indigo-900 via-pink-800 to-indigo-400 bg-clip-text text-transparent"
                >
                  Thank you for your feedback!
                </EditableText>
              ) : (
                <EditableText
                  id="feedback-heading"
                  as="span"
                  className="bg-gradient-to-r from-indigo-900 via-pink-800 to-indigo-400 bg-clip-text text-transparent"
                >
                  Send feedback
                </EditableText>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <p className="text-muted-foreground">
                <EditableText id="feedback-thank-you-desc" as="span">
                  We appreciate you taking the time to help us improve.
                </EditableText>
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="feedback-name" className="text-indigo-800 dark:text-indigo-100">
                    <EditableText id="feedback-name-label" as="span">Name</EditableText>
                  </Label>
                  <Input
                    id="feedback-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="border-indigo-100 dark:border-indigo-800/60 focus-visible:ring-indigo-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="feedback-email" className="text-indigo-800 dark:text-indigo-100">
                    <EditableText id="feedback-email-label" as="span">Email</EditableText>
                  </Label>
                  <Input
                    id="feedback-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Your email"
                    className="border-indigo-100 dark:border-indigo-800/60 focus-visible:ring-indigo-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="feedback-message" className="text-indigo-800 dark:text-indigo-100">
                    <EditableText id="feedback-message-label" as="span">Feedback</EditableText>
                  </Label>
                  <Textarea
                    id="feedback-message"
                    required
                    rows={6}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Your feedback here"
                    className="border-indigo-100 dark:border-indigo-800/60 focus-visible:ring-indigo-400"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="feedback-captcha-answer" className="text-indigo-800 dark:text-indigo-100">
                    <EditableText id="feedback-captcha-label" as="span">Enter the code shown below</EditableText>
                  </Label>
                  <div className="flex items-center gap-2 rounded-md border border-indigo-100 dark:border-indigo-800/60 bg-gradient-to-tr from-pink-50 to-indigo-50 dark:from-indigo-900/30 dark:to-pink-900/20 p-2">
                    {captchaLoading ? (
                      <div className="flex h-12 w-32 items-center justify-center text-muted-foreground text-sm">
                        <EditableText id="feedback-captcha-loading" as="span">Loading CAPTCHA…</EditableText>
                      </div>
                    ) : sanitizedCaptchaSvg ? (
                      <div
                        className="h-12 w-32 flex items-center justify-center [&_svg]:h-full"
                        dangerouslySetInnerHTML={{ __html: sanitizedCaptchaSvg }}
                      />
                    ) : (
                      <div className="flex h-12 w-32 items-center justify-center text-muted-foreground text-sm">
                        <EditableText id="feedback-captcha-unavailable" as="span">CAPTCHA unavailable</EditableText>
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={loadCaptcha}
                      disabled={captchaLoading}
                      aria-label="Refresh CAPTCHA"
                      className="text-indigo-500 hover:text-indigo-700 hover:bg-indigo-100/60"
                    >
                      <RefreshCw className={`h-4 w-4 ${captchaLoading ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                  {captchaError && (
                    <p className="text-sm text-destructive">
                      <EditableText id="feedback-captcha-load-error" as="span">
                        Could not load the CAPTCHA. Please try refreshing.
                      </EditableText>
                    </p>
                  )}
                  <Input
                    id="feedback-captcha-answer"
                    value={captchaAnswer}
                    onChange={(e) => setCaptchaAnswer(e.target.value)}
                    placeholder="Enter the code above"
                    className="border-indigo-100 dark:border-indigo-800/60 focus-visible:ring-indigo-400"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-indigo-600 to-pink-600 hover:from-indigo-700 hover:to-pink-700 text-white shadow-md"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      <EditableText id="feedback-sending" as="span">Sending…</EditableText>
                    </>
                  ) : (
                    <EditableText id="feedback-submit-btn" as="span">Submit Feedback</EditableText>
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
      <CrowdlyFooter />
    </div>
  );
};

export default Feedback;
