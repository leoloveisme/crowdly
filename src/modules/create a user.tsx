import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Eye, EyeOff } from "lucide-react";

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !email.trim() || !password.trim()) {
      toast({ title: "Error", description: "Email and password are required", variant: "destructive" });
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
        <CardTitle>Create User</CardTitle>
        <CardDescription>Add a new user to the platform.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
          <div className="space-y-1">
            <Label htmlFor="create-fn">First Name</Label>
            <Input id="create-fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="create-ln">Last Name</Label>
            <Input id="create-ln" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="create-email">Email</Label>
            <Input id="create-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="create-pw">Password</Label>
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
            <Label>Roles</Label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={isUiTranslator} onCheckedChange={(v) => setIsUiTranslator(v === true)} />
                <span className="text-sm">UI Translator</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={isPlatformSupporter} onCheckedChange={(v) => setIsPlatformSupporter(v === true)} />
                <span className="text-sm">Platform Support</span>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">If no role is checked, the user is created as a regular consumer.</p>
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Adding..." : "Add"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default CreateUser;
