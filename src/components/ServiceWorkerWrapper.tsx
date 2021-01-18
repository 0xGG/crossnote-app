import { Button, Snackbar } from "@material-ui/core";
import React, { FC, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import * as serviceWorker from "../serviceWorker";

const ServiceWorkerWrapper: FC = () => {
  const { t } = useTranslation();
  const [showReload, setShowReload] = React.useState(false);
  const [
    waitingWorker,
    setWaitingWorker,
  ] = React.useState<ServiceWorker | null>(null);

  const onSWUpdate = (registration: ServiceWorkerRegistration) => {
    setShowReload(true);
    setWaitingWorker(registration.waiting);
  };

  useEffect(() => {
    serviceWorker.register({ onUpdate: onSWUpdate });
  }, []);

  const reloadPage = useCallback(() => {
    waitingWorker?.postMessage({ type: "SKIP_WAITING" });
    setShowReload(false);
    window.location.reload(true);
  }, [waitingWorker]);

  return (
    <Snackbar
      open={showReload}
      message={t("notifications/new-version-available")}
      onClick={reloadPage}
      anchorOrigin={{ vertical: "top", horizontal: "center" }}
      action={
        <Button color="inherit" size="small" onClick={reloadPage}>
          {t("general/update")}
        </Button>
      }
    />
  );
};

export default ServiceWorkerWrapper;
