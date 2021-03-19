import { debounce } from "@0xgg/echomd";
import { Box, Typography } from "@material-ui/core";
import {
  createStyles,
  makeStyles,
  Theme,
  useTheme,
} from "@material-ui/core/styles";
import clsx from "clsx";
import * as d3 from "d3";
import { TabNode } from "flexlayout-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import {
  ChangedNoteFilePathEventData,
  CreatedNoteEventData,
  DeletedNotebookEventData,
  DeletedNoteEventData,
  EventType,
  FocusedOnNoteEventData,
  globalEmitter,
  ModifiedMarkdownEventData,
  PerformedGitOperationEventData,
} from "../lib/event";
import {
  constructGraphView,
  GraphViewData,
  GraphViewLink,
  GraphViewNode,
} from "../lib/graphView";
import { Notebook } from "../lib/notebook";
import { TabNodeConfig } from "../lib/tabNode";

const bottomPanelHeight = 20;
const defaultFillColor = `#aaa`;
const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    graphViewPanel: {
      width: "100%",
      height: "100%",
      /*
      "& .tooltip": {
        position: "absolute",
        width: "200px",
        backgroundColor: fade(theme.palette.grey[700], 0.9),
        borderRadius: theme.shape.borderRadius,
        color: theme.palette.common.white,
        fontFamily: theme.typography.fontFamily,
        padding: "4px 8px",
        fontSize: theme.typography.pxToRem(10),
        lineHeight: `${round(14 / 10)}em`,
        maxWidth: 300,
        wordWrap: "break-word",
        fontWeight: theme.typography.fontWeightMedium,
      },
      */
    },
    graphView: {
      "position": "relative",
      "height": `calc(100% - ${bottomPanelHeight}px)`,
      "display": "block",
      "& .nodes": {
        zIndex: 10,
      },
      "& .nodes > circle": {
        cursor: "pointer",
        zIndex: 10,
      },
      "& .arrows": {
        zIndex: 5,
        pointerEvents: "none",
      },
      "& .arrows > circle": {
        zIndex: 5,
        pointerEvents: "none",
      },
    },
    bottomPanel: {
      position: "absolute",
      bottom: "0",
      width: "100%",
      padding: theme.spacing(0.5, 1),
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      maxHeight: `${bottomPanelHeight}px`,
      backgroundColor: theme.palette.primary.main,
      color: theme.palette.getContrastText(theme.palette.primary.main),
    },
    filePath: {
      wordBreak: "break-all",
    },
  }),
);

interface Props {
  notebook: Notebook;
  tabNode: TabNode;
}

