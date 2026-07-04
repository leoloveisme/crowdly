import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Eye, EyeOff } from "lucide-react";
import EditableText from "@/components/EditableText";

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

interface Locale {
  code: string;
  english_name: string;
  native_name: string | null;
}

interface CreateUserProps {
  onUserCreated?: () => void;
}

const CreateUser: React.FC<CreateUserProps> = ({ onUserCreated }) => {
  const { user } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isUiTranslator, setIsUiTranslator] = useState(false);
  const [isPlatformSupporter, setIsPlatformSupporter] = useState(false);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [locales, setLocales] = useState<Locale[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch available locales when UI Translator is checked
  useEffect(() => {
    if (!isUiTranslator) return;
    if (locales.length > 0) return; // already loaded

    fetch(`${API_BASE}/locales`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          // Exclude English — it's the source language
          setLocales(data.filter((l: Locale) => l.code !== "en"));
        }
      })
      .catch(() => {});
  }, [isUiTranslator, locales.length]);

  const toggleLanguage = (code: string) => {
    setSelectedLanguages((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !email.trim() || !password.trim()) {
      toast({ title: "Error", description: "Email and password are required", variant: "destructive" });
      return;
    }

    if (isUiTranslator && selectedLanguages.length === 0) {
      toast({ title: "Error", description: "Please select at least one language for the UI Translator role", variant: "destructive" });
      return;
    }

    const roles: string[] = [];
    if (isUiTranslator) roles.push("ui_translator");
    if (isPlatformSupporter) roles.push("platform_supporter");

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          password,
          roles,
          translatorLanguages: isUiTranslator ? selectedLanguages : [],
        }),
      });

      if (res.ok) {
        toast({ title: "User created", description: `${email.trim()} has been created successfully.` });
        setFirstName("");
        setLastName("");
        setEmail("");
        setPassword("");
        setIsUiTranslator(false);
        setIsPlatformSupporter(false);
        setSelectedLanguages([]);
        onUserCreated?.();
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: "Error", description: data.error || "Failed to create user", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to create user", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle><EditableText id="create-user-title">Create User</EditableText></CardTitle>
        <CardDescription><EditableText id="create-user-desc">Add a new user to the platform.</EditableText></CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
          <div className="space-y-1">
            <Label htmlFor="create-fn"><EditableText id="create-user-fn-label">First Name</EditableText></Label>
            <Input id="create-fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="create-ln"><EditableText id="create-user-ln-label">Last Name</EditableText></Label>
            <Input id="create-ln" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="create-email"><EditableText id="create-user-email-label">Email</EditableText></Label>
            <Input id="create-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="create-pw"><EditableText id="create-user-pw-label">Password</EditableText></Label>
            <div className="relative">
              <Input
                id="create-pw"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label><EditableText id="create-user-roles-label">Roles</EditableText></Label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={isUiTranslator}
                  onCheckedChange={(v) => {
                    setIsUiTranslator(v === true);
                    if (!v) setSelectedLanguages([]);
                  }}
                />
                <span className="text-sm"><EditableText id="create-user-role-translator">UI Translator</EditableText></span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={isPlatformSupporter} onCheckedChange={(v) => setIsPlatformSupporter(v === true)} />
                <span className="text-sm"><EditableText id="create-user-role-support">Platform Support</EditableText></span>
              </label>
            </div>
            <p className="text-xs text-muted-foreground"><EditableText id="create-user-roles-hint">If no role is checked, the user is created as a regular consumer.</EditableText></p>
          </div>

          {/* Language checkboxes — shown only when UI Translator is checked */}
          {isUiTranslator && (
            <div className="space-y-2">
              <Label><EditableText id="create-user-langs-label">Translator Languages</EditableText></Label>
              <p className="text-xs text-muted-foreground mb-2">
                <EditableText id="create-user-langs-hint">Select which languages this user will be allowed to translate into. At least one is required.</EditableText>
              </p>
              <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto border rounded p-3 bg-gray-50">
                {locales.length === 0 ? (
                  <span className="text-xs text-muted-foreground col-span-2"><EditableText id="create-user-langs-loading">Loading languages...</EditableText></span>
                ) : (
                  locales.map((locale) => (
                    <label key={locale.code} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={selectedLanguages.includes(locale.code)}
                        onCheckedChange={() => toggleLanguage(locale.code)}
                      />
                      <span className="text-sm">
                        {locale.english_name}
                        {locale.native_name && locale.native_name !== locale.english_name && (
                          <span className="text-xs text-muted-foreground ml-1">({locale.native_name})</span>
                        )}
                      </span>
                    </label>
                  ))
                )}
              </div>
              {selectedLanguages.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedLanguages.length} language{selectedLanguages.length !== 1 ? "s" : ""} selected
                </p>
              )}
            </div>
          )}

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <EditableText id="create-user-btn-loading">Adding...</EditableText> : <EditableText id="create-user-btn">Add</EditableText>}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default CreateUser;
