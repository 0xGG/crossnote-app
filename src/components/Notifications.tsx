import { Alert, Box, Button, Portal, Snackbar } from "@mui/material";
import React, { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import {
  closeNotification,
  dismissNotification,
  getNotificationState,
  type Notification,
  subscribeToNotifications,
} from "../lib/notifications";

// Where the messages have always appeared.
const anchorOrigin = { vertical: "top", horizontal: "right" } as const;

// Two dialogs pin themselves above MUI's modal layer: the image editor at
// 3001 and the language picker at 2000. A
// message raised while one of them is open has to sit above it, as noty's
// container always did, or its close button lands on the dialog's backdrop
// and closes the dialog instead.
// At the top right, a message stays clear of the buttons there under the
// tab strip: those in a note's header, which ends 72px down, and the notes
// list's sort and new note buttons, which end 110px down. 116px down, a
// message of one line ends above the menu button of the list's first card,
// 171px down; on a note it covers only the note's text. Given for each
// width, as the Snackbar gives its own from sm up.
const snackbarSx = { zIndex: 3002, top: { xs: 116, sm: 116 } } as const;

// Shows the notification queue one message at a time. Mounted once under the
// theme provider, so every message gets the same look wherever it is raised.
export default function Notifications() {
  const { current, open } = useSyncExternalStore(
    subscribeToNotifications,
    getNotificationState,
  );

  if (!current) {
    return null;
  }
  return <NotificationMessage key={current.id} current={current} open={open} />;
}

function NotificationMessage({
  current,
  open,
}: {
  current: Notification;
  open: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [copyResult, setCopyResult] = useState<"copied" | "failed">();
  const [dialogHost] = useState(
    () => current.dialog && document.createElement("div"),
  );
  useLayoutEffect(() => {
    if (!dialogHost) return;
    const dialog = current.dialog;
    (dialog.isConnected ? dialog : document.body).appendChild(dialogHost);
    // Move the host without restarting its timer or exit transition.
    const observer = new MutationObserver(() => {
      if (!dialog.isConnected) {
        observer.disconnect();
        document.body.appendChild(dialogHost);
      }
    });
    if (dialog.isConnected)
      observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      dialogHost.remove();
    };
  }, [current.dialog, dialogHost]);

  async function copyDetails() {
    try {
      await navigator.clipboard.writeText(current.details);
      setCopyResult("copied");
    } catch {
      setCopyResult("failed");
    }
  }

  return (
    <Portal container={dialogHost}>
      <Snackbar
        open={open}
        anchorOrigin={anchorOrigin}
        autoHideDuration={expanded ? null : current.duration}
        onClose={(_event, reason) => {
          // A click elsewhere on the page is not a request to hide the message.
          if (reason !== "clickaway") {
            closeNotification();
          }
        }}
        slotProps={{ transition: { onExited: dismissNotification } }}
        sx={snackbarSx}
      >
        <Alert
          severity={current.severity}
          variant="filled"
          onClose={closeNotification}
          closeText={t("general/close")}
        >
          <span data-testid="notification-summary">{current.message}</span>
          {current.action && (
            <Button
              size="small"
              color="inherit"
              onClick={() => {
                closeNotification();
                current.action.onClick();
              }}
            >
              {current.action.label}
            </Button>
          )}
          {current.details && (
            <Box>
              <Button
                size="small"
                color="inherit"
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                {t("git/details")}
              </Button>
              {expanded && (
                <>
                  <Box
                    component="pre"
                    sx={{
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                      userSelect: "text",
                      maxHeight: "30vh",
                      overflow: "auto",
                      maxWidth: "min(65ch, 70vw)",
                    }}
                  >
                    {current.details}
                  </Box>
                  <Button size="small" color="inherit" onClick={copyDetails}>
                    {t("git/copy-details")}
                  </Button>
                  <span role="status">
                    {copyResult === "copied" && t("git/details-copied")}
                    {copyResult === "failed" && t("git/copy-failed")}
                  </span>
                </>
              )}
            </Box>
          )}
        </Alert>
      </Snackbar>
    </Portal>
  );
}
