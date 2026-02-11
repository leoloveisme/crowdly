import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Eye, EyeOff, Trash2, UserPlus, ArrowUpDown, ChevronDown } from "lucide-react";

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

type Invitation = {
  id: string;
  invitation_code: string;
  first_name: string;
  last_name: string;
  email: string;
  invited_at: string;
  joined_at: string | null;
  status: string;
};

type Application = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  motivation_letter: string | null;
  status: string;
  created_at: string;
};

const PAGE_SIZES = [10, 20, 50, 100];

const InviteUsers = () => {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();

  // Create invitation form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Invitations table state
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [invTotal, setInvTotal] = useState(0);
  const [invSortBy, setInvSortBy] = useState("invited_at");
  const [invSortOrder, setInvSortOrder] = useState<"asc" | "desc">("desc");
  const [invPageSize, setInvPageSize] = useState(10);
  const [invPage, setInvPage] = useState(0);
  const [revealedCodes, setRevealedCodes] = useState<Set<string>>(new Set());

  // Applications table state
  const [applications, setApplications] = useState<Application[]>([]);
  const [expandedLetters, setExpandedLetters] = useState<Set<string>>(new Set());

  // Access check
  useEffect(() => {
    if (!user || !hasRole("platform_admin")) {
      navigate("/", { replace: true });
    }
  }, [user, hasRole, navigate]);

  const fetchInvitations = useCallback(async () => {
    if (!user) return;
    try {
      const params = new URLSearchParams({
        userId: user.id,
        sortBy: invSortBy,
        sortOrder: invSortOrder,
        limit: String(invPageSize),
        offset: String(invPage * invPageSize),
      });
      const res = await fetch(`${API_BASE}/admin/invitations?${params}`);
      if (res.ok) {
        const data = await res.json();
        setInvitations(data.invitations);
        setInvTotal(data.total);
      }
    } catch (err) {
      console.error("Failed to fetch invitations:", err);
    }
  }, [user, invSortBy, invSortOrder, invPageSize, invPage]);

  const fetchApplications = useCallback(async () => {
    if (!user) return;
    try {
      const params = new URLSearchParams({ userId: user.id });
      const res = await fetch(`${API_BASE}/admin/applications?${params}`);
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications);
      }
    } catch (err) {
      console.error("Failed to fetch applications:", err);
    }
  }, [user]);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const handleSort = (col: string) => {
    if (invSortBy === col) {
      setInvSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setInvSortBy(col);
      setInvSortOrder("asc");
    }
    setInvPage(0);
  };

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName || !email || !user) return;
    setIsCreating(true);
    try {
      const res = await fetch(`${API_BASE}/admin/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, firstName, lastName, email }),
      });
      if (res.ok) {
        toast({ title: "Invitation created", description: `Invitation sent to ${email}` });
        setFirstName("");
        setLastName("");
        setEmail("");
        fetchInvitations();
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: "Error", description: data.error || "Failed to create invitation", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to create invitation", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteInvitation = async (id: string) => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE}/admin/invitations/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      if (res.ok) {
        toast({ title: "Deleted", description: "Invitation revoked and deleted" });
        fetchInvitations();
      }
    } catch {
      toast({ title: "Error", description: "Failed to delete invitation", variant: "destructive" });
    }
  };

  const handleInviteFromApplication = async (id: string) => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE}/admin/applications/${id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      if (res.ok) {
        toast({ title: "Invited", description: "Application converted to invitation" });
        fetchApplications();
        fetchInvitations();
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: "Error", description: data.error || "Failed to invite", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to invite from application", variant: "destructive" });
    }
  };

  const handleDeleteApplication = async (id: string) => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE}/admin/applications/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      if (res.ok) {
        toast({ title: "Deleted", description: "Application deleted" });
        fetchApplications();
      }
    } catch {
      toast({ title: "Error", description: "Failed to delete application", variant: "destructive" });
    }
  };

  const toggleRevealCode = (id: string) => {
    setRevealedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpandLetter = (id: string) => {
    setExpandedLetters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalPages = Math.ceil(invTotal / invPageSize);

  const SortHeader = ({ col, label }: { col: string; label: string }) => (
    <button
      type="button"
      className="flex items-center gap-1 font-medium text-xs uppercase tracking-wide hover:text-indigo-600"
      onClick={() => handleSort(col)}
    >
      {label}
      <ArrowUpDown className="h-3 w-3" />
    </button>
  );

  const PageSizeSelector = () => (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Per page:</span>
      {PAGE_SIZES.map((size) => (
        <button
          key={size}
          type="button"
          className={`px-2 py-1 rounded text-xs ${invPageSize === size ? "bg-indigo-100 text-indigo-700 font-medium" : "hover:bg-muted"}`}
          onClick={() => { setInvPageSize(size); setInvPage(0); }}
        >
          {size}
        </button>
      ))}
    </div>
  );

  if (!user || !hasRole("platform_admin")) return null;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-blue-50 via-sky-100 to-white dark:from-background dark:via-background/70 dark:to-background/90">
      <CrowdlyHeader />
      <main className="flex-grow container mx-auto max-w-6xl px-4 py-8">
        <h2 className="text-2xl font-bold mb-6">Alpha User Management</h2>

        <Tabs defaultValue="invitations">
          <TabsList className="mb-4">
            <TabsTrigger value="invitations">Invitations</TabsTrigger>
            <TabsTrigger value="applications">Applications</TabsTrigger>
          </TabsList>

          {/* Invitations Tab */}
          <TabsContent value="invitations" className="space-y-6">
            {/* Create Invitation Form */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Create Invitation</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateInvitation} className="flex flex-wrap gap-4 items-end">
                  <div className="space-y-1">
                    <Label htmlFor="inv-fn">First name</Label>
                    <Input id="inv-fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} required className="w-40" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="inv-ln">Last name</Label>
                    <Input id="inv-ln" value={lastName} onChange={(e) => setLastName(e.target.value)} required className="w-40" />
                  </div>
                  <div className="space-y-1 flex-1 min-w-[200px]">
                    <Label htmlFor="inv-email">Email</Label>
                    <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <Button type="submit" disabled={isCreating}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    {isCreating ? "Creating..." : "Create & Send Invite"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Invitations Table */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm text-muted-foreground">{invTotal} invitation{invTotal !== 1 ? "s" : ""} total</span>
                  <PageSizeSelector />
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2"><SortHeader col="first_name" label="First Name" /></th>
                        <th className="text-left p-2"><SortHeader col="last_name" label="Last Name" /></th>
                        <th className="text-left p-2"><SortHeader col="email" label="Email" /></th>
                        <th className="text-left p-2">Code</th>
                        <th className="text-left p-2"><SortHeader col="invited_at" label="Invited" /></th>
                        <th className="text-left p-2"><SortHeader col="joined_at" label="Joined" /></th>
                        <th className="text-left p-2"><SortHeader col="status" label="Status" /></th>
                        <th className="text-left p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invitations.map((inv) => (
                        <tr key={inv.id} className="border-b hover:bg-muted/30">
                          <td className="p-2">{inv.first_name}</td>
                          <td className="p-2">{inv.last_name}</td>
                          <td className="p-2">{inv.email}</td>
                          <td className="p-2">
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-xs">
                                {revealedCodes.has(inv.id) ? inv.invitation_code : "••••••••••••"}
                              </span>
                              <button type="button" onClick={() => toggleRevealCode(inv.id)} className="text-muted-foreground hover:text-foreground">
                                {revealedCodes.has(inv.id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </td>
                          <td className="p-2 text-xs">{new Date(inv.invited_at).toLocaleDateString()}</td>
                          <td className="p-2 text-xs">{inv.joined_at ? new Date(inv.joined_at).toLocaleDateString() : "—"}</td>
                          <td className="p-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              inv.status === "joined" ? "bg-green-100 text-green-700" :
                              inv.status === "revoked" ? "bg-red-100 text-red-700" :
                              "bg-yellow-100 text-yellow-700"
                            }`}>
                              {inv.status}
                            </span>
                          </td>
                          <td className="p-2">
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteInvitation(inv.id)} className="h-8 w-8 text-red-500 hover:text-red-700">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {invitations.length === 0 && (
                        <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No invitations yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-between items-center mt-4">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={invPage === 0} onClick={() => setInvPage((p) => p - 1)}>Previous</Button>
                      <Button variant="outline" size="sm" disabled={invPage >= totalPages - 1} onClick={() => setInvPage((p) => p + 1)}>Next</Button>
                    </div>
                    <span className="text-sm text-muted-foreground">Page {invPage + 1} of {totalPages}</span>
                    <PageSizeSelector />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Applications Tab */}
          <TabsContent value="applications">
            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">First Name</th>
                        <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Last Name</th>
                        <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Email</th>
                        <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Motivation</th>
                        <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Status</th>
                        <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Applied</th>
                        <th className="text-left p-2 font-medium text-xs uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {applications.map((app) => (
                        <React.Fragment key={app.id}>
                          <tr className="border-b hover:bg-muted/30">
                            <td className="p-2">{app.first_name}</td>
                            <td className="p-2">{app.last_name}</td>
                            <td className="p-2">{app.email}</td>
                            <td className="p-2">
                              {app.motivation_letter ? (
                                <Button variant="ghost" size="sm" onClick={() => toggleExpandLetter(app.id)} className="h-7 text-xs">
                                  {expandedLetters.has(app.id) ? "Hide" : "Show"}
                                  <ChevronDown className={`ml-1 h-3 w-3 transition-transform ${expandedLetters.has(app.id) ? "rotate-180" : ""}`} />
                                </Button>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                            <td className="p-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                app.status === "invited" ? "bg-green-100 text-green-700" :
                                app.status === "rejected" ? "bg-red-100 text-red-700" :
                                "bg-yellow-100 text-yellow-700"
                              }`}>
                                {app.status}
                              </span>
                            </td>
                            <td className="p-2 text-xs">{new Date(app.created_at).toLocaleDateString()}</td>
                            <td className="p-2">
                              <div className="flex gap-1">
                                {app.status === "pending" && (
                                  <Button variant="outline" size="sm" onClick={() => handleInviteFromApplication(app.id)} className="h-7 text-xs">
                                    <UserPlus className="h-3 w-3 mr-1" /> Invite
                                  </Button>
                                )}
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteApplication(app.id)} className="h-7 w-7 text-red-500 hover:text-red-700">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {expandedLetters.has(app.id) && app.motivation_letter && (
                            <tr>
                              <td colSpan={7} className="p-4 bg-muted/20">
                                <p className="text-sm whitespace-pre-wrap">{app.motivation_letter}</p>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                      {applications.length === 0 && (
                        <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No applications yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      <CrowdlyFooter />
    </div>
  );
};

export default InviteUsers;
