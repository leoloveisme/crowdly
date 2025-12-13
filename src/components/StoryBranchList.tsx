import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Save, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

type Branch = {
  id: string;
  chapter_id: string;
  parent_paragraph_index: number;
  parent_paragraph_text: string;
  branch_text: string;
  created_at: string;
  user_id: string;
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

  // Fetch all branches for the story on mount
  useEffect(() => {
    let isMounted = true;
    const fetchBranches = async () => {
      setLoading(true);
      setError(null);

      console.log("[BranchList] For StoryId: ", storyId);

      // Fetch all chapters for this story to find chapter_ids
      const { data: chapters, error: chaptersError } = await supabase
        .from("stories")
        .select("chapter_id, chapter_title")
        .eq("story_title_id", storyId);

      if (chaptersError) {
        setError("Failed to fetch chapters for this story.");
        setBranches([]);
        setLoading(false);
        setChapterInfo({ chapterIds: [], chaptersFetched: false });
        return;
      }

      const chapterIds = chapters.map((c: { chapter_id: string }) => c.chapter_id);
      setChapterInfo({ chapterIds, chaptersFetched: true });
      console.log("[BranchList] Fetched chapterIds:", chapterIds);

      if (chapterIds.length === 0) {
        setBranches([]);
        setLoading(false);
        return;
      }

      // Fetch all paragraph branches for those chapters
      const { data, error } = await supabase
        .from("paragraph_branches")
        .select("*")
        .in("chapter_id", chapterIds)
        .order("created_at", { ascending: false });

      if (error) {
        setError("Failed to fetch branches.");
        setBranches([]);
        console.log("[BranchList] Error fetching branches:", error);
      } else if (data && isMounted) {
        setBranches(data);
        console.log("[BranchList] Fetched branches:", data);
        if (!data.length) {
          // Show diagnostic in the UI
          setError("No paragraph branches found for chapters in this story. (Check database links!)");
        }
      }
      setLoading(false);
    };

    fetchBranches();
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
    const { error } = await supabase
      .from("paragraph_branches")
      .update({
        branch_text: editBranchText,
        parent_paragraph_text: editBranchName,
      })
      .eq("id", branch.id);
    if (error) {
      setError("Failed to update branch.");
      toast({ title: "Error", description: "Failed to update branch.", variant: "destructive" });
    } else {
      setBranches(b =>
        b.map(item =>
          item.id === branch.id
            ? { ...item, branch_text: editBranchText, parent_paragraph_text: editBranchName }
            : item
        )
      );
      toast({ title: "Branch updated", description: "Saved branch changes." });
      setEditId(null);
      setEditBranchText("");
      setEditBranchName("");
      setError(null);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("paragraph_branches")
      .delete()
      .eq("id", id);
    if (error) {
      setError("Failed to delete branch.");
      toast({ title: "Error", description: "Failed to delete branch.", variant: "destructive" });
    } else {
      setBranches(b => b.filter(item => item.id !== id));
      toast({ title: "Branch deleted" });
      setDeleteId(null);
      setError(null);
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
