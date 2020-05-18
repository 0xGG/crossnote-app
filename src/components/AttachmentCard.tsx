import React, { useState, useEffect } from "react";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import { CrossnoteContainer } from "../containers/crossnote";
import { Attachment } from "../lib/crossnote";
import { ButtonBase, Typography, Box } from "@material-ui/core";
import { basename } from "path";
import { loadImageAsBase64, isFileAnImage } from "../utilities/image";
import { Image } from "mdi-material-ui";
import { useTranslation } from "react-i18next";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    attachmentCard: {
      width: "100%",
      display: "flex",
      flexDirection: "row",
      alignItems: "flex-start",
      padding: theme.spacing(2, 0.5, 0),
      textAlign: "left",
      cursor: "default",
      backgroundColor: theme.palette.background.paper,
    },
    selected: {
      borderLeft: `4px solid ${theme.palette.primary.main}`,
    },
    unselected: {
      borderLeft: `4px solid rgba(0, 0, 0, 0)`,
    },
    leftPanel: {
      width: "48px",
      paddingLeft: theme.spacing(0.5),
    },
    rightPanel: {
      width: "calc(100% - 48px)",
      borderBottom: `1px solid ${theme.palette.divider}`,
    },
    image: {
      width: "128px",
      height: "80px",
      marginRight: theme.spacing(1),
      position: "relative",
      backgroundSize: "cover",
      backgroundPosition: "center",
      display: "block",
      borderRadius: "6px",
    },
    filePath: {
      wordBreak: "break-all",
    },
  }),
);

interface Props {
  attachment: Attachment;
}

export default function AttachmentCard(props: Props) {
  const classes = useStyles(props);
  const attachment = props.attachment;
  const { t } = useTranslation();
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const [image, setImage] = useState<string>("");
  const [gitStatus, setGitStatus] = useState<string>("");

  useEffect(() => {
    if (crossnoteContainer && crossnoteContainer.crossnote && attachment) {
      crossnoteContainer.crossnote
        .getStatus(attachment.notebook, attachment.filePath)
        .then((status) => {
          setGitStatus(status);
        })
        .catch((error) => {
          setGitStatus("");
        });
    } else {
      setGitStatus("");
    }
  }, [attachment, crossnoteContainer.crossnote]);

  useEffect(() => {
    if (attachment && isFileAnImage(attachment.filePath)) {
      loadImageAsBase64(attachment.notebook, ".", attachment.filePath)
        .then((base64) => {
          setImage(base64);
        })
        .catch((error) => {
          setImage("");
        });
    }
  }, [attachment]);

  return (
    <ButtonBase
      className={clsx(
        classes.attachmentCard,
        /*
        crossnoteContainer.selectedAttachment &&
          crossnoteContainer.selectedAttachment.filePath === attachment.filePath
          ? classes.selected
          : classes.unselected,
          */
      )}
      onClick={() => {
        crossnoteContainer.setSelectedAttachment(attachment);
        crossnoteContainer.setDisplayAttachmentEditor(true);
      }}
    >
      <Box className={clsx(classes.leftPanel)}>
        {isFileAnImage(attachment.filePath) && <Image></Image>}
      </Box>
      <Box className={clsx(classes.rightPanel)}>
        {image && (
          <div
            key={`${image}`}
            className={clsx(classes.image)}
            style={{
              backgroundImage: `url(${image})`,
            }}
          ></div>
        )}
        <Typography variant={"caption"} className={clsx(classes.filePath)}>
          {basename(attachment.filePath).startsWith("unnamed_")
            ? t(`git/status/${gitStatus}`)
            : attachment.filePath + " - " + t(`git/status/${gitStatus}`)}
        </Typography>
      </Box>
    </ButtonBase>
  );
}
