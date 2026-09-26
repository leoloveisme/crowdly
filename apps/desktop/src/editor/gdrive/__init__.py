"""Direct Google Drive sync for local project spaces.

Unlike the web platform's Drive connector (backend/src/googleDriveSync.js),
this runs entirely inside the desktop app and needs no Crowdly login: the
app signs in to Google itself (``oauth``), keeps the refresh token in the OS
keychain (``tokens``), talks to the Drive REST API (``api``) and two-way
syncs a local project-space folder tree with one Drive folder tree
(``engine``), three-way merging text files both sides changed (``merge``).
"""
