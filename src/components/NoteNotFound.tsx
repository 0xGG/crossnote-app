import { Box, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

interface Props {
  notebookName: string;
  filePath: string;
}

/** What a note's tab shows when its notebook has no note at the tab's path. */
export function NoteNotFound({ notebookName, filePath }: Props) {
  const { t } = useTranslation();

  return (
    <Box style={{ width: "100%", height: "100%" }}>
      <Box
        role="status"
        style={{
          textAlign: "center",
          top: "36%",
          position: "relative",
          padding: "0 24px",
        }}
      >
        <Typography color={"textPrimary"}>
          {t("general/note-not-found")}
        </Typography>
        <Typography
          color={"textSecondary"}
          variant={"caption"}
          style={{ wordBreak: "break-all" }}
        >
          {`${notebookName}: ${filePath}`}
        </Typography>
      </Box>
    </Box>
  );
}
