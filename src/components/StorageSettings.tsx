import { Button, Typography } from "@mui/material";
import { Database } from "mdi-material-ui";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  persistStorage,
  StoragePersistence,
  storagePersistence,
} from "../lib/storage";

// Whether the browser keeps the notes this site stores, and, while it does
// not, a way to ask it again.
export default function StorageSettings() {
  const { t } = useTranslation();
  const [persistence, setPersistence] = useState<StoragePersistence>(null);

  useEffect(() => {
    let shown = true;
    storagePersistence().then((state) => {
      if (shown) {
        setPersistence(state);
      }
    });
    return () => {
      shown = false;
    };
  }, []);

  return (
    <React.Fragment>
      <Typography
        variant={"body2"}
        style={{
          fontSize: "0.75rem",
          marginBottom: "6px",
          marginTop: "16px",
        }}
      >
        <Database style={{ marginRight: "8px" }}></Database>
        {t("settings/persistent-storage")}
      </Typography>
      {persistence && (
        <Typography variant={"body2"}>
          {t(`settings/persistent-storage/${persistence}`)}
        </Typography>
      )}
      {persistence === "not-persisted" && (
        <Button
          variant={"outlined"}
          size={"small"}
          style={{ marginTop: "8px" }}
          onClick={() => {
            persistStorage().then(setPersistence);
          }}
        >
          {t("settings/ask-for-persistent-storage")}
        </Button>
      )}
    </React.Fragment>
  );
}
