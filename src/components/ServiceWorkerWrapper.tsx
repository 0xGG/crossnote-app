import React, { FC, useEffect } from "react";
import { Snackbar, Button } from "@material-ui/core";
import * as serviceWorker from "../serviceWorker";
import { useTranslation } from "react-i18next";

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

  const reloadPage = () => {
    waitingWorker?.postMessage({ type: "SKIP_WAITING" });
    setShowReload(false);
    window.location.reload(true);
  };

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
