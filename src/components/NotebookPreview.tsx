import React from "react";
import { NotebookFieldsFragment } from "../generated/graphql";
import { Box } from "@material-ui/core";

interface Props {
  notebook: NotebookFieldsFragment;
}

export function NotebookPreview(props: Props) {
  return <Box></Box>;
}
