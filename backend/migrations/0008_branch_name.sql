-- Paragraph branches get their own name column.
--
-- Until now the "branch name" edited in "Configure branch" and the Branches
-- tab was written into parent_paragraph_text — the column that "Create
-- Branch" uses for a copy of the ORIGINAL paragraph the branch replaces. So
-- that column held two different things.
--
-- From here on: branch_name holds the name; parent_paragraph_text only the
-- original paragraph.
--
-- One-time data fix (reversible): where parent_paragraph_text doesn't match
-- the chapter's paragraph at parent_paragraph_index and is short enough to be
-- a name (<= 120 chars), treat it as a name — move it to branch_name and put
-- the chapter's current paragraph back into parent_paragraph_text. Longer
-- mismatches are assumed to be an older version of the paragraph and left
-- alone. Every row the fix looks at records its previous value in
-- metadata.legacy_parent_paragraph_text, which also makes the fix run once.

ALTER TABLE paragraph_branches ADD COLUMN IF NOT EXISTS branch_name text;

DO $$
DECLARE
  moved integer;
  kept integer;
BEGIN
  WITH candidates AS (
    SELECT pb.id,
           pb.parent_paragraph_text AS old_text,
           COALESCE(s.paragraphs[pb.parent_paragraph_index + 1], '') AS current_text
      FROM paragraph_branches pb
      JOIN stories s ON s.chapter_id = pb.chapter_id
     WHERE pb.branch_name IS NULL
       AND NOT (COALESCE(pb.metadata, '{}'::jsonb) ? 'legacy_parent_paragraph_text')
       AND pb.parent_paragraph_text IS DISTINCT FROM s.paragraphs[pb.parent_paragraph_index + 1]
       AND length(COALESCE(pb.parent_paragraph_text, '')) BETWEEN 1 AND 120
  )
  UPDATE paragraph_branches pb
     SET branch_name = c.old_text,
         parent_paragraph_text = c.current_text,
         metadata = COALESCE(pb.metadata, '{}'::jsonb) || jsonb_build_object('legacy_parent_paragraph_text', c.old_text)
    FROM candidates c
   WHERE pb.id = c.id;
  GET DIAGNOSTICS moved = ROW_COUNT;

  -- Long mismatches: keep as-is, but mark them as looked at.
  UPDATE paragraph_branches pb
     SET metadata = COALESCE(pb.metadata, '{}'::jsonb) || jsonb_build_object('legacy_parent_paragraph_text', pb.parent_paragraph_text)
    FROM stories s
   WHERE s.chapter_id = pb.chapter_id
     AND pb.branch_name IS NULL
     AND NOT (COALESCE(pb.metadata, '{}'::jsonb) ? 'legacy_parent_paragraph_text')
     AND pb.parent_paragraph_text IS DISTINCT FROM s.paragraphs[pb.parent_paragraph_index + 1]
     AND length(COALESCE(pb.parent_paragraph_text, '')) > 120;
  GET DIAGNOSTICS kept = ROW_COUNT;

  RAISE NOTICE 'paragraph_branches: moved % name(s) into branch_name; left % long mismatch(es) untouched', moved, kept;
END $$;
