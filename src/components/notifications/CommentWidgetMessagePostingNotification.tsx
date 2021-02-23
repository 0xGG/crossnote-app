import { renderPreview } from "@0xgg/echomd/preview";
import { Box } from "@material-ui/core";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { WidgetTopPanel } from "../../editor/widgets/widget/WidgetTopPanel";
import { Notification } from "../../generated/graphql";
import { NotificationAvatarPanel } from "./NotificationAvatarPanel";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    notification: {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      flexWrap: "wrap",
      width: "100%",
    },
  }),
);

interface Props {
  notification: Notification;
}
export function CommentWidgetMessagePostingNotification(props: Props) {
  const classes = useStyles(props);
  const { t } = useTranslation();
  const notification = props.notification;
  const message = (notification as any).event.message;
  let widget;
  if (message) {
    widget = message.widget;
  }
  const [previewElement, setPreviewElement] = React.useState<HTMLElement>(null);

  useEffect(() => {
    if (previewElement) {
      renderPreview(previewElement, message.markdown);
    }
  }, [previewElement, message.markdown]);

  if (!message || !widget) {
    return null;
  }

  return (
    <Box key={notification.id} className={clsx(classes.notification)}>
      <NotificationAvatarPanel
        user={notification.origin}
        createdAt={notification.createdAt}
        title={t("notification/replies-to-you-in")}
      ></NotificationAvatarPanel>
      <WidgetTopPanel widget={widget} isPreview={true}></WidgetTopPanel>
      <div
        className={"preview"}
        ref={(element: HTMLElement) => {
          setPreviewElement(element);
        }}
        style={{ backgroundColor: "inherit" }}
      ></div>
    </Box>
  );
}
