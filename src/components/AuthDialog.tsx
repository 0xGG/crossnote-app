import {
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Link,
  TextField,
  Typography,
} from "@material-ui/core";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import Identicon from "identicon.js";
import { sha256 } from "js-sha256";
import { Github } from "mdi-material-ui";
import Noty from "noty";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CloudContainer } from "../containers/cloud";
import {
  useResetPasswordMutation,
  useSendEmailVerificationCodeMutation,
  useSignInMutation,
  useSignUpMutation,
} from "../generated/graphql";
import { browserHistory } from "../utilities/history";
import { startGitHubOAuth } from "../utilities/utils";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    form: {
      position: "relative",
      width: "400px",
      // height: "360px",
      maxWidth: "90%",
      margin: "0 auto",
      padding: "24px 12px",
      display: "flex",
      flexDirection: "column",
    },
    avatar: {
      borderRadius: "4px",
      width: "32px",
      height: "32px",
      gridArea: "avatar",
      cursor: "pointer",
      marginLeft: theme.spacing(1),
      marginRight: theme.spacing(1),
    },
    header: {
      marginBottom: "24px",
    },
    username: {
      marginBottom: "24px",
    },
    email: {
      marginBottom: "24px",
    },
    password: {
      marginBottom: "24px",
    },
    authBtn: {
      marginBottom: "16px",
    },
    switchLink: {
      "marginTop": "16px",
      "&:hover": {
        cursor: "pointer",
      },
    },
    errorMessage: {
      color: "#f44336",
    },
  }),
);

enum Stage {
  Signin,
  Signup,
  ForgotPassword,
}