export default function GraphView(props: Props) {
  const classes = useStyles();
  const [graphViewData, setGraphViewData] = useState<GraphViewData>({
    hash: "",
    nodes: [],
    links: [],
  });
  const graphView = useRef<HTMLDivElement>(null);
  const [
    hoveredGraphViewNode,
    setHoveredGraphViewNode,
  ] = useState<GraphViewNode>(null);
  const [focusedNoteFilePath, setFocusedNoteFilePath] = useState<string>(null);
  const [tabNodeVisible, setTabNodeVisible] = useState<boolean>(false);
  const { t } = useTranslation();
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const theme = useTheme();
  const isMounted = useRef<boolean>(false);

  // Graph related variables
  const [graphLayout, setGraphLayout] = useState<
    d3.Simulation<d3.SimulationNodeDatum, undefined>
  >(null);
  const [svg, setSVG] = useState<
    d3.Selection<SVGSVGElement, unknown, HTMLDivElement, undefined>
  >(null);
  const [container, setContainer] = useState<
    d3.Selection<SVGGElement, unknown, SVGSVGElement, undefined>
  >(null);
  const [link, setLink] = useState<
    d3.Selection<SVGLineElement, GraphViewLink, SVGGElement, unknown>
  >(null);
  const [node, setNode] = useState<
    d3.Selection<SVGCircleElement, GraphViewNode, SVGGElement, unknown>
  >(null);
  const [text, setText] = useState<
    d3.Selection<SVGTextElement, GraphViewNode, SVGGElement, unknown>
  >(null);

  const neigh = useCallback(
    (n1: GraphViewNode, n2: GraphViewNode) => {
      if (!props.notebook) {
        return false;
      } else {
        return props.notebook.referenceMap.hasRelation(n1.id, n2.id);
      }
    },
    [props.notebook],
  );

  const removeArrows = useCallback(() => {
    if (svg) {
      svg.selectAll(".arrows").remove();
    }
  }, [svg]);

  const drawArrowPath = useCallback(
    (d: GraphViewNode) => {
      if (!container) {
        return;
      }
      removeArrows();
      const arrow = container
        .append("g")
        .attr("class", "arrows")
        .selectAll("g")
        .data(graphViewData.links)
        .enter()
        .filter(function (l) {
          return (
            ((l.source as any).id === d.id || (l.target as any).id === d.id) &&
            (l.source as any).id !== (l.target as any).id
          );
        })
        .append("circle")
        .style("fill", theme.palette.primary.light)
        .attr("r", 2);

      const repeat = () => {
        if (!arrow) {
          return;
        }
        arrow
          .attr("cx", function (l: any) {
            return (l.source as any).x;
          })
          .attr("cy", function (l: any) {
            return (l.source as any).y;
          })
          .transition()
          .duration(1500)
          .ease(d3.easeLinear)
          .attr("cx", function (l: any) {
            return (l.target as any).x;
          })
          .attr("cy", function (l: any) {
            return (l.target as any).y;
          })
          .on("end", repeat);
      };
      repeat();
    },
    [container, graphViewData.links, removeArrows, theme.palette.primary.light],
  );

  const focus = useCallback(
    (event: any, d: GraphViewNode) => {
      if (!node || !link) {
        return;
      }
      node
        .filter(function (o) {
          return o.id === d.id || neigh(o, d);
        })
        .style("fill", function (o) {
          return o.id === d.id
            ? theme.palette.primary.main
            : neigh(o, d)
            ? theme.palette.primary.light
            : defaultFillColor;
        });
      link.style("stroke", function (o) {
        return (o.source as any).id === d.id || (o.target as any).id === d.id
          ? theme.palette.primary.light
          : defaultFillColor;
      });
      drawArrowPath(d);
      setHoveredGraphViewNode(d);
    },
    [
      node,
      link,
      drawArrowPath,
      neigh,
      theme.palette.primary.main,
      theme.palette.primary.light,
    ],
  );

  const unfocus = useCallback(() => {
    if (!node || !link) {
      return;
    }
    node.style("fill", defaultFillColor);
    link.style("stroke", defaultFillColor);
    removeArrows();
    setHoveredGraphViewNode(null);
  }, [node, link, removeArrows]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (
      !graphView ||
      !graphLayout ||
      !graphView.current ||
      !props.tabNode ||
      !tabNodeVisible
    ) {
      return;
    }
    const resize = () => {
      const width = graphView.current.offsetWidth;
      const height = graphView.current.offsetHeight;
      d3.select(graphView.current)
        .selectChild()
        .attr("width", width)
        .attr("height", height);
      graphLayout
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("x", d3.forceX(width / 2).strength(1))
        .force("y", d3.forceY(height / 2).strength(1));
    };
    const debouncedResize = debounce(resize, 1000);
    window.addEventListener("resize", debouncedResize);
    props.tabNode.setEventListener("resize", debouncedResize);
    resize();

    return () => {
      window.removeEventListener("resize", debouncedResize);
      props.tabNode.removeEventListener("resize");
    };
  }, [graphView, graphLayout, props.tabNode, tabNodeVisible]);

  // Visibility
  useEffect(() => {
    if (!props.tabNode) {
      return;
    }
    const tabNodeConfig: TabNodeConfig = props.tabNode.getConfig();
    if (
      tabNodeConfig.component !== "Graph" ||
      tabNodeConfig.notebookPath !== props.notebook.dir
    ) {
      return;
    }

    setTabNodeVisible(props.tabNode.isVisible());
    props.tabNode.setEventListener("visibility", function (params) {
      if (isMounted.current) {
        setTabNodeVisible(params.visible);
      }
    });
    return () => {
      props.tabNode.removeEventListener("visibility");
    };
  }, [props.tabNode, props.notebook.dir]);

  // Emitter
  useEffect(() => {
    if (!graphView || !props.notebook || !tabNodeVisible || !props.tabNode) {
      return;
    }

    const refreshGraphViewData = () => {
      // TODO: Improve the diff
      const newGraphViewData = constructGraphView(props.notebook);
      if (newGraphViewData.hash !== graphViewData.hash) {
        setGraphViewData(newGraphViewData);
      }
    };

    const modifiedMarkdownCallback = (data: ModifiedMarkdownEventData) => {
      if (data.notebookPath === props.notebook.dir) {
        refreshGraphViewData();
      }
    };
    const createdNoteCallback = (data: CreatedNoteEventData) => {
      if (data.notebookPath === props.notebook.dir) {
        refreshGraphViewData();
      }
    };
    const deletedNoteCallback = (data: DeletedNoteEventData) => {
      if (data.notebookPath === props.notebook.dir) {
        refreshGraphViewData();
      }
    };
    const changedNoteFilePathCallback = (
      data: ChangedNoteFilePathEventData,
    ) => {
      if (data.notebookPath === props.notebook.dir) {
        refreshGraphViewData();
      }
    };
    const performedGitOperationCallback = (
      data: PerformedGitOperationEventData,
    ) => {
      if (data.notebookPath === props.notebook.dir) {
        refreshGraphViewData();
      }
    };
    const deletedNotebookCallback = (data: DeletedNotebookEventData) => {
      if (data.notebookPath === props.notebook.dir) {
        crossnoteContainer.closeTabNode(props.tabNode.getId());
      }
    };

    const focusedOnNoteCallback = (data: FocusedOnNoteEventData) => {
      if (data.notebookPath === props.notebook.dir) {
        setFocusedNoteFilePath(data.noteFilePath);
      }
    };

    globalEmitter.on(EventType.ModifiedMarkdown, modifiedMarkdownCallback);
    globalEmitter.on(EventType.CreatedNote, createdNoteCallback);
    globalEmitter.on(EventType.DeletedNote, deletedNoteCallback);
    globalEmitter.on(
      EventType.ChangedNoteFilePath,
      changedNoteFilePathCallback,
    );
    globalEmitter.on(
      EventType.PerformedGitOperation,
      performedGitOperationCallback,
    );
    globalEmitter.on(EventType.DeletedNotebook, deletedNotebookCallback);
    globalEmitter.on(EventType.FocusedOnNote, focusedOnNoteCallback);
    return () => {
      globalEmitter.off(EventType.ModifiedMarkdown, modifiedMarkdownCallback);
      globalEmitter.off(EventType.CreatedNote, createdNoteCallback);
      globalEmitter.off(EventType.DeletedNote, deletedNoteCallback);
      globalEmitter.off(
        EventType.ChangedNoteFilePath,
        changedNoteFilePathCallback,
      );
      globalEmitter.off(
        EventType.PerformedGitOperation,
        performedGitOperationCallback,
      );
      globalEmitter.off(EventType.DeletedNotebook, deletedNotebookCallback);
      globalEmitter.off(EventType.FocusedOnNote, focusedOnNoteCallback);
    };
  }, [
    crossnoteContainer.closeTabNode,
    graphViewData.hash,
    props.notebook,
    props.tabNode,
    tabNodeVisible,
  ]);

  useEffect(() => {
    if (!tabNodeVisible) {
      return;
    }

    props.notebook
      .refreshNotesIfNotLoaded({ dir: "./", includeSubdirectories: true })
      .then(() => {
        const data = constructGraphView(props.notebook);
        setGraphViewData(data);
      })
      .catch((error) => {
        console.error(error);
      });
  }, [props.notebook, tabNodeVisible]);

  useEffect(() => {
    if (!graphView || !graphView.current || !graphViewData) {
      return;
    }

    const svg = d3
      .select(graphView.current)
      .append("svg")
      .attr("width", graphView.current.offsetWidth)
      .attr("height", graphView.current.offsetHeight);
    setSVG(svg);

    const container = svg.append("g");
    setContainer(container);

    const zoomHandler = d3
      .zoom()
      .scaleExtent([0.1, 4])
      .on("zoom", function (event: any) {
        container.attr("transform", event.transform);
      });
    zoomHandler(svg as any);

    const link = container
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(graphViewData.links)
      .enter()
      .append("line")
      .style("stroke", defaultFillColor)
      .attr("stroke-width", "0.5px");
    setLink(link);

    const node = container
      .append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(graphViewData.nodes)
      .enter()
      .append("circle")
      .attr("r", 8)
      .style("fill", defaultFillColor);
    setNode(node);

    const text = container
      .append("g")
      .attr("class", "labelNodes")
      .selectAll("text")
      .data(graphViewData.nodes)
      .enter()
      .append("text")
      .text((d) => d.label)
      .style("fill", theme.palette.text.primary)
      .style("font-family", "Arial")
      .style("font-size", 12)
      .style("pointer-events", "none");
    setText(text);

    console.log("simulated");
    return () => {
      console.log("destroyed");
      svg.remove();
      setSVG(null);
      setContainer(null);
      setNode(null);
      setLink(null);
      setText(null);
    };
  }, [
    graphViewData,
    graphView,
    props.notebook,
    theme.palette.text,
    theme.palette.primary,
    crossnoteContainer.openNoteAtPath,
  ]);

  useEffect(() => {
    if (!svg || !container || !link || !node || !text) {
      return;
    }
    /*
    // Define the div for the tooltip
    const tooltip = d3
      .select(graphView.current)
      .append("div")
      .attr("class", "tooltip")
      .style("opacity", 0);
      */

    const fixna = (x: number) => {
      if (isFinite(x)) return x;
      return 0;
    };

    const dragstarted = function (event: any, d: any) {
      event.sourceEvent.stopPropagation();
      if (!d.active) graphLayout.alphaTarget(0.3).restart();

      // @ts-ignore
      d3.select(this).attr("stroke", "black");
    };

    const dragged = function (event: any, d: any) {
      d.x = event.x;
      d.y = event.y;
      // @ts-ignore
      d3.select(this as SVGCircleElement)
        .raise()
        .attr("transform", (d: any) => "translate(" + [d.x, d.y] + ")");
    };

    const dragended = function (event: any, d: any) {
      if (!d.active) graphLayout.alphaTarget(0);

      // @ts-ignore
      d3.select(this).attr("stroke", null);
    };

    const updateLink = (link: any) => {
      link
        .attr("x1", function (d: any) {
          return fixna(d.source.x);
        })
        .attr("y1", function (d: any) {
          return fixna(d.source.y);
        })
        .attr("x2", function (d: any) {
          return fixna(d.target.x);
        })
        .attr("y2", function (d: any) {
          return fixna(d.target.y);
        });
    };

    const updateNode = (node: any) => {
      node.attr("transform", function (d: any) {
        return "translate(" + fixna(d.x) + "," + fixna(d.y) + ")";
      });
    };

    const ticked = () => {
      // console.log("ticked");
      node.call(updateNode);
      link.call(updateLink);
      text.call(updateNode);
    };

    const width = graphView.current.offsetWidth;
    const height = graphView.current.offsetHeight;
    const graphLayout = d3
      .forceSimulation(graphViewData.nodes as any)
      .force("charge", d3.forceManyBody().strength(-3000))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("x", d3.forceX(width / 2).strength(1))
      .force("y", d3.forceY(height / 2).strength(1))
      .force(
        "link",
        d3
          .forceLink(graphViewData.links)
          .id(function (d) {
            return (d as GraphViewNode).id;
          })
          .distance(100)
          .strength(1),
      )
      .on("tick", ticked);
    setGraphLayout(graphLayout);

    node.on("mouseover", focus).on("mouseout", unfocus);
    const drag = d3
      .drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended);
    drag(node as any);

    node.on("click", (event: any, d: GraphViewNode) => {
      crossnoteContainer.openNoteAtPath(props.notebook, d.id);
    });
  }, [
    svg,
    container,
    link,
    node,
    text,
    crossnoteContainer.openNoteAtPath,
    graphViewData.links,
    graphViewData.nodes,
    focus,
    unfocus,
    props.notebook,
  ]);

  useEffect(() => {
    if (focusedNoteFilePath) {
      const d = graphViewData.nodes.find((n) => n.id === focusedNoteFilePath);
      if (d) {
        unfocus();
        focus(null, d);
      }
    }
  }, [focusedNoteFilePath, unfocus, focus, graphViewData.nodes]);

  return (
    <Box className={clsx(classes.graphViewPanel)}>
      <div className={clsx(classes.graphView)} ref={graphView}></div>
      {graphViewData && (
        <Box className={clsx(classes.bottomPanel, "editor-bottom-panel")}>
          <Typography variant={"caption"} className={clsx(classes.filePath)}>
            {props.notebook.name +
              (hoveredGraphViewNode ? ": " + hoveredGraphViewNode.id : "")}
          </Typography>
          <Typography variant={"caption"} className={clsx(classes.filePath)}>
            {`${graphViewData.nodes.length} ${t("graph-view/node")}, ${
              graphViewData.links.length
            } ${t("graph-view/link")} `}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
