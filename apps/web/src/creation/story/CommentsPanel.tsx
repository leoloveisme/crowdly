import React, { useCallback, useEffect, useState } from "react";
import EditableText from "@/components/EditableText";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { MessageSquare } from "lucide-react";
import { listComments, postComment, type Comment } from "@web/lib/collab";

// Comments on the open chapter (same /comments rows the platform shows).
export const CommentsPanel: React.FC<{ storyId: string; chapterId: string | null; userId?: string }> = ({ storyId, chapterId, userId }) => {
  const [all, setAll] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const load = useCallback(() => listComments(storyId).then((c) => setAll(Array.isArray(c) ? c : [])), [storyId]);
  useEffect(() => {
    load();
  }, [load]);
  const shown = all.filter((c) => !chapterId || !c.chapter_id || c.chapter_id === chapterId);

  const send = async () => {
    if (!userId || !text.trim()) return;
    try {
      await postComment(userId, storyId, chapterId, text.trim());
      setText("");
      load();
    } catch (err) {
      toast({ title: "Couldn't post the comment", description: (err as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="flex h-full flex-col text-sm">
      <div className="flex items-center gap-1 border-b px-2 py-1.5 font-medium">
        <MessageSquare className="h-4 w-4" />
        <EditableText id="webapp-comments-title">Comments</EditableText>
      </div>
      <ul className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
        {shown.length === 0 && (
          <li className="text-muted-foreground">
            <EditableText id="webapp-comments-empty">No comments yet.</EditableText>
          </li>
        )}
        {shown.map((c) => (
          <li key={c.id} className="rounded border p-2">
            <p className="text-xs text-muted-foreground">
              {c.username || c.author_email || c.email || ""} · {new Date(c.created_at).toLocaleString()}
            </p>
            <p className="whitespace-pre-wrap">{c.body}</p>
          </li>
        ))}
      </ul>
      {userId && (
        <div className="space-y-1 border-t p-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Write a comment" />
          <Button size="sm" className="h-7" onClick={send} disabled={!text.trim()}>
            <EditableText id="webapp-comments-send">Post</EditableText>
          </Button>
        </div>
      )}
    </div>
  );
};
