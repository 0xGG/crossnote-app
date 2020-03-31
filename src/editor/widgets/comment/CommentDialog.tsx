import React, { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, Typography } from "@material-ui/core";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import { CommentWidgetFieldsFragment } from "../../../generated/graphql";

const useStyles = makeStyles((theme: Theme) => createStyles({}));

interface Props {
  open: boolean;
  onClose: () => void;
  commentWidget: CommentWidgetFieldsFragment;
}
export function CommentDialog(props: Props) {
  const commentWidget = props.commentWidget;

  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth={true}>
      <DialogContent>
        <Typography>This is comment dialog</Typography>
      </DialogContent>
    </Dialog>
  );
}
