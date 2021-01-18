import {
  Box,
  Button,
  Card,
  IconButton,
  TextField,
  Typography,
} from "@material-ui/core";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import { ChevronLeft } from "mdi-material-ui";
import Noty from "noty";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useLinkWithGitHubAccountMutation,
  useSignInWithGitHubAccountMutation,
  useSignUpWithGitHubAccountMutation,
} from "../generated/graphql";
import { browserHistory } from "../utilities/history";
import { UUIDNil } from "../utilities/utils";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    container: {
      position: "relative",
      width: "100%",
      height: "100%",
      color: theme.palette.text.primary,
      backgroundColor: theme.palette.background.default,
    },
    wrapper: {
      position: "relative",
      width: "960px",
      maxWidth: "100%",
      margin: "0 auto",
      transform: "translateY(-60%)",
      top: "50%",
      padding: "16px",
      boxSizing: "border-box",
    },
    email: {
      marginBottom: "24px",
    },
    password: {
      marginBottom: "24px",
    },
    errorMessage: {
      color: "#f44336",
    },
    card: {
      position: "relative",
      width: "300px",
      maxWidth: "100%",
      padding: "16px",
      margin: "32px auto",
    },
  }),
);

interface Props {
  code: string;
}
export function GitHubOAuthCallback(props: Props) {
  const classes = useStyles(props);
  const { t, i18n } = useTranslation();
  const [accessToken, setAccessToken] = useState<string>("");
  const [title, setTitle] = useState<string>(t("github-oauth/wait"));
  const [username, setUsername] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [
    resLinkWithGitHubAccount,
    executeLinkWithGitHubAccount,
  ] = useLinkWithGitHubAccountMutation();
  const [
    resSignInWithGitHubAccount,
    executeSignInWithGitHubAccount,
  ] = useSignInWithGitHubAccountMutation();
  const [
    resSignUpWithGitHubAccount,
    executeSignUpWithGitHubAccount,
  ] = useSignUpWithGitHubAccountMutation();

  useEffect(() => {
    if (props.code) {
      if (localStorage.getItem("token")) {
        // Link with GitHub account
        executeLinkWithGitHubAccount({ code: props.code });
      } else {
        // Sign in with GitHub account
        executeSignInWithGitHubAccount({ code: props.code });
      }
    }
  }, [props.code]);

  useEffect(() => {
    if (resLinkWithGitHubAccount.fetching) {
    } else if (resLinkWithGitHubAccount.error) {
      new Noty({
        type: "error",
        text: t("github-oauth/link-with-github-account-failure"),
        layout: "topRight",
        theme: "relax",
        timeout: 2000,
      }).show();
      setTitle(t("github-oauth/link-with-github-account-failure"));
    } else if (resLinkWithGitHubAccount.data) {
      browserHistory.replace("/settings");
    }
  }, [resLinkWithGitHubAccount]);

  useEffect(() => {
    if (resSignInWithGitHubAccount.fetching) {
    } else if (resSignInWithGitHubAccount.error) {
      new Noty({
        type: "error",
        text: t("github-oauth/sign-in-with-github-account-failure"),
        layout: "topRight",
        theme: "relax",
        timeout: 2000,
      }).show();
      setTitle(t("github-oauth/sign-in-with-github-account-failure"));
    } else if (
      resSignInWithGitHubAccount.data &&
      resSignInWithGitHubAccount.data.signInWithGitHubAccount &&
      resSignInWithGitHubAccount.data.signInWithGitHubAccount.token
    ) {
      if (
        resSignInWithGitHubAccount.data.signInWithGitHubAccount.user.id ===
        UUIDNil
      ) {
        // Ask user to register for new account
        setAccessToken(
          resSignInWithGitHubAccount.data.signInWithGitHubAccount.token,
        );
        setUsername(
          resSignInWithGitHubAccount.data.signInWithGitHubAccount.user.username,
        );
        setEmail(
          resSignInWithGitHubAccount.data.signInWithGitHubAccount.user.email,
        );
      } else {
        localStorage.setItem(
          "token",
          resSignInWithGitHubAccount.data.signInWithGitHubAccount.token,
        );
        browserHistory.replace("/");
        window.location.reload();
      }
    }
  }, [resSignInWithGitHubAccount]);

  useEffect(() => {
    if (resSignUpWithGitHubAccount.error) {
      setErrorMessage(
        resSignUpWithGitHubAccount.error.message
          .replace(/\[GraphQL\]/, "")
          .trim(),
      );
    } else if (resSignUpWithGitHubAccount.data) {
      localStorage.setItem(
        "token",
        resSignUpWithGitHubAccount.data.signUpWithGitHubAccount.token,
      );
      browserHistory.replace("/");
      window.location.reload();
    }
  }, [resSignUpWithGitHubAccount]);

  const signUpWithGitHubAccessToken = () => {
    executeSignUpWithGitHubAccount({
      email,
      username,
      accessToken,
    });
  };

  const backBtn = (
    <IconButton
      onClick={() => {
        browserHistory.replace("/");
        window.location.reload();
      }}
      color={"inherit"}
    >
      <ChevronLeft></ChevronLeft>
    </IconButton>
  );

  return (
    <Box className={clsx(classes.container)}>
      <Box className={clsx(classes.wrapper)}>
        {accessToken ? (
          <React.Fragment>
            {backBtn}
            <Typography variant="h4" style={{ marginBottom: "0" }}>
              {t("github-oauth/first-time-sign-in")}
            </Typography>
            <Typography variant="h5" style={{ marginBottom: "0" }}>
              {t("github-oauth/first-time-sign-in-small")}
            </Typography>
            <Card elevation={2} className={clsx(classes.card)}>
              <TextField
                className={clsx(classes.email)}
                label={t("general/Username")}
                variant="outlined"
                value={username}
                onChange={(event) => {
                  setErrorMessage("");
                  setUsername(event.target.value);
                }}
                fullWidth={true}
              ></TextField>
              <TextField
                className={clsx(classes.email)}
                label={t("general/Email")}
                variant="outlined"
                value={email}
                onChange={(event) => {
                  setErrorMessage("");
                  setEmail(event.target.value);
                }}
                onClick={(event) => {
                  event.currentTarget.focus();
                }}
                fullWidth={true}
              ></TextField>
              {errorMessage.length ? (
                <Typography className={clsx(classes.errorMessage)}>
                  {errorMessage}
                </Typography>
              ) : null}
              <Button
                variant="contained"
                color="primary"
                onClick={() => signUpWithGitHubAccessToken()}
                fullWidth={true}
                disabled={resSignUpWithGitHubAccount.fetching}
              >
                {t("general/Continue")}
              </Button>
            </Card>
          </React.Fragment>
        ) : (
          <React.Fragment>
            {backBtn}
            <Typography variant={"h2"}>{title}</Typography>
            <Typography>{props.code}</Typography>
          </React.Fragment>
        )}
      </Box>
    </Box>
  );
}
