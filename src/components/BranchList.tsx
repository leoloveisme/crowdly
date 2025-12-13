
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Save, X } from "lucide-react";

type Branch = {
  id: string;
  chapter_id: string;
  parent_paragraph_index: number;
  parent_paragraph_text: string;
  branch_text: string;
  created_at: string;
};

interface BranchListProps {
  className?: string;
}

const BranchList: React.FC<BranchListProps> = ({ className }) => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editBranchText, setEditBranchText] = useState("");
  const [editBranchName, setEditBranchName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch all paragraph branches on mount
  useEffect(() => {
    let isMounted = true;
    const fetchBranches = async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("paragraph_branches")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        setError("Failed to fetch branches.");
        setBranches([]);
      } else if (data && isMounted) {
        setBranches(data);
      }
      setLoading(false);
    };
    fetchBranches();
    return () => {
      isMounted = false;
    };
  }, []);

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
    } else {
      setBranches(b =>
        b.map(item =>
          item.id === branch.id
            ? { ...item, branch_text: editBranchText, parent_paragraph_text: editBranchName }
            : item
        )
      );
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
    } else {
      setBranches(b => b.filter(item => item.id !== id));
      setDeleteId(null);
      setError(null);
    }
  };

  return (
    <Card className={className}>
      <CardTitle className="text-base p-3 border-b bg-gradient-to-r from-pink-50 to-blue-50 dark:from-slate-800 dark:to-blue-900/40">
        Branches
      </CardTitle>
      <CardContent>
        {error && (
          <div className="text-red-500 text-xs mb-2">{error}</div>
        )}
        {loading ? (
          <div className="py-8 text-center text-gray-400 text-sm">Loading branches...</div>
        ) : branches.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">No branches found.</div>
        ) : (
          <div className="divide-y">
            {branches.map((branch) => (
              <div key={branch.id} className="py-3 flex flex-col gap-1 md:flex-row md:justify-between md:items-center">
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
                  {editId !== branch.id && (
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

export default BranchList;
