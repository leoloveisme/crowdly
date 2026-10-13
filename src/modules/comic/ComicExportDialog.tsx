import React, { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import EditableText from "@/components/EditableText";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import type { ComicIssue, ComicPage } from "@/lib/comicsApi";

interface ComicExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  issues: ComicIssue[];
  pages: ComicPage[];
}

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "comic";

async function loadImage(url: string): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Could not download ${url}`);
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
  return { blob, dataUrl, width, height };
}

const download = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Exports the comic's pages, in reading order, as a PDF or a CBZ archive. */
const ComicExportDialog: React.FC<ComicExportDialogProps> = ({ open, onOpenChange, title, issues, pages }) => {
  const [busy, setBusy] = useState<"pdf" | "cbz" | null>(null);

  const ordered = issues.flatMap((issue) =>
    pages.filter((p) => p.issue_id === issue.issue_id).sort((a, b) => a.page_index - b.page_index),
  );

  const exportPdf = async () => {
    setBusy("pdf");
    try {
      const { jsPDF } = await import("jspdf");
      let doc: InstanceType<typeof jsPDF> | null = null;
      for (const page of ordered) {
        const img = await loadImage(page.image_url);
        const orientation = img.width > img.height ? "landscape" : "portrait";
        if (!doc) doc = new jsPDF({ orientation, unit: "px", format: [img.width, img.height] });
        else doc.addPage([img.width, img.height], orientation);
        const format = img.blob.type.includes("png") ? "PNG" : img.blob.type.includes("webp") ? "WEBP" : "JPEG";
        doc.addImage(img.dataUrl, format, 0, 0, img.width, img.height);
      }
      if (doc) download(doc.output("blob"), `${safeName(title)}.pdf`);
    } catch (err) {
      toast({ title: "Export failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const exportCbz = async () => {
    setBusy("cbz");
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      let n = 1;
      for (const page of ordered) {
        const img = await loadImage(page.image_url);
        const ext = img.blob.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
        zip.file(`${String(n).padStart(4, "0")}.${ext}`, img.blob);
        n += 1;
      }
      download(await zip.generateAsync({ type: "blob" }), `${safeName(title)}.cbz`);
    } catch (err) {
      toast({ title: "Export failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <EditableText id="comic-export-title">Export comic</EditableText>
          </DialogTitle>
          <DialogDescription>
            <EditableText id="comic-export-desc">All published pages, issue by issue, in reading order.</EditableText>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-3">
          {(["pdf", "cbz"] as const).map((format) => (
            <button
              key={format}
              type="button"
              disabled={!!busy || ordered.length === 0}
              onClick={format === "pdf" ? exportPdf : exportCbz}
              className="inline-flex items-center gap-2 px-4 py-2 rounded border text-sm hover:bg-gray-50 disabled:opacity-60"
            >
              {busy === format ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {format === "pdf" ? (
                <EditableText id="comic-export-pdf">PDF</EditableText>
              ) : (
                <EditableText id="comic-export-cbz">Comic book archive (CBZ)</EditableText>
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ComicExportDialog;
