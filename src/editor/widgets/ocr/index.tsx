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
} from "@mui/material";
import { ThemeProvider, darken, styled } from "@mui/material/styles";
import { TrashCan } from "mdi-material-ui";
import React, { useEffect, useState } from "react";
import { renderWidget } from "../../../utilities/widgetRender";
import { notify } from "../../../lib/notifications";
import { useTranslation } from "react-i18next";
import { createWorker } from "tesseract.js";
import { globalContainers } from "../../../containers/global";

const WidgetCard = styled(Card)(({ theme }) => ({
  padding: theme.spacing(2),
  position: "relative",
}));

const ActionButtons = styled(Box)({
  position: "absolute",
  top: "0",
  right: "0",
});

const Section = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(2),
}));

const DropArea = styled(Box)(({ theme }) => ({
  "textAlign": "center",
  "padding": "24px",
  "border": "4px dotted #c7c7c7",
  "backgroundColor": darken(theme.palette.background.paper, 0.01),
  "cursor": "pointer",
  "&:hover": {
    backgroundColor: darken(theme.palette.background.paper, 0.2),
  },
}));

const CanvasWrapper = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(2),
  // height: 0,
  // paddingTop: "56.25%" // 16:9
}));

const ImageCanvas = styled("canvas")({
  maxWidth: "100%",
});

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
  const { t } = useTranslation();
  const [canvas, setCanvas] = useState<HTMLCanvasElement>(null);
  // https://github.com/tesseract-ocr/tesseract/wiki/Data-Files#data-files-for-version-400-november-29-2016
  const [link, setLink] = useState<string>("");
  const [imageDataURL, setImageDataURL] = useState<string>("");
  const [ocrDataURL, setOCRDataURL] = useState<string>("");
  const [imageDropAreaElement, setImageDropAreaElement] =
    useState<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [ocrProgresses, setOCRProgresses] = useState<OCRProgress[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(
    getInitialLanguages(),
  );
  // On unless it was turned off, which is stored as "false".
  const [grayscaleChecked, setGrayscaleChecked] = useState<boolean>(
    localStorage.getItem("widget/crossnote.ocr/grayscale") !== "false",
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
    if (!imageDropAreaElement) return;
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
      // A failure also rejects the step it happened in, which is handled
      // below; without a handler of its own, tesseract.js throws it again.
      errorHandler: () => {},
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

      // The worker's own script comes from a CDN as well. When it cannot be
      // had, tesseract.js never settles a step, but the worker it wraps
      // reports an error.
      const workerFailed = new Promise<never>((_, reject) => {
        (worker as unknown as { worker: Worker }).worker.addEventListener(
          "error",
          reject,
          { once: true },
        );
      });
      try {
        const {
          data: { text },
        } = await Promise.race([
          (async () => {
            await worker.load();
            await worker.loadLanguage(languagesArr.join("+"));
            await worker.initialize(languagesArr.join("+"));
            return await worker.recognize(input);
          })(),
          workerFailed,
        ]);
        props.replaceSelf("\n" + text);
      } catch (error) {
        // The engine and its language data come over the network; when they
        // cannot be had, say so and go back to the image.
        notify({
          severity: "error",
          message: t("widget/crossnote.ocr/failed"),
        });
      } finally {
        await worker.terminate();
        setIsProcessing(false);
      }
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
      <WidgetCard elevation={2}>
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
      </WidgetCard>
    );
  }

  if (imageDataURL) {
    return (
      <WidgetCard elevation={2}>
        <Section>
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
        </Section>
        <Section>
          <Typography variant={"subtitle1"} style={{ marginBottom: "8px" }}>
            {t("widget/crossnote.ocr/extra-settings")}
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={grayscaleChecked}
                onChange={() => {
                  localStorage.setItem(
                    "widget/crossnote.ocr/grayscale",
                    String(!grayscaleChecked),
                  );
                  setGrayscaleChecked(!grayscaleChecked);
                }}
                color={"primary"}
              ></Switch>
            }
            label={t("widget/crossnote.ocr/grayscale")}
          ></FormControlLabel>
        </Section>
        <CanvasWrapper>
          <ImageCanvas ref={(element) => setCanvas(element)}></ImageCanvas>
        </CanvasWrapper>
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
      </WidgetCard>
    );
  }

  return (
    <WidgetCard elevation={2}>
      <Typography variant={"h5"}>{t("widget/crossnote.ocr/ocr")}</Typography>
      <ActionButtons>
        <Tooltip title={t("general/Delete")}>
          <IconButton
            aria-label={t("general/Delete")}
            onClick={() => props.removeSelf()}
          >
            <TrashCan></TrashCan>
          </IconButton>
        </Tooltip>
      </ActionButtons>
      <Section>
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
      </Section>
      <Typography
        variant={"subtitle1"}
        style={{ marginTop: "16px", textAlign: "center" }}
      >
        {t("widget/crossnote.auth/Or")}
      </Typography>
      <Section>
        <Typography variant={"subtitle1"} style={{ marginBottom: "8px" }}>
          {t("widget/crossnote.ocr/local-image")}
        </Typography>
        <DropArea onClick={clickDropArea}>
          <Typography>
            {t("widget/crossnote.image/click-here-to-browse-image-file")}
          </Typography>
        </DropArea>
      </Section>
      <input
        type="file"
        // multiple
        style={{ display: "none" }}
        ref={(element: HTMLInputElement) => {
          setImageDropAreaElement(element);
        }}
      ></input>
    </WidgetCard>
  );
}

export const OCRWidgetCreator: WidgetCreator = (args) => {
  const el = document.createElement("span");
  renderWidget(
    <ThemeProvider theme={globalContainers.settingsContainer.theme.muiTheme}>
      <OCRWidget {...args}></OCRWidget>
    </ThemeProvider>,
    el,
  );
  return el;
};
