import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAlpha } from "@/contexts/AlphaContext";
import { useAuth } from "@/contexts/AuthContext";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import LoginForm from "@/components/LoginForm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { KeyRound, LogIn, FileText, ChevronDown, ChevronUp } from "lucide-react";

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

const AlphaGate = () => {
  const { validateCode } = useAlpha();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Invitation code form
  const [invCode, setInvCode] = useState("");
  const [invEmail, setInvEmail] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  // Section toggles
  const [showLogin, setShowLogin] = useState(false);
  const [showApply, setShowApply] = useState(false);

  // Application form
  const [appFirstName, setAppFirstName] = useState("");
  const [appLastName, setAppLastName] = useState("");
  const [appEmail, setAppEmail] = useState("");
  const [appMotivation, setAppMotivation] = useState("");
  const [isApplying, setIsApplying] = useState(false);

  // If user is logged in, redirect to Index
  React.useEffect(() => {
    if (user) {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  const handleValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invCode || !invEmail) {
      toast({ title: "Error", description: "Please enter both your invitation code and email.", variant: "destructive" });
      return;
    }
    setIsValidating(true);
    try {
      const valid = await validateCode(invCode, invEmail);
      if (valid) {
        toast({ title: "Welcome!", description: "Your invitation code is valid. Entering the platform..." });
        navigate("/", { replace: true });
      } else {
        toast({ title: "Invalid", description: "The invitation code or email is incorrect.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setIsValidating(false);
    }
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appFirstName || !appLastName || !appEmail) {
      toast({ title: "Error", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    setIsApplying(true);
    try {
      const response = await fetch(`${API_BASE}/alpha/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: appFirstName,
          lastName: appLastName,
          email: appEmail,
          motivationLetter: appMotivation || undefined,
        }),
      });
      if (response.ok) {
        toast({ title: "Application sent!", description: "We'll review your application and get back to you via email." });
        setAppFirstName("");
        setAppLastName("");
        setAppEmail("");
        setAppMotivation("");
        setShowApply(false);
      } else {
        const data = await response.json().catch(() => ({}));
        toast({ title: "Error", description: data.error || "Failed to submit application.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-blue-50 via-sky-100 to-white dark:from-background dark:via-background/70 dark:to-background/90">
      <main className="flex-grow flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-900 via-pink-800 to-indigo-400 bg-clip-text text-transparent">
              Welcome to Crowdly!
            </h1>
            <p className="text-muted-foreground">
              Crowdly is currently in alpha. Enter your invitation code to access the platform.
            </p>
          </div>

          {/* Invitation Code Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <KeyRound className="h-5 w-5 text-indigo-500" />
                Enter Invitation Code
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleValidate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="inv-code">Invitation Code</Label>
                  <Input
                    id="inv-code"
                    placeholder="inv-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    value={invCode}
                    onChange={(e) => setInvCode(e.target.value)}
                    disabled={isValidating}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inv-email">Email</Label>
                  <Input
                    id="inv-email"
                    type="email"
                    placeholder="your@email.com"
                    value={invEmail}
                    onChange={(e) => setInvEmail(e.target.value)}
                    disabled={isValidating}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isValidating}>
                  {isValidating ? "Validating..." : "Enter Platform"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Login Section */}
          <Card>
            <button
              type="button"
              className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-muted/50 rounded-lg transition-colors"
              onClick={() => setShowLogin(!showLogin)}
            >
              <span className="flex items-center gap-2 font-medium">
                <LogIn className="h-5 w-5 text-indigo-500" />
                I already have login data
              </span>
              {showLogin ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showLogin && (
              <CardContent className="pt-0">
                <LoginForm onClose={() => setShowLogin(false)} />
              </CardContent>
            )}
          </Card>

          {/* Application Section */}
          <Card>
            <button
              type="button"
              className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-muted/50 rounded-lg transition-colors"
              onClick={() => setShowApply(!showApply)}
            >
              <span className="flex items-center gap-2 font-medium">
                <FileText className="h-5 w-5 text-indigo-500" />
                I don't have a code
              </span>
              {showApply ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showApply && (
              <CardContent className="pt-0">
                <CardDescription className="mb-4">
                  Apply to become an alpha user. We'll review your application and send you an invitation code if accepted.
                </CardDescription>
                <form onSubmit={handleApply} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="app-first">First name *</Label>
                      <Input
                        id="app-first"
                        value={appFirstName}
                        onChange={(e) => setAppFirstName(e.target.value)}
                        disabled={isApplying}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="app-last">Last name *</Label>
                      <Input
                        id="app-last"
                        value={appLastName}
                        onChange={(e) => setAppLastName(e.target.value)}
                        disabled={isApplying}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="app-email">Email *</Label>
                    <Input
                      id="app-email"
                      type="email"
                      placeholder="your@email.com"
                      value={appEmail}
                      onChange={(e) => setAppEmail(e.target.value)}
                      disabled={isApplying}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="app-motivation">Why do you want to join Crowdly?</Label>
                    <Textarea
                      id="app-motivation"
                      placeholder="Tell us about yourself and why you'd like to join..."
                      value={appMotivation}
                      onChange={(e) => setAppMotivation(e.target.value)}
                      disabled={isApplying}
                      rows={4}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isApplying}>
                    {isApplying ? "Sending..." : "Send Application"}
                  </Button>
                </form>
              </CardContent>
            )}
          </Card>
        </div>
      </main>
      <CrowdlyFooter />
    </div>
  );
};

export default AlphaGate;
