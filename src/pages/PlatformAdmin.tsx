import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  Users,
  Settings,
  BarChart3,
  UserPlus,
  ArrowUpDown,
  Pencil,
  Trash2,
  Ban,
  Mail,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import CreateUser from "@/modules/create a user";

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

type AdminUser = {
  id: string;
  email: string;
  created_at: string;
  is_banned: boolean;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  nickname: string | null;
  roles: string[];
  is_initiator: boolean;
  is_owner: boolean;
  is_contributor: boolean;
  is_author: boolean;
};

const STORY_ROLE_COLORS: Record<string, string> = {
  initiator: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  owner: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  contributor: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  author: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};

const PLATFORM_ROLE_COLORS: Record<string, string> = {
  platform_admin: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  platform_supporter: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  ui_translator: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  consumer: "bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400",
};

const PAGE_SIZES = [20, 50, 100, 0]; // 0 = All
const PAGE_SIZE_LABELS: Record<number, string> = { 0: "All", 20: "20", 50: "50", 100: "100" };

const PlatformAdmin = () => {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();

  // User table state
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState("email");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");

  // Edit dialog
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Message dialog
  const [messageUser, setMessageUser] = useState<AdminUser | null>(null);
  const [msgSubject, setMsgSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [isSendingMsg, setIsSendingMsg] = useState(false);

  // Delete confirmation
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!user || !hasRole("platform_admin")) {
      navigate("/", { replace: true });
    }
  }, [user, hasRole, navigate]);

  const fetchUsers = useCallback(async () => {
    if (!user) return;
    try {
      const params = new URLSearchParams({
        userId: user.id,
        sortBy,
        sortOrder,
        limit: String(pageSize),
        offset: String(page * (pageSize || 1)),
      });
      if (searchQuery) {
        params.set("search", searchQuery);
      }
      const res = await fetch(`${API_BASE}/admin/users?${params}`);
      if (res.ok) {
        const data = await res.json();
        // Normalize roles: PostgreSQL ARRAY() may return a string like "{role1,role2}"
        const normalized = (data.users || []).map((u: AdminUser) => ({
          ...u,
          roles: Array.isArray(u.roles)
            ? u.roles
            : typeof u.roles === "string"
            ? (u.roles as string).replace(/^\{|\}$/g, "").split(",").filter(Boolean)
            : [],
        }));
        setUsers(normalized);
        setTotal(data.total);
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
    }
  }, [user, sortBy, sortOrder, pageSize, page, searchQuery]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortOrder("asc");
    }
    setPage(0);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput.trim());
    setPage(0);
  };

  const clearSearch = () => {
    setSearchInput("");
    setSearchQuery("");
    setPage(0);
  };

  // --- Edit user ---
  const openEdit = (u: AdminUser) => {
    setEditUser(u);
    setEditFirstName(u.first_name || "");
    setEditLastName(u.last_name || "");
    setEditEmail(u.email);
    setEditUsername(u.username || "");
  };

  const handleSaveEdit = async () => {
    if (!user || !editUser) return;
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/admin/users/${editUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          first_name: editFirstName,
          last_name: editLastName,
          email: editEmail,
          username: editUsername,
        }),
      });
      if (res.ok) {
        toast({ title: "User updated", description: `${editEmail} has been updated.` });
        setEditUser(null);
        fetchUsers();
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: "Error", description: data.error || "Failed to update user", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to update user", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // --- Ban / Unban ---
  const handleToggleBan = async (u: AdminUser) => {
    if (!user) return;
    if (u.id === user.id) {
      toast({ title: "Error", description: "You cannot ban yourself", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/admin/users/${u.id}/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, banned: !u.is_banned }),
      });
      if (res.ok) {
        toast({
          title: u.is_banned ? "User unbanned" : "User banned",
          description: `${u.email} has been ${u.is_banned ? "unbanned" : "banned"}.`,
        });
        fetchUsers();
      }
    } catch {
      toast({ title: "Error", description: "Failed to update ban status", variant: "destructive" });
    }
  };

  // --- Delete ---
  const handleConfirmDelete = async () => {
    if (!user || !deleteUser) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/admin/users/${deleteUser.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      if (res.ok) {
        toast({ title: "User deleted", description: `${deleteUser.email} has been deleted.` });
        setDeleteUser(null);
        fetchUsers();
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: "Error", description: data.error || "Failed to delete user", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to delete user", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  // --- Send message ---
  const openMessage = (u: AdminUser) => {
    setMessageUser(u);
    setMsgSubject("");
    setMsgBody("");
  };

  const handleSendMessage = async () => {
    if (!user || !messageUser) return;
    if (!msgSubject.trim() && !msgBody.trim()) {
      toast({ title: "Error", description: "Please enter a subject or message body", variant: "destructive" });
      return;
    }
    setIsSendingMsg(true);
    try {
      const res = await fetch(`${API_BASE}/admin/users/${messageUser.id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, subject: msgSubject, body: msgBody }),
      });
      if (res.ok) {
        toast({ title: "Message sent", description: `Message sent to ${messageUser.email}.` });
        setMessageUser(null);
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: "Error", description: data.error || "Failed to send message", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to send message", variant: "destructive" });
    } finally {
      setIsSendingMsg(false);
    }
  };

  const totalPages = pageSize === 0 ? 1 : Math.ceil(total / pageSize);

  const SortHeader = ({ col, label }: { col: string; label: string }) => (
    <button
      type="button"
      className="flex items-center gap-1 font-medium text-xs uppercase tracking-wide hover:text-indigo-600"
      onClick={() => handleSort(col)}
    >
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortBy === col ? "text-indigo-600" : ""}`} />
    </button>
  );

  if (!user || !hasRole("platform_admin")) return null;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-blue-50 via-sky-100 to-white dark:from-background dark:via-background/70 dark:to-background/90">
      <CrowdlyHeader />
      <main className="flex-grow container mx-auto max-w-6xl px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Platform Administration</h2>
          <Button variant="outline" asChild>
            <Link to="/admin/invite-users">
              <UserPlus className="h-4 w-4 mr-2" /> Invite Users
            </Link>
          </Button>
        </div>

        <Tabs defaultValue="users">
          <TabsList className="mb-4">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" /> User Management
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" /> Platform Settings
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Analytics
            </TabsTrigger>
          </TabsList>

          {/* User Management Tab */}
          <TabsContent value="users">
            <CreateUser onUserCreated={fetchUsers} />
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>Manage platform users — list, edit, ban, delete, and send messages.</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Search & Page Size Controls */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-4">
                  <form onSubmit={handleSearch} className="flex items-center gap-2">
                    <div className="relative">
                      <Input
                        type="text"
                        placeholder="Search users..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        className="w-64 pl-9"
                      />
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    </div>
                    <Button type="submit" size="sm" variant="outline">Search</Button>
                    {searchQuery && (
                      <Button type="button" size="sm" variant="ghost" onClick={clearSearch}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </form>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">{total} user{total !== 1 ? "s" : ""}</span>
                    <Select
                      value={String(pageSize)}
                      onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZES.map((size) => (
                          <SelectItem key={size} value={String(size)}>
                            {PAGE_SIZE_LABELS[size]} per page
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Users Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2"><SortHeader col="first_name" label="First Name" /></th>
                        <th className="text-left p-2"><SortHeader col="last_name" label="Last Name" /></th>
                        <th className="text-left p-2"><SortHeader col="email" label="Email" /></th>
                        <th className="text-left p-2"><SortHeader col="username" label="Page Name" /></th>
                        <th className="text-left p-2">Roles</th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className={`border-b hover:bg-muted/30 ${u.is_banned ? "bg-red-50/50 dark:bg-red-900/10" : ""}`}>
                          <td className="p-2">{u.first_name || <span className="text-muted-foreground italic">—</span>}</td>
                          <td className="p-2">{u.last_name || <span className="text-muted-foreground italic">—</span>}</td>
                          <td className="p-2">{u.email}</td>
                          <td className="p-2">
                            {u.username && u.username !== u.email ? (
                              <Link to={`/${encodeURIComponent(u.username)}`} className="text-indigo-600 hover:underline">
                                {u.username}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground italic">not set</span>
                            )}
                          </td>
                          <td className="p-2">
                            <div className="flex flex-wrap gap-1">
                              {u.roles.map((role) => (
                                <span
                                  key={role}
                                  className={`text-xs px-1.5 py-0.5 rounded ${PLATFORM_ROLE_COLORS[role] || "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"}`}
                                >
                                  {role}
                                </span>
                              ))}
                              {u.is_initiator && (
                                <span className={`text-xs px-1.5 py-0.5 rounded ${STORY_ROLE_COLORS.initiator}`}>initiator</span>
                              )}
                              {u.is_owner && (
                                <span className={`text-xs px-1.5 py-0.5 rounded ${STORY_ROLE_COLORS.owner}`}>owner</span>
                              )}
                              {u.is_contributor && (
                                <span className={`text-xs px-1.5 py-0.5 rounded ${STORY_ROLE_COLORS.contributor}`}>contributor</span>
                              )}
                              {u.is_author && (
                                <span className={`text-xs px-1.5 py-0.5 rounded ${STORY_ROLE_COLORS.author}`}>author</span>
                              )}
                            </div>
                          </td>
                          <td className="p-2">
                            {u.is_banned ? (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Banned</span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Active</span>
                            )}
                          </td>
                          <td className="p-2">
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Edit user"
                                onClick={() => openEdit(u)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-8 w-8 ${u.is_banned ? "text-green-600 hover:text-green-700" : "text-orange-500 hover:text-orange-600"}`}
                                title={u.is_banned ? "Unban user" : "Ban user"}
                                onClick={() => handleToggleBan(u)}
                                disabled={u.id === user.id}
                              >
                                {u.is_banned ? <ShieldCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-blue-500 hover:text-blue-600"
                                title="Send message"
                                onClick={() => openMessage(u)}
                              >
                                <Mail className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-500 hover:text-red-700"
                                title="Delete user"
                                onClick={() => setDeleteUser(u)}
                                disabled={u.id === user.id}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {users.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-muted-foreground">
                            {searchQuery ? "No users match your search" : "No users found"}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-between items-center mt-4">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                        Previous
                      </Button>
                      <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                        Next
                      </Button>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      Page {page + 1} of {totalPages}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Platform Settings Tab */}
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Platform Settings</CardTitle>
                <CardDescription>Configure platform-wide settings and preferences.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Settings className="h-12 w-12 mb-4 opacity-30" />
                  <p className="text-lg font-medium">Platform settings coming soon</p>
                  <p className="text-sm mt-1">This section will allow you to configure platform-wide options.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics">
            <Card>
              <CardHeader>
                <CardTitle>Analytics</CardTitle>
                <CardDescription>Platform statistics and metrics overview.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mb-4 opacity-30" />
                  <p className="text-lg font-medium">Analytics coming soon</p>
                  <p className="text-sm mt-1">This section will display platform stats and metrics.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      <CrowdlyFooter />

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user profile information.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="edit-fn">First Name</Label>
              <Input id="edit-fn" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-ln">Last Name</Label>
              <Input id="edit-ln" value={editLastName} onChange={(e) => setEditLastName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-email">Email</Label>
              <Input id="edit-email" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-username">Profile Page Name</Label>
              <Input id="edit-username" value={editUsername} onChange={(e) => setEditUsername(e.target.value)} placeholder="Must be unique" />
              <p className="text-xs text-muted-foreground">This is the unique URL slug for the user's public profile page.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Message Dialog */}
      <Dialog open={!!messageUser} onOpenChange={(open) => !open && setMessageUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Message</DialogTitle>
            <DialogDescription>
              Send a message to {messageUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="msg-subject">Subject</Label>
              <Input id="msg-subject" value={msgSubject} onChange={(e) => setMsgSubject(e.target.value)} placeholder="Message subject" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="msg-body">Message</Label>
              <Textarea id="msg-body" value={msgBody} onChange={(e) => setMsgBody(e.target.value)} placeholder="Write your message..." rows={5} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMessageUser(null)}>Cancel</Button>
            <Button onClick={handleSendMessage} disabled={isSendingMsg}>
              {isSendingMsg ? "Sending..." : "Send Message"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete <strong>{deleteUser?.email}</strong>? This action cannot be undone. All of the user's data (profile, roles, messages) will be removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUser(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PlatformAdmin;
