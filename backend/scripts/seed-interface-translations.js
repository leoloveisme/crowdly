import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { pool } from '../src/db.js';

dotenv.config();

// Usage: npm run seed-interface-translations --prefix backend [-- path/to/data.json]
const dataFileArg = process.argv[2] ?? 'scripts/data/interface-translations.seed.json';
const dataFilePath = path.resolve(process.cwd(), dataFileArg);

// Each entry: { page_key, element_id, en, ru, de }
// - page_key: canonical key as produced by src/lib/pageKey.ts (e.g. "/", "/__layout__", "/story/:story_id")
// - element_id: the EditableText `id` prop value
// - en: English source text (-> original_content for both language rows)
// - ru / de: translated text (-> content). A missing/empty ru or de is skipped with a warning.

async function upsert(pageKey, elementId, language, content, originalContent) {
  await pool.query(
    `INSERT INTO interface_translations (page_path, element_id, language, content, original_content, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (page_path, element_id, language)
     DO UPDATE SET content = EXCLUDED.content,
                   original_content = COALESCE(EXCLUDED.original_content, interface_translations.original_content),
                   updated_at = now()`,
    [pageKey, elementId, language, content, originalContent]
  );
}

async function main() {
  const raw = fs.readFileSync(dataFilePath, 'utf-8');
  const entries = JSON.parse(raw);

  let upserted = 0;
  let skipped = 0;

  for (const entry of entries) {
    const { page_key, element_id, en, ru, de } = entry;
    if (!page_key || !element_id || !en) {
      console.warn('Skipping invalid entry (missing page_key/element_id/en):', entry);
      skipped++;
      continue;
    }
    if (ru) {
      await upsert(page_key, element_id, 'Russian', ru, en);
      upserted++;
    } else {
      console.warn(`Skipping missing Russian translation for ${page_key} / ${element_id}`);
      skipped++;
    }
    if (de) {
      await upsert(page_key, element_id, 'German', de, en);
      upserted++;
    } else {
      console.warn(`Skipping missing German translation for ${page_key} / ${element_id}`);
      skipped++;
    }
  }

  console.log(`Done. Upserted ${upserted} rows, skipped ${skipped}.`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
