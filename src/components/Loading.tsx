import { Box, CircularProgress, Typography } from "@material-ui/core";
import { useTranslation } from "react-i18next";

export function Loading() {
  const { t } = useTranslation();

  return (
    <Box style={{ width: "100%", height: "100%" }}>
      <Box
        style={{
          textAlign: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          top: "36%",
          position: "relative",
        }}
      >
        <CircularProgress></CircularProgress>
        <Typography color={"textPrimary"} style={{ marginLeft: "24px" }}>
          {t("general/loading")}
        </Typography>
      </Box>
    </Box>
  );
}
