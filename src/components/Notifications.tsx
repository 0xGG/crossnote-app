import { Alert, Portal, Snackbar } from "@mui/material";
import React, { useEffect, useRef, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import {
  closeNotification,
  dismissNotification,
  getNotificationState,
  subscribeToNotifications,
} from "../lib/notifications";

// Where the messages have always appeared.
const anchorOrigin = { vertical: "top", horizontal: "right" } as const;

// Three dialogs pin themselves above MUI's modal layer: the image editor at
// 3001, the kanban card editor at 3000 and the language picker at 2000. A
// message raised while one of them is open has to sit above it, as noty's
// container always did, or its close button lands on the dialog's backdrop
// and closes the dialog instead.
const snackbarSx = { zIndex: 3002 } as const;

// Shows the notification queue one message at a time. Mounted once under the
// theme provider, so a message raised by an editor widget gets the same look
// as one raised by a dialog even though the widget renders outside this tree.
export default function Notifications() {
  const { t } = useTranslation();
  const { current, open } = useSyncExternalStore(
    subscribeToNotifications,
    getNotificationState,
  );

  // A message leaves the queue when its exit transition ends. One that is
  // already closing the first time this host renders it (closed before it was
  // ever shown, or the host remounted mid-exit) never mounts a transition, so
  // nothing would end it and every later message would wait behind it.
  const shownId = useRef<number | null>(null);
  useEffect(() => {
    if (!current) {
      return;
    }
    if (open) {
      shownId.current = current.id;
    } else if (shownId.current !== current.id) {
      dismissNotification();
    }
  }, [current, open]);

  if (!current) {
    return null;
  }
  // The portal appends each message to the body as it appears. While a dialog
  // is open MUI hides everything else from assistive technology, the app root
  // included, so a message rendered in place would never be announced.
  return (
    <Portal>
      <Snackbar
        key={current.id}
        open={open}
        anchorOrigin={anchorOrigin}
        autoHideDuration={current.duration}
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
          {current.message}
        </Alert>
      </Snackbar>
    </Portal>
  );
}
