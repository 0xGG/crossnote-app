import { WidgetArgs, WidgetCreator } from "@0xgg/echomd/widget";
import {
  Box,
  Button,
  ButtonGroup,
  Card,
  Checkbox,
  FormControlLabel,
  FormGroup,
  IconButton,
  Input,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  Switch,
  Tooltip,
  Typography,
} from "@material-ui/core";
import {
  createStyles,
  darken,
  makeStyles,
  Theme,
  ThemeProvider,
} from "@material-ui/core/styles";
import clsx from "clsx";
import { TrashCan } from "mdi-material-ui";
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
import { createWorker } from "tesseract.js";
import { globalContainers } from "../../../containers/global";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    card: {
      padding: theme.spacing(2),
      position: "relative",
    },
    actionButtons: {
      position: "absolute",
      top: "0",
      right: "0",
    },
    section: {
      marginTop: theme.spacing(2),
    },
    dropArea: {
      "textAlign": "center",
      "padding": "24px",
      "border": "4px dotted #c7c7c7",
      "backgroundColor": darken(theme.palette.background.paper, 0.01),
      "cursor": "pointer",
      "&:hover": {
        backgroundColor: darken(theme.palette.background.paper, 0.2),
      },
    },
    canvasWrapper: {
      marginTop: theme.spacing(2),
      // height: 0,
      // paddingTop: "56.25%" // 16:9
    },
    canvas: {
      maxWidth: "100%",
    },
    disabled: {
      cursor: "not-allowed",
    },
  }),
);

interface OCRProgress {
  status: string;
  progress: number;
  workerId?: string;
}

function getInitialLanguages() {
  try {
    return JSON.parse(
      localStorage.getItem("widget/crossnote.ocr/languages") || '["eng"]',
    );
  } catch (error) {
    return ["eng"];
  }
}

