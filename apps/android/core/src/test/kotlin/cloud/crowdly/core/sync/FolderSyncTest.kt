package cloud.crowdly.core.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FolderSyncTest {
    @Test fun decisions() {
        assertEquals(SyncAction.AGREE, decide("a", "a", true, null))
        assertEquals(SyncAction.UPLOAD, decide("a", null, false, null))
        assertEquals(SyncAction.DOWNLOAD, decide(null, "b", true, null))
        assertEquals(SyncAction.NONE, decide(null, "b", true, "b")) // deleted here: keep remote
        assertEquals(SyncAction.UPLOAD, decide("new", "old", true, "old"))
        assertEquals(SyncAction.DOWNLOAD, decide("old", "new", true, "old"))
        assertEquals(SyncAction.KEEP_BOTH, decide("x", "y", true, "z"))
    }

    @Test fun copyNames() {
        assertEquals("notes/a (Crowdly copy).md", crowdlyCopyName("notes/a.md"))
        assertEquals("v1.2/README (Crowdly copy)", crowdlyCopyName("v1.2/README"))
    }

    @Test fun ignoreRules() {
        val r = IgnoreRules("node_modules/\n*.tmp\n/build\n# comment\n")
        assertTrue(r.ignored(".git/config", false))
        assertTrue(r.ignored("a/.DS_Store", false))
        assertTrue(r.ignored("x/node_modules", true))
        assertFalse(r.ignored("x/node_modules", false))
        assertTrue(r.ignored("draft.tmp", false))
        assertTrue(r.ignored("build/out.txt", false))
        assertFalse(r.ignored("src/build.md", false))
        assertFalse(r.ignored("chapters/one.story", false))
    }
}
