import React, { useEffect, useState } from "react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Save, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

// Use same-origin API base in development; dev server proxies to backend.
// In production, VITE_API_BASE_URL can point at the deployed API.
const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

type Branch = {
  id: number;
  chapter_id: string;
  parent_paragraph_index: number;
  parent_paragraph_text: string | null;
  branch_text: string;
  created_at: string;
  user_id: string | null;
  chapter_title?: string;
};

interface StoryBranchListProps {
  storyId: string;
}

const StoryBranchList: React.FC<StoryBranchListProps> = ({ storyId }) => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editBranchText, setEditBranchText] = useState("");
  const [editBranchName, setEditBranchName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chapterInfo, setChapterInfo] = useState<{ chapterIds: string[], chaptersFetched: boolean }>({ chapterIds: [], chaptersFetched: false });
  const { user } = useAuth();
  const { toast } = useToast();

  // Fetch all branches for the story on mount (from backend API instead of Supabase)
  useEffect(() => {
    let isMounted = true;
    const fetchBranches = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${API_BASE}/stories/${storyId}/branches`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error('[StoryBranchList] Failed to fetch branches', { status: res.status, body });
          setError('Failed to fetch branches.');
          setBranches([]);
          setLoading(false);
          setChapterInfo({ chapterIds: [], chaptersFetched: false });
          return;
        }
        const data = await res.json();
        if (!isMounted) return;
        const arr = Array.isArray(data) ? data : [];
        const chapterIds = Array.from(new Set(arr.map((b: any) => b.chapter_id)));
        setChapterInfo({ chapterIds, chaptersFetched: true });
        setBranches(arr);
        if (!arr.length) {
          setError('No paragraph branches found for chapters in this story.');
        }
      } catch (err) {
        console.error('[StoryBranchList] Failed to fetch branches', err);
        setError('Failed to fetch branches.');
        setBranches([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (storyId) {
      fetchBranches();
    }
    return () => {
      isMounted = false;
    };
  }, [storyId]);

  const handleEdit = (branch: Branch) => {
    setEditId(branch.id);
    setEditBranchText(branch.branch_text);
    setEditBranchName(branch.parent_paragraph_text);
  };

  const handleCancel = () => {
    setEditId(null);
    setEditBranchText("");
    setEditBranchName("");
  };

  const handleSave = async (branch: Branch) => {
    try {
      const res = await fetch(`${API_BASE}/paragraph-branches/${branch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchText: editBranchText,
          parentParagraphText: editBranchName,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error('[StoryBranchList] Failed to update branch', { status: res.status, body });
        setError('Failed to update branch.');
        toast({ title: 'Error', description: 'Failed to update branch.', variant: 'destructive' });
        return;
      }
      const updated = await res.json();
      setBranches(b =>
        b.map(item =>
          item.id === branch.id
            ? { ...item, branch_text: updated.branch_text, parent_paragraph_text: updated.parent_paragraph_text }
            : item
        )
      );
      toast({ title: 'Branch updated', description: 'Saved branch changes.' });
      setEditId(null);
      setEditBranchText("");
      setEditBranchName("");
      setError(null);
    } catch (err) {
      console.error('[StoryBranchList] Failed to update branch', err);
      setError('Failed to update branch.');
      toast({ title: 'Error', description: 'Failed to update branch.', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE}/paragraph-branches/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        console.error('[StoryBranchList] Failed to delete branch', { status: res.status, body });
        setError('Failed to delete branch.');
        toast({ title: 'Error', description: 'Failed to delete branch.', variant: 'destructive' });
        return;
      }
      setBranches(b => b.filter(item => item.id !== id));
      toast({ title: 'Branch deleted' });
      setDeleteId(null);
      setError(null);
    } catch (err) {
      console.error('[StoryBranchList] Failed to delete branch', err);
      setError('Failed to delete branch.');
      toast({ title: 'Error', description: 'Failed to delete branch.', variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardTitle className="text-base p-3 border-b bg-gradient-to-r from-pink-50 to-blue-50 dark:from-slate-800 dark:to-blue-900/40">
        Branches for this Story
      </CardTitle>
      <CardContent>
        {error && (
          <div className="text-red-500 text-xs mb-2">{error}</div>
        )}
        {loading ? (
          <div className="py-8 text-center text-gray-400 text-sm">Loading branches...</div>
        ) : chapterInfo.chaptersFetched && chapterInfo.chapterIds.length === 0 ? (
          <div className="py-8 text-center text-gray-500 text-sm">
            <div>This story currently has <b>no chapters</b>.</div>
            <div className="text-xs text-gray-400 mt-2">Add a chapter before you can see branches.</div>
          </div>
        ) : branches.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">
            No branches found for this story's chapters.<br />
            <span className="text-xs text-gray-400">
              (If you believe branches exist, please check Console logs for details below.)
            </span>
          </div>
        ) : (
          <div className="divide-y">
            {branches.map((branch) => (
              <div key={branch.id} className="py-3 flex flex-col gap-1 md:flex-row md:justify-between md:items-center relative">
                {editId === branch.id ? (
                  <div className="flex-1 flex flex-col md:flex-row md:items-center gap-2">
                    <Input
                      className="flex-1"
                      value={editBranchName}
                      onChange={e => setEditBranchName(e.target.value)}
                      placeholder="Branch name"
                      maxLength={120}
                    />
                    <Input
                      className="flex-1"
                      value={editBranchText}
                      onChange={e => setEditBranchText(e.target.value)}
                      placeholder="Branch text"
                      maxLength={400}
                    />
                    <Button size="sm" variant="ghost" onClick={() => handleSave(branch)}>
                      <Save className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleCancel}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex-1">
                    <div className="font-semibold text-sm mb-1 truncate">
                      {branch.parent_paragraph_text || <span className="italic text-gray-400">Unnamed branch</span>}
                    </div>
                    <div className="text-xs text-gray-700 dark:text-gray-300 mb-1 truncate">
                      {branch.branch_text}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {new Date(branch.created_at).toLocaleString()}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-1 mt-2 md:mt-0">
                  {user?.id && branch.user_id === user.id && editId !== branch.id && (
                    <>
                      <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => handleEdit(branch)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => setDeleteId(branch.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
                {/* Confirm Delete Dialog Inline */}
                {deleteId === branch.id && (
                  <div className="absolute left-0 right-0 top-full mt-2 z-30 bg-white shadow border rounded p-4 flex flex-col gap-2 text-center">
                    <div className="text-sm">Delete this branch?</div>
                    <div className="flex justify-center gap-2">
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(branch.id)}>Delete</Button>
                      <Button size="sm" variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default StoryBranchList;
