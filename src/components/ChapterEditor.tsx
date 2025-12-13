
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import EditableText from "@/components/EditableText";

interface Paragraph {
  text: string;
}

interface Chapter {
  chapter_id: string;
  chapter_title: string;
  paragraphs: string[];
}

interface ChapterEditorProps {
  chapters: Chapter[];
  onCreate: (data: { chapter_title: string; paragraphs: string[] }) => Promise<void>;
  onUpdate: (chapter_id: string, patch: { chapter_title?: string; paragraphs?: string[] }) => Promise<void>;
  onDelete: (chapter_id: string) => Promise<void>;
}

const ChapterEditor: React.FC<ChapterEditorProps> = ({ chapters, onCreate, onUpdate, onDelete }) => {
  // State for Add Chapter Mode
  const [addMode, setAddMode] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newParagraphs, setNewParagraphs] = useState<string[]>([""]);

  const handleAddParagraphInput = () => setNewParagraphs(p => [...p, ""]);
  const handleParagraphChange = (i: number, val: string) =>
    setNewParagraphs(arr => arr.map((p, idx) => (idx === i ? val : p)));
  const handleRemoveParagraph = (i: number) =>
    setNewParagraphs(arr => arr.filter((_, idx) => idx !== i));

  const handleSaveChapter = async () => {
    if (!newTitle.trim()) return;
    await onCreate({ chapter_title: newTitle, paragraphs: newParagraphs });
    setNewTitle("");
    setNewParagraphs([""]);
    setAddMode(false);
  };

  // Inline edit state for chapters/paragraphs
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editChapterTitle, setEditChapterTitle] = useState("");
  const [editParagraphs, setEditParagraphs] = useState<string[]>([]);
  const startEdit = (c: Chapter, idx: number) => {
    setEditIndex(idx);
    setEditChapterTitle(c.chapter_title);
    setEditParagraphs(c.paragraphs);
  };
  const handleEditParagraphChange = (i: number, val: string) =>
    setEditParagraphs(arr => arr.map((p, idx) => (idx === i ? val : p)));
  const handleEditRemoveParagraph = (i: number) =>
    setEditParagraphs(arr => arr.filter((_, idx) => idx !== i));
  const handleEditAddParagraph = () => setEditParagraphs(pars => [...pars, ""]);
  const handleSaveEdit = async (chapter: Chapter) => {
    await onUpdate(chapter.chapter_id, {
      chapter_title: editChapterTitle,
      paragraphs: editParagraphs,
    });
    setEditIndex(null);
    setEditChapterTitle("");
    setEditParagraphs([]);
  };
  const handleCancelEdit = () => {
    setEditIndex(null);
    setEditChapterTitle("");
    setEditParagraphs([]);
  };

  return (
    <div className="w-full p-4 border rounded bg-white shadow-sm">
      <div className="font-bold mb-2 text-blue-700">Chapters</div>
      {/* --- List chapters --- */}
      {chapters.map((chap, i) => (
        <div key={chap.chapter_id} className="mb-4 border-b last:border-0 pb-2">
          {editIndex === i ? (
            <>
              <input
                type="text"
                value={editChapterTitle}
                onChange={e => setEditChapterTitle(e.target.value)}
                className="mb-2 border w-full rounded px-2 py-1"
                placeholder="Edit Chapter Title"
              />
              {editParagraphs.map((para, pi) => (
                <div key={pi} className="flex gap-1 mb-2 items-start">
                  <textarea
                    value={para}
                    onChange={e => {
                      handleEditParagraphChange(pi, e.target.value);
                      // Auto-resize textarea height
                      e.currentTarget.style.height = 'auto';
                      e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
                    }}
                    className="border w-full rounded px-2 py-1 text-sm resize-none overflow-hidden"
                    placeholder={`Paragraph ${pi + 1}`}
                    rows={1}
                  />
                  <Button size="sm" variant="ghost" type="button" onClick={() => handleEditRemoveParagraph(pi)}>-</Button>
                </div>
              ))}
              <Button size="sm" variant="secondary" type="button" onClick={handleEditAddParagraph}>+ Add Paragraph</Button>
              <div className="mt-2 flex gap-2">
                <Button size="sm" type="button" onClick={() => handleSaveEdit(chap)}>Save</Button>
                <Button size="sm" variant="ghost" type="button" onClick={handleCancelEdit}>Cancel</Button>
                <Button size="sm" variant="destructive" type="button" onClick={() => onDelete(chap.chapter_id)}>Delete</Button>
              </div>
            </>
          ) : (
            <>
              <div className="font-semibold">
                <EditableText id={`chapter-title-${chap.chapter_id}`}>{chap.chapter_title}</EditableText>
              </div>
              {chap.paragraphs.map((para: string, pi: number) => (
                <div key={pi} className="ml-2 text-sm text-gray-800">
                  <EditableText id={`chapter-${chap.chapter_id}-para-${pi}`}>{para}</EditableText>
                </div>
              ))}
              <div className="mt-2 flex gap-2">
                <Button size="sm" type="button" onClick={() => startEdit(chap, i)}>
                  Edit
                </Button>
                <Button size="sm" variant="destructive" type="button" onClick={() => onDelete(chap.chapter_id)}>
                  Delete
                </Button>
              </div>
            </>
          )}
        </div>
      ))}
      {/* --- Add new chapter --- */}
      {addMode ? (
        <div className="border mt-2 rounded p-2 bg-gray-50">
          <input
            type="text"
            className="mb-2 border w-full rounded px-2 py-1"
            placeholder="Chapter Title"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
          />
          {newParagraphs.map((p, i) => (
            <div className="flex gap-1 mb-2 items-start" key={i}>
              <textarea
                className="border w-full rounded px-2 py-1 text-sm resize-none overflow-hidden"
                placeholder={`Paragraph ${i + 1}`}
                value={p}
                rows={1}
                onChange={e => {
                  handleParagraphChange(i, e.target.value);
                  e.currentTarget.style.height = 'auto';
                  e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
                }}
              />
              <Button size="sm" variant="ghost" type="button" onClick={() => handleRemoveParagraph(i)}>-</Button>
            </div>
          ))}
          <Button size="sm" variant="secondary" type="button" onClick={handleAddParagraphInput}>
            + Add Paragraph
          </Button>
          <div className="mt-2 flex gap-2">
            <Button size="sm" type="button" onClick={handleSaveChapter}>Save</Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setAddMode(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" className="w-full mt-2" type="button" onClick={() => setAddMode(true)}>
          + Add Chapter
        </Button>
      )}
    </div>
  );
};

export default ChapterEditor;
