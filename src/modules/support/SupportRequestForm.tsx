import React, { useState } from "react";
import EditableText from "@/components/EditableText";
import CaptchaField, { useCaptcha } from "@/components/CaptchaField";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Loader2 } from "lucide-react";
import { CATEGORIES, submitSupportRequest, type SupportCategory } from "@/lib/supportApi";
import { CategoryLabel } from "./labels";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INPUT_CLASS = "border-indigo-100 dark:border-indigo-800/60 focus-visible:ring-indigo-400";
const LABEL_CLASS = "text-indigo-800 dark:text-indigo-100";

interface Props {
  onSubmitted?: () => void;
}

const SupportRequestForm = ({ onSubmitted }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const captcha = useCaptcha(!user);

  const [name, setName] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [category, setCategory] = useState<SupportCategory>("other");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const reset = () => {
    setSubject("");
    setMessage("");
    setCategory("other");
    setSubmitted(false);
    if (!user) captcha.reload();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (subject.trim().length === 0 || message.trim().length === 0) {
      toast({ variant: "destructive", description: "Please add a subject and describe how we can help." });
      return;
    }
    if (!EMAIL_RE.test(email)) {
      toast({ variant: "destructive", description: "Please enter a valid email address." });
      return;
    }
    if (!user && (!captcha.captchaId || captcha.answer.trim().length === 0)) {
      toast({ variant: "destructive", description: "Please enter the code shown in the CAPTCHA image." });
      return;
    }

    setSubmitting(true);
    try {
      await submitSupportRequest({
        kind: "request",
        name,
        email,
        category,
        subject,
        message,
        captchaId: captcha.captchaId,
        captchaAnswer: captcha.answer,
      });
      setSubmitted(true);
      onSubmitted?.();
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Could not submit right now. Please try again.",
      });
      if (!user) captcha.reload();
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center text-center py-8 gap-3">
        <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        <EditableText id="support-request-thanks-title" as="p" className="text-lg font-semibold">
          Thanks, we've got your request!
        </EditableText>
        <EditableText id="support-request-thanks-desc" as="p" className="text-muted-foreground max-w-md">
          We'll reply to the email address you gave us. If you're signed in, you can follow its status below.
        </EditableText>
        <Button variant="outline" onClick={reset}>
          <EditableText id="support-request-another">Send another request</EditableText>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="support-request-name" className={LABEL_CLASS}>
            <EditableText id="support-form-name-label">Name</EditableText>
          </Label>
          <Input id="support-request-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={INPUT_CLASS} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="support-request-email" className={LABEL_CLASS}>
            <EditableText id="support-form-email-label">Email</EditableText>
          </Label>
          <Input id="support-request-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" className={INPUT_CLASS} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="support-request-category" className={LABEL_CLASS}>
          <EditableText id="support-form-category-label">What is it about?</EditableText>
        </Label>
        <Select value={category} onValueChange={(v) => setCategory(v as SupportCategory)}>
          <SelectTrigger id="support-request-category" className={INPUT_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                <CategoryLabel category={c} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="support-request-subject" className={LABEL_CLASS}>
          <EditableText id="support-form-subject-label">Subject</EditableText>
        </Label>
        <Input id="support-request-subject" required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="A short summary" className={INPUT_CLASS} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="support-request-message" className={LABEL_CLASS}>
          <EditableText id="support-form-message-label">How can we help?</EditableText>
        </Label>
        <Textarea id="support-request-message" required rows={6} maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us what you need help with" className={INPUT_CLASS} />
      </div>

      <CaptchaField captcha={captcha} inputId="support-request-captcha" textPrefix="support" />

      <Button
        type="submit"
        className="w-full bg-gradient-to-r from-indigo-600 to-pink-600 hover:from-indigo-700 hover:to-pink-700 text-white shadow-md"
        disabled={submitting}
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            <EditableText id="support-form-sending">Sending…</EditableText>
          </>
        ) : (
          <EditableText id="support-request-submit">Send request</EditableText>
        )}
      </Button>
    </form>
  );
};

export default SupportRequestForm;