interface Props {
  open: boolean;
  onClose: () => void;
}
export function AuthDialog(props: Props) {
  const classes = useStyles(props);
  const [stage, setStage] = useState<Stage>(Stage.Signin);
  const [username, setUsername] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [passwordConfirmation, setPasswordConfirmation] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [verificationCode, setVerificationCode] = useState<string>("");
  const cloudContainer = CloudContainer.useContainer();

  const [resSignIn, executeSignInMutation] = useSignInMutation();
  const [resSignUp, executeSignUpMutation] = useSignUpMutation();
  const [
    resSendEmailVerificationCode,
    executeSendEmailVerificationCodeMutation,
  ] = useSendEmailVerificationCodeMutation();
  const [
    resResetPassword,
    executeResetPasswordMutation,
  ] = useResetPasswordMutation();

  const { t } = useTranslation();
  const [loggedIn, setLoggedIn] = useState<boolean>(cloudContainer.loggedIn);

  const signin = useCallback(() => {
    executeSignInMutation({
      email: email.trim(),
      password,
    });
  }, [email, password, executeSignInMutation]);

  const signup = useCallback(() => {
    if (password === passwordConfirmation) {
      executeSignUpMutation({
        username: username.trim(),
        email: email.trim(),
        password,
      });
    } else {
      setErrorMessage(t("widget/crossnote.auth/password-mismatch"));
    }
  }, [
    username,
    email,
    password,
    passwordConfirmation,
    t,
    executeSignUpMutation,
  ]);

  const sendEmailVerificationCode = useCallback(() => {
    if (email.trim().length > 0) {
      executeSendEmailVerificationCodeMutation({
        email: email.trim(),
      });
    }
  }, [email, executeSendEmailVerificationCodeMutation]);

  const resetPassword = useCallback(() => {
    if (password === passwordConfirmation) {
      executeResetPasswordMutation({
        email: email.trim(),
        verificationCode: verificationCode.trim(),
        password,
      });
    } else {
      setErrorMessage(t("widget/crossnote.auth/password-mismatch"));
    }
  }, [
    email,
    password,
    passwordConfirmation,
    executeResetPasswordMutation,
    verificationCode,
    t,
  ]);

  const close = useCallback(() => {
    setStage(Stage.Signin);
    setErrorMessage("");
    props.onClose();
  }, [props]);

  useEffect(() => {
    if (resSignIn.error) {
      setErrorMessage(
        resSignIn.error.message.replace(/\[GraphQL\]/, "").trim(),
      );
    } else if (resSignIn.data && resSignIn.data.signIn) {
      localStorage.setItem("token", resSignIn.data.signIn.token);
      browserHistory.replace("/");
      window.location.reload();
    }
  }, [resSignIn]);

  useEffect(() => {
    if (resSignUp.error) {
      setErrorMessage(
        resSignUp.error.message.replace(/\[GraphQL\]/, "").trim(),
      );
    } else if (resSignUp.data && resSignUp.data.signUp) {
      localStorage.setItem("token", resSignUp.data.signUp.token);
      browserHistory.replace("/");
      window.location.reload();
    }
  }, [resSignUp]);

  useEffect(() => {
    if (resSendEmailVerificationCode.error) {
      setErrorMessage(
        resSendEmailVerificationCode.error.message
          .replace(/\[GraphQL\]/, "")
          .trim(),
      );
    } else if (resSendEmailVerificationCode.data) {
      if (!resSendEmailVerificationCode.data.sendEmailVerificationCode) {
        setErrorMessage(t("widget/crossnote.auth/failed_to_send_code"));
      } else {
        new Noty({
          type: "success",
          text: t("widget/crossnote.auth/verification_code_sent") + email,
          layout: "topRight",
          theme: "relax",
          timeout: 2000,
        }).show();
      }
    }
  }, [resSendEmailVerificationCode, email, t]);

  useEffect(() => {
    if (resResetPassword.error) {
      setErrorMessage(
        resResetPassword.error.message.replace(/\[GraphQL\]/, "").trim(),
      );
    } else if (resResetPassword.data) {
      if (resResetPassword.data.resetPassword) {
        new Noty({
          type: "success",
          text: t("widget/crossnote.auth/password_reset") + " " + email,
          layout: "topRight",
          theme: "relax",
          timeout: 2000,
        }).show();
        setTimeout(() => {
          window.location.reload();
        }, 4000);
      } else {
        setErrorMessage(t("widget/crossnote.auth/failed_to_reset_password"));
      }
    }
  }, [resResetPassword, email, t]);

  useEffect(() => {
    setLoggedIn(cloudContainer.loggedIn);
  }, [cloudContainer.loggedIn]);

  if (cloudContainer.loggedIn) {
    return (
      <Dialog open={props.open} onClose={close}>
        <DialogContent>
          <Box
            style={{
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <Box
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Typography variant="body1" style={{ marginBottom: "0" }}>
                {t("widget/crossnote.auth/hello")}
              </Typography>
              <Avatar
                className={clsx(classes.avatar)}
                src={
                  cloudContainer.viewer.avatar ||
                  "data:image/png;base64," +
                    new Identicon(
                      sha256(cloudContainer.viewer.username),
                      80,
                    ).toString()
                }
              ></Avatar>
              <Typography variant="body1" style={{ marginBottom: "0" }}>
                {"  " + cloudContainer.viewer.username}!
              </Typography>
            </Box>
            <Button
              variant={"outlined"}
              color={"secondary"}
              onClick={() => {
                cloudContainer.logout();
              }}
              style={{ marginLeft: "8px" }}
            >
              {t("settings/log-out")}
            </Button>
          </Box>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={props.open} onClose={close}>
      <DialogTitle>{t("widget/crossnote.auth/welcome")}</DialogTitle>
      <DialogContent style={{ width: "400px", maxWidth: "100%" }}>
        {stage === Stage.Signup ? (
          <TextField
            className={clsx(classes.email)}
            label={t("general/Username")}
            variant="outlined"
            value={username}
            fullWidth={true}
            onChange={(event) => {
              setErrorMessage("");
              setUsername(event.target.value);
            }}
          ></TextField>
        ) : null}
        <TextField
          className={clsx(classes.email)}
          label={t("general/Email")}
          variant="outlined"
          value={email}
          fullWidth={true}
          onChange={(event) => {
            setErrorMessage("");
            setEmail(event.target.value);
          }}
          onClick={(event) => {
            event.currentTarget.focus();
          }}
        ></TextField>
        {stage === Stage.ForgotPassword && email.trim().length > 0 ? (
          <Box
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-evenly",
            }}
          >
            <TextField
              className={clsx(classes.password)}
              label={t("widget/crossnote.auth/enter-the-verification-code")}
              variant="outlined"
              value={verificationCode}
              fullWidth={true}
              onChange={(event) => {
                setErrorMessage("");
                setVerificationCode(event.target.value);
              }}
            ></TextField>
            <Button
              variant={"outlined"}
              color={"primary"}
              style={{ marginBottom: "24px" }}
              onClick={() => sendEmailVerificationCode()}
              disabled={resSendEmailVerificationCode.fetching}
            >
              {resSendEmailVerificationCode.fetching
                ? t("general/sending")
                : t("widget/crossnote.auth/get-code")}
            </Button>
          </Box>
        ) : null}
        {(stage === Stage.Signin ||
          stage === Stage.Signup ||
          (stage === Stage.ForgotPassword &&
            verificationCode.trim().length > 0)) && (
          <TextField
            className={clsx(classes.password)}
            label={t("general/Password")}
            variant="outlined"
            type="password"
            value={password}
            fullWidth={true}
            onChange={(event) => {
              setErrorMessage("");
              setPassword(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.which === 13) {
                if (stage === Stage.Signin) {
                  signin();
                } /* else {
              signup();
            }*/
              }
            }}
          ></TextField>
        )}
        {(stage === Stage.Signup ||
          (stage === Stage.ForgotPassword &&
            verificationCode.trim().length > 0)) && (
          <TextField
            className={clsx(classes.password)}
            label={t("general/confirm-password")}
            variant="outlined"
            type="password"
            value={passwordConfirmation}
            fullWidth={true}
            onChange={(event) => {
              setErrorMessage("");
              setPasswordConfirmation(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.which === 13) {
                signup();
              }
            }}
          ></TextField>
        )}
        {stage === Stage.Signin ? (
          <>
            <Button
              className={clsx(classes.authBtn)}
              variant="contained"
              color="primary"
              onClick={() => signin()}
              disabled={resSignIn.fetching}
              fullWidth={true}
            >
              {t("general/sign-in")}
            </Button>
            <Typography style={{ textAlign: "center" }}>
              {t("widget/crossnote.auth/Or")}
            </Typography>
            <Chip
              label={t("widget/crossnote.auth/sign-in-with-github-account")}
              icon={<Github></Github>}
              style={{ marginBottom: "16px", marginTop: "16px", width: "100%" }}
              onClick={() => startGitHubOAuth()}
            ></Chip>
            <Divider></Divider>
            <Link
              className={clsx(classes.switchLink)}
              onClick={() => setStage(Stage.Signup)}
            >
              {t("widget/crossnote.auth/doesnt-have-account")}
            </Link>
            <br></br>
            <Link
              className={clsx(classes.switchLink)}
              onClick={() => setStage(Stage.ForgotPassword)}
            >
              {t("widget/crossnote.auth/forgot_password")}
            </Link>
          </>
        ) : stage === Stage.Signup ? (
          <>
            <Button
              className={clsx(classes.authBtn)}
              variant="contained"
              color="primary"
              onClick={() => signup()}
              disabled={resSignUp.fetching}
              fullWidth={true}
            >
              {t("general/sign-up")}
            </Button>
            <Link
              className={clsx(classes.switchLink)}
              onClick={() => setStage(Stage.Signin)}
            >
              {t("widget/crossnote.auth/already-have-an-account")}
            </Link>
            <br></br>
            <Link
              className={clsx(classes.switchLink)}
              onClick={() => setStage(Stage.ForgotPassword)}
            >
              {t("widget/crossnote.auth/forgot_password")}
            </Link>
          </>
        ) : (
          verificationCode.length > 0 && (
            <>
              <Button
                className={clsx(classes.authBtn)}
                variant="contained"
                color="primary"
                onClick={() => resetPassword()}
                disabled={resResetPassword.fetching}
                fullWidth={true}
              >
                {t("widget/crossnote.auth/reset-password")}
              </Button>
              <Link
                className={clsx(classes.switchLink)}
                onClick={() => setStage(Stage.Signin)}
              >
                {t("widget/crossnote.auth/already-have-an-account")}
              </Link>
            </>
          )
        )}
        {errorMessage.length ? (
          <Typography className={clsx(classes.errorMessage)}>
            {errorMessage}
          </Typography>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
