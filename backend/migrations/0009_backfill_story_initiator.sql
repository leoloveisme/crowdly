-- Stories cloned via POST /stories/:id/clone were inserted without an
-- initiator_id. The clone endpoint now sets it; backfill existing rows from
-- creator_id (the only information available for them). creator_id is a
-- loose uuid while initiator_id has an FK to local_users, so only backfill
-- where that user exists. Idempotent.
UPDATE story_title st
   SET initiator_id = st.creator_id
 WHERE st.initiator_id IS NULL
   AND st.creator_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM local_users u WHERE u.id = st.creator_id);