function OCRWidget(props: WidgetArgs) {
  const classes = useStyles(props);
  const { t } = useTranslation();
  const [canvas, setCanvas] = useState<HTMLCanvasElement>(null);
  // https://github.com/tesseract-ocr/tesseract/wiki/Data-Files#data-files-for-version-400-november-29-2016
  const [link, setLink] = useState<string>("");
  const [imageDataURL, setImageDataURL] = useState<string>("");
  const [ocrDataURL, setOCRDataURL] = useState<string>("");
  const [imageDropAreaElement, setImageDropAreaElement] = useState<
    HTMLInputElement
  >(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [ocrProgresses, setOCRProgresses] = useState<OCRProgress[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(
    getInitialLanguages(),
  );
  const [grayscaleChecked, setGrayscaleChecked] = useState<boolean>(
    !!localStorage.getItem("widget/crossnote.ocr/grayscale") || true,
  );

  useEffect(() => {
    if (canvas && imageDataURL) {
      const imageObject = new Image();
      const context = canvas.getContext("2d");
      imageObject.onload = function () {
        canvas.width = imageObject.width;
        canvas.height = imageObject.height;
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (grayscaleChecked) {
          context.fillStyle = "#FFF";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.globalCompositeOperation = "luminosity";
        }
        context.drawImage(imageObject, 0, 0);
        setOCRDataURL(canvas.toDataURL());
      };
      imageObject.onerror = (error) => {
        throw error;
      };
      imageObject.setAttribute("crossOrigin", "anonymous");
      imageObject.src = imageDataURL;
    }
  }, [canvas, imageDataURL, grayscaleChecked]);

  function clickDropArea(e: any) {
    e.preventDefault();
    e.stopPropagation();
    if (!imageDropAreaElement || isProcessing) return;
    imageDropAreaElement.onchange = function (event) {
      const target = event.target as any;
      const files = target.files || [];
      if (files.length) {
        try {
          const file = files[0] as File;
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => {
            setImageDataURL(reader.result as string);
          };
          reader.onerror = (error) => {
            throw error;
          };
        } catch (error) {}
      }
    };
    imageDropAreaElement.click();
  }

  function startOCRFromLink() {
    try {
      setImageDataURL(link);
    } catch (error) {}
  }

  function ocr(input: File | string | HTMLCanvasElement) {
    const worker = createWorker({
      logger: (m: OCRProgress) => {
        setOCRProgresses((ocrProgresses) => {
          if (
            ocrProgresses.length &&
            ocrProgresses[ocrProgresses.length - 1].status === m.status
          ) {
            return [...ocrProgresses.slice(0, ocrProgresses.length - 1), m];
          } else {
            return [...ocrProgresses, m];
          }
        });
      },
    });

    (async () => {
      setIsProcessing(true);
      let languagesArr = selectedLanguages;
      if (languagesArr.length === 0) {
        languagesArr = ["eng"];
      }

      await worker.load();
      await worker.loadLanguage(languagesArr.join("+"));
      await worker.initialize(languagesArr.join("+"));
      const {
        data: { text },
      } = await worker.recognize(input);
      props.replaceSelf("\n" + text);
      await worker.terminate();
      setIsProcessing(false);
    })();
  }

  function toggleLanguage(lang: string) {
    setSelectedLanguages((selectedLanguages) => {
      const offset = selectedLanguages.indexOf(lang);
      if (offset >= 0) {
        selectedLanguages.splice(offset, 1);
        selectedLanguages = [...selectedLanguages];
      } else {
        selectedLanguages = [...selectedLanguages, lang];
      }
      localStorage.setItem(
        "widget/crossnote.ocr/languages",
        JSON.stringify(selectedLanguages),
      );
      return selectedLanguages;
    });
  }

  if (props.isPreview) {
    return <span></span>;
  }

  if (isProcessing) {
    return (
      <Card elevation={2} className={clsx(classes.card)}>
        <Typography variant={"h5"}>{t("general/Processing")}</Typography>
        {/*<Typography variant={"body1"}>{t("general/please-wait")}</Typography>*/}
        <List>
          {ocrProgresses.length > 0 && (
            <ListItem>
              <ListItemText>
                {t(
                  "tesseract/" + ocrProgresses[ocrProgresses.length - 1].status,
                )}
              </ListItemText>
              <ListItemSecondaryAction>
                {Math.floor(
                  ocrProgresses[ocrProgresses.length - 1].progress * 100,
                ).toString() + "%"}
              </ListItemSecondaryAction>
            </ListItem>
          )}
        </List>
      </Card>
    );
  }

  if (imageDataURL) {
    return (
      <Card elevation={2} className={clsx(classes.card)}>
        <Box className={clsx(classes.section)}>
          <Typography variant={"subtitle1"} style={{ marginBottom: "8px" }}>
            {t("widget/crossnote.ocr/recognize-text-in-languages")}
          </Typography>
          <FormGroup>
            <FormControlLabel
              control={
                <Checkbox
                  checked={selectedLanguages.indexOf("eng") >= 0}
                  onChange={() => toggleLanguage("eng")}
                  value="eng"
                />
              }
              label="English"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={selectedLanguages.indexOf("chi_sim") >= 0}
                  onChange={() => toggleLanguage("chi_sim")}
                  value="chi_sim"
                />
              }
              label="简体中文"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={selectedLanguages.indexOf("chi_tra") >= 0}
                  onChange={() => toggleLanguage("chi_tra")}
                  value="chi_tra"
                />
              }
              label="繁體中文"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={selectedLanguages.indexOf("jpn") >= 0}
                  onChange={() => toggleLanguage("jpn")}
                  value="jpn"
                />
              }
              label="日本語"
            />
          </FormGroup>
        </Box>
        <Box className={clsx(classes.section)}>
          <Typography variant={"subtitle1"} style={{ marginBottom: "8px" }}>
            {t("widget/crossnote.ocr/extra-settings")}
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={grayscaleChecked}
                onChange={() => {
                  if (grayscaleChecked) {
                    localStorage.removeItem("widget/crossnote.ocr/grayscale");
                  } else {
                    localStorage.setItem(
                      "widget/crossnote.ocr/grayscale",
                      "true",
                    );
                  }
                  setGrayscaleChecked(!grayscaleChecked);
                }}
                color={"primary"}
              ></Switch>
            }
            label={t("widget/crossnote.ocr/grayscale")}
          ></FormControlLabel>
        </Box>
        <Box className={clsx(classes.canvasWrapper)}>
          <canvas
            className={clsx(classes.canvas)}
            ref={(element) => setCanvas(element)}
          ></canvas>
        </Box>
        <ButtonGroup>
          <Button
            onClick={() => {
              setImageDataURL("");
              setOCRDataURL("");
            }}
          >
            {t("general/go-back")}
          </Button>
          <Button
            color={"primary"}
            onClick={() => ocr(ocrDataURL)}
            disabled={!ocrDataURL}
          >
            {t("widget/crossnote.ocr/start-ocr")}
          </Button>
        </ButtonGroup>
      </Card>
    );
  }

  return (
    <Card elevation={2} className={clsx(classes.card)}>
      <Typography variant={"h5"}>{t("widget/crossnote.ocr/ocr")}</Typography>
      <Box className={clsx(classes.actionButtons)}>
        <Tooltip title={t("general/Delete")}>
          <IconButton onClick={() => props.removeSelf()}>
            <TrashCan></TrashCan>
          </IconButton>
        </Tooltip>
      </Box>
      <Box className={clsx(classes.section)}>
        <Typography variant={"subtitle1"} style={{ marginBottom: "8px" }}>
          {t("general/Link")}
        </Typography>
        <Input
          margin={"dense"}
          placeholder={t("widget/crossnote.image/image-url-placeholder")}
          value={link}
          onChange={(event) => {
            setLink(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.which === 13) {
              startOCRFromLink();
            }
          }}
          fullWidth={true}
        ></Input>
      </Box>
      <Typography
        variant={"subtitle1"}
        style={{ marginTop: "16px", textAlign: "center" }}
      >
        {t("widget/crossnote.auth/Or")}
      </Typography>
      <Box className={clsx(classes.section)}>
        <Typography variant={"subtitle1"} style={{ marginBottom: "8px" }}>
          {t("widget/crossnote.ocr/local-image")}
        </Typography>
        <Box
          className={clsx(
            classes.dropArea,
            isProcessing ? classes.disabled : null,
          )}
          onClick={clickDropArea}
        >
          <Typography>
            {isProcessing
              ? t("utils/uploading-image")
              : t("widget/crossnote.image/click-here-to-browse-image-file")}
          </Typography>
        </Box>
      </Box>
      <input
        type="file"
        // multiple
        style={{ display: "none" }}
        ref={(element: HTMLInputElement) => {
          setImageDropAreaElement(element);
        }}
      ></input>
    </Card>
  );
}

export const OCRWidgetCreator: WidgetCreator = (args) => {
  const el = document.createElement("span");
  ReactDOM.render(
    <ThemeProvider theme={globalContainers.settingsContainer.theme.muiTheme}>
      <OCRWidget {...args}></OCRWidget>
    </ThemeProvider>,
    el,
  );
  return el;
};
