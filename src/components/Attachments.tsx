import React, { useState, useEffect } from "react";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import { Attachment } from "../lib/crossnote";
import { useTranslation } from "react-i18next";
import { Box, Typography } from "@material-ui/core";
import AttachmentCard from "./AttachmentCard";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    attachmentsList: {
      position: "relative",
      flex: "1",
      overflowY: "auto",
      paddingBottom: theme.spacing(12),
      marginTop: theme.spacing(0.5),
    },
  }),
);

interface Props {
  searchValue: string;
  attachments: Attachment[];
}

export default function Attachments(props: Props) {
  const classes = useStyles(props);
  const { t } = useTranslation();

  const [attachments, setAttachments] = useState<Attachment[]>([]);

  useEffect(() => {
    const searchValue = props.searchValue;
    const attachments = props.attachments.filter((attachment) => {
      if (searchValue.trim().length) {
        const regexp = new RegExp(
          "(" +
            searchValue
              .trim()
              .split(/\s+/g)
              .map((s) => s.replace(/[.!@#$%^&*()_+-=[\]]/g, (x) => `\\${x}`))
              .join("|") +
            ")",
          "i",
        );

        return (
          attachment.content.match(regexp) || attachment.filePath.match(regexp)
        );
      } else {
        return true;
      }
    });
    setAttachments(attachments);
  }, [props.attachments, props.searchValue]);

  return (
    <Box className={clsx(classes.attachmentsList)}>
      {(attachments || []).map((attachment) => {
        return (
          <AttachmentCard
            attachment={attachment}
            key={attachment.filePath}
          ></AttachmentCard>
        );
      })}

      {attachments.length === 0 && (
        <Typography
          style={{
            textAlign: "center",
            marginTop: "32px",
          }}
          variant={"body2"}
        >
          {"🧐 " + t("general/no-more-attachments-found")}
        </Typography>
      )}
    </Box>
  );
}
