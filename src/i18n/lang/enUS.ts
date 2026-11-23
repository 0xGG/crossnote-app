export const enUS = {
  translation: {
    "backup/export": "Export notebook ZIP",
    "backup/title": "Export {{notebook}} as ZIP",
    "backup/private-files":
      "The ZIP includes hidden and Git-ignored files, which may contain private information. External media keeps its original URL.",
    "backup/disk-links":
      "This backup includes the files Chrome can read from the folder. Chrome may hide symbolic links.",
    "backup/preparing": "Preparing the ZIP…",
    "backup/windows-paths":
      "These paths may fail to extract with their original names on Windows. The ZIP keeps the original paths.",
    "backup/download": "Download ZIP",
    "backup/failed": "Could not export the notebook.",
    "backup/read-error": "Could not read “{{file}}”.",
    "backup/symbolic-link": "Could not include the symbolic link “{{file}}”.",
    "backup/too-large": "This notebook exceeds the ZIP size or entry limit.",
    "backup/sync-recovery":
      "Retry Download to finish the interrupted sync, then export the notebook.",
    "recovery/title": "Sync paused",
    "recovery/instructions":
      "The remote now uses {{directory}} in {{notebook}}. Close any notes from that folder, then download the ZIP and check your files. Confirming below removes the local recovery folder so you can retry the download or upload.",
    "recovery/legacy-instructions":
      "The remote now uses {{directory}} in {{notebook}}. Crossnote cannot verify who created the local folder. Download a ZIP to keep a copy. Rename the conflicting path in the remote repository, then retry sync.",
    "recovery/download": "Download recovery files",
    "recovery/confirm": "I saved the files",
    "recovery/retry":
      "Recovery files removed from the notebook. Retry the download or upload.",
    "error/close-recovery-notes":
      "Close the notes in this recovery folder before removing it. Wait for their changes to finish saving.",
    "error/recovery-files-changed":
      "The recovery files have changed. Download a fresh copy before confirming.",
    "error/recovery-files": "Could not access the recovery files.",
    "attachment/insert-image": "Insert image",
    "attachment/ignored":
      "This attachment path is ignored by Git. No links were inserted; any files already saved remain in assets. Check the notebook's ignore rules.",
    "attachment/size":
      "Each attachment must be 20 MiB or smaller. No link was inserted.",
    "attachment/type":
      "This file type is not supported. Choose an image, audio or video file.",
    "attachment/location":
      "The note or insertion point changed. No link was inserted; any files already saved remain in assets.",
    "attachment/failed":
      "The attachment could not be saved. No link was inserted",
    "attachment/playback-failed":
      "This media could not be played. Check the file, connection or browser format support.",
    "search/notes": "Search Notes",

    // Account
    "account/Anonymous": "Anonymous",

    // General
    "general/cancel": "Cancel",
    "general/add": "Add",
    "general/adding": "Adding",
    "general/created-at": "Created at",
    "general/modified-at": "Modified at",
    "general/date-created": "Date created",
    "general/date-modified": "Date modified",
    "general/title": "Title",
    "general/loading": "Loading ...",
    "general/note-not-found": "The note was not found",
    "error/failed-to-load-note": "Could not load the note",
    "general/update": "Update",
    "general/close": "Close",
    "general/open-menu": "Open menu",
    "general/expand": "Expand",
    "general/collapse": "Collapse",
    "general/Note": "Note",
    "general/notes": "Notes",
    "general/Settings": "Settings",
    "general/Username": "Username",
    "general/Password": "Password",
    "general/echomd": "Edit",
    "general/edit-note-alias": "Edit note alias",
    "general/no-aliases": "No aliases",
    "general/add-an-alias": "Add an alias",
    "general/Untitled": "Untitled",
    "general/Print": "Print / Export PDF",
    "general/Share": "Share",
    "Editor": "Editor",
    "general/math-preview": "Math Preview",
    "general/this-note-is-empty": "This note is empty",
    "general/no-notes-found": "No more notes found",
    "general/Save": "Save",
    "general/Delete": "Delete",
    "general/new-note": "New note",
    "general/note-menu": "Note menu",
    "general/sort-notes": "Sort notes",
    "general/table-of-contents": "Table of contents",
    "general/Upload": "Upload",
    "general/Uploading": "Uploading",
    "general/please-wait": "Please wait...",
    "general/Download": "Download",
    "general/Notebooks": "Notebooks",
    "general/add-a-notebook": "Add a notebook",
    "general/add-a-note": "Add a note",
    "general/configure-the-notebook": "Configure the notebook",
    "general/notebook-name": "Notebook name",
    "general/git-repository": "Git repository",
    "general/clone-a-git-repository": "Clone a Git repository",
    "general/optional": "optional",
    "general/url": "Url",
    "general/branch": "branch",
    "general/remember-username-and-password": "Remember credentials",
    "general/stored-locally": "stored locally",
    "general/cors-proxy": "CORS proxy",
    "general/why-cors-proxy": "Why do we need CORS proxy？",
    "general/today": "Today",
    "general/graph-view": "Graph view",
    "general/graph-view-unavailable":
      "The graph could not be loaded. Reload the page to try again.",
    "general/conflicted": "Conflicted",
    "general/change-file-path": "Change file path",
    "general/restore-checkout": "Restore (git checkout)",
    "general/download-pull": "Download (git pull)",
    "general/upload-push": "Upload (git pull & git push)",
    "general/commit-message": "Commit message",
    "general/upload-notebook": "Upload the notebook",
    "general/check-notebook-updates-periodically":
      "Check notebook updates periodically",
    "general/minutes": "minute(s)",
    "general/hard-reset": "Hard reset",
    "general/Desc": "Desc",
    "general/Asc": "Asc",
    "general/pin-the-note": "Pin the note",
    "general/unpin-the-note": "Unpin the note",
    "general/add-to-quick-access": "Add to quick access",
    "general/remove-from-quick-access": "Remove from quick access",
    "general/open-a-local-folder": "Open a Local Folder",
    "general/your-browser-doesnt-support-to-open-local-folder":
      "Your browser doesn't support to open local folder",
    "general/refresh": "Refresh",
    "general/welcome-back-to-crossnote": "Welcome back to Crossnote",
    "general/continue": "Continue",
    "general/reference(s)": "reference(s)",
    "general/References": "References",

    // Error
    "error/authentication-failed": "Authentication failed",
    "error/failed-to-upload-notebook": "Failed to upload notebook",
    "error/remote-has-no-commits": "The remote repository has no commits yet.",
    "error/failed-to-download-notebook": "Failed to download notebook",
    "error/notebook-already-exists": "Notebook already exists",
    "error/invalid-git-url-prefix": "Invalid git URL prefix",
    "error/please-resolve-conflicts": "Please resolve conflicts first",
    "error/failed-to-change-file-path": "Failed to change file path",
    "error/note-moved-retry":
      "The note moved to {{path}}. Open it there and try again.",
    "error/failed-to-print": "Failed to print the note",
    "error/failed-to-save-notebook-settings":
      "Failed to save the notebook settings",
    "error/failed-to-remove-notebook": "Failed to remove the notebook",
    "error/notebook-cleanup-failed":
      "The notebook was removed, but its storage could not be cleaned up",
    "error/link-outside-notebook": "The link leads outside the notebook",
    "error/link-inside-note": "The link leads inside a note, not a folder",
    "error/failed-to-save-note": "Failed to save the note",
    "error/failed-to-create-note": "Failed to create the note",
    "error/failed-to-delete-note": "Failed to delete the note",
    "error/failed-to-save-note-settings": "Failed to save the note's settings",
    "error/notebook-sync-conflicts":
      "Sync conflicts: {{files}}. Your changes were kept. Review the files before uploading again.",
    "error/notebook-file-deleted-local":
      "{{file}} (deleted locally, remote changes kept)",
    "error/notebook-file-deleted-remote":
      "{{file}} (deleted remotely, local changes kept)",
    "error/notes-not-saved":
      "Nothing was done, as {{notes}} could not be saved",

    // Success
    "success/notebook-uploaded": "Notebook uploaded",
    "success/notebook-downloaded": "Notebook downloaded",
    "info/notebook-pending-upload": "Local commits are waiting to be uploaded.",
    "success/notebook-up-to-date": "No new commits to download",
    "error/notebook-file-ignored":
      "Upload paused because {{file}} matches a Git ignore rule. Update the rule and retry.",
    "error/notebook-branch-mismatch":
      "Sync paused. The working copy is on a different revision from the notebook branch.",
    "error/notebook-history-diverged":
      "The available history cannot establish a fast-forward. Both branches have been kept.",

    // Info
    "info/downloading-notebook": "Downloading notebook",

    // Warning
    "warning/front-matter-unreadable":
      "The front matter of this note cannot be read. It is kept as it is.",

    // Settings
    "settings/about-this-project": "About this project",
    "settings/issues-and-feature-requests":
      "Found issues or have feature requests?",
    "settings/default-editor-mode": "Default editor mode",
    "settings/source-code-line-numbers": "Line numbers in source code mode",
    "settings/author-name": "Author name",
    "settings/author-email": "Author email",
    "settings/theme": "Theme",
    "settings/persistent-storage": "Persistent storage",
    "settings/persistent-storage/persisted":
      "On: the browser does not clear the notes this site stores to free up space.",
    "settings/persistent-storage/not-persisted":
      "Off: when space runs low, the browser may clear the notes this site stores.",
    "settings/persistent-storage/unsupported": "Not offered by this browser.",
    "settings/ask-for-persistent-storage": "Ask again",

    // ProfileCard
    "profile-card/notes": "notes",

    // Editor
    "editor/placeholder": "#  Hi 😀 Type '/' for commands",
    "editor/ln": "Ln",
    "editor/col": "Col",
    "editor/split-horizontally": "Split horizontally",
    "editor/split-vertically": "Split vertically",

    // * EditorToolBar
    "editor/toolbar/insert-header-1": "Insert header 1",
    "editor/toolbar/insert-header-2": "Insert header 2",
    "editor/toolbar/insert-header-3": "Insert header 3",
    "editor/toolbar/insert-header-4": "Insert header 4",
    "editor/toolbar/insert-header-5": "Insert header 5",
    "editor/toolbar/insert-header-6": "Insert header 6",
    "editor/toolbar/insert-blockquote": "Insert blockquote",
    "editor/toolbar/insert-unordered-list": "Insert unordered list",
    "editor/toolbar/insert-ordered-list": "Insert ordered list",
    "editor/toolbar/insert-table": "Insert table",
    "editor/toolbar/insert-date-time": "Insert the date and time",
    "editor/toolbar/insert-mermaid": "Insert a Mermaid diagram",

    // * NoteControl
    "editor/note-control/source-code": "Source code",
    "editor/note-control/preview": "Preview",
    "editor/note-control/shareable-link": "Shareable link",
    "editor/note-control/copy-to-clipboard": "Copy to clipboard",

    // Utils

    // Widgets
    "widget/crossnote.auth/welcome": "Welcome to Crossnote",
    "widget/crossnote.auth/Or": "Or",

    // Dialogs
    "delete-note-dialog/title": "Are you sure to delete this note?",
    "delete-note-dialog/subtitle": "You can't undo this action.",
    "unsaved-note-dialog/title": "Close this note without saving?",
    "unsaved-note-dialog/subtitle":
      "It could not be saved. Closing the tab loses what was typed since it was last saved.",
    "unsaved-note-dialog/close-anyway": "Close anyway",
    "add-notebook-dialog/disclaimer":
      "Notebook data will only be stored locally in browser for offline uses. We won't upload any notebook data to our server.",
    "edit-image-dialog/title": "Edit the image",
    "edit-image-dialog/note-changed":
      "The note changed. Close this dialog and select the image again.",
    "edit-image-dialog/image-url": "image URL",
    "edit-image-dialog/image-title": "image title",
    "edit-image-dialog/image-alt-text": "image alt text",
    "language-selector-dialog/subtitle": "Please choose the preferred language",

    // git
    "git/status/ignored": "ignored",
    "git/status/unmodified": "unmodified",
    "git/status/*modified": "*modified",
    "git/status/*deleted": "*deleted",
    "git/status/*added": "*added",
    "git/status/absent": "absent",
    "git/status/modified": "modified",
    "git/status/deleted": "deleted",
    "git/status/added": "added",
    "git/status/*unmodified": "*unmodified",
    "git/status/*absent": "*absent",
    "git/status/*undeleted": "*undeleted",
    "git/status/*undeletemodified": "*undeletemodified",
    "git/status/": "",

    // graph view
    "graph-view/node": "Node(s)",
    "graph-view/link": "Link(s)",

    // Layout (flexlayout-react's own labels)
    "layout/hidden-tabs": "Hidden tabs",
    "layout/resize": "Resize",
    "layout/move-tabs": "Move tabs (?)",
    "layout/move-tabset": "Move tabset",
    "layout/error-rendering-component": "Error rendering component",
    "layout/retry": "Retry",
  },
};
