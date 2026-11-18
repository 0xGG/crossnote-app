import { Box, Typography } from "@mui/material";
import { styled, useTheme } from "@mui/material/styles";
import * as d3 from "d3";
import { TabNode } from "flexlayout-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import { EventType, FocusedOnNoteEventData, globalEmitter } from "../lib/event";
import {
  constructGraphView,
  GraphViewData,
  GraphViewNode,
} from "../lib/graphView";
import { Notebook } from "../lib/notebook";
import { onTabVisibility } from "../lib/tabVisibility";
import { TabNodeConfig } from "../lib/tabNode";

const bottomPanelHeight = 20;
const defaultFillColor = `#aaa`;
const GraphViewPanel = styled(Box)({
  width: "100%",
  height: "100%",
});

// The nodes and arrows are drawn by d3, not by React; styled keeps the class on
// the same container, so these selectors reach the same elements.
const GraphViewCanvas = styled("div")({
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
});

const BottomPanel = styled(Box)(({ theme }) => ({
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
}));

const FilePath = styled(Typography)({
  wordBreak: "break-all",
});

interface Props {
  notebook: Notebook;
  tabNode: TabNode;
}

export default function GraphView(props: Props) {
  const [graphViewData, setGraphViewData] = useState<GraphViewData>({
    signature: "",
    nodes: [],
    links: [],
  });
  const graphView = useRef<HTMLDivElement>(null);
  const [hoveredGraphViewNode, setHoveredGraphViewNode] =
    useState<GraphViewNode>(null);
  const [focusedNoteFilePath, setFocusedNoteFilePath] = useState<string>(null);
  const [tabNodeVisible, setTabNodeVisible] = useState<boolean>(false);
  const { t } = useTranslation();
  const { openNoteAtPath } = CrossnoteContainer.useContainer();
  const theme = useTheme();
  const resources = useRef<{
    resize: () => void;
    focus: (node: GraphViewNode) => void;
  }>(null);
  const transform = useRef(d3.zoomIdentity);
  const focusedPath = useRef<string>(null);
  const refreshGraphViewData = useCallback(() => {
    const next = constructGraphView(props.notebook);
    setGraphViewData((current) =>
      current.signature === next.signature ? current : next,
    );
  }, [props.notebook]);

  useEffect(() => {
    if (!props.tabNode || !tabNodeVisible) return;
    let timer: ReturnType<typeof setTimeout>;
    const resize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => resources.current?.resize(), 1000);
    };
    window.addEventListener("resize", resize);
    props.tabNode.setEventListener("resize", resize);
    resources.current?.resize();
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", resize);
      props.tabNode.removeEventListener("resize");
    };
  }, [props.tabNode, tabNodeVisible, graphViewData]);

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

    let timer: ReturnType<typeof setTimeout> = setTimeout(
      () => setTabNodeVisible(props.tabNode.isVisible()),
      0,
    );
    const unsubscribe = onTabVisibility(props.tabNode, (visible) => {
      clearTimeout(timer);
      timer = setTimeout(() => setTabNodeVisible(visible), 0);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [props.tabNode, props.notebook.dir]);

  // Emitter
  useEffect(() => {
    if (!tabNodeVisible) {
      return;
    }

    const refreshIfCurrent = ({ notebookPath }: { notebookPath: string }) => {
      if (notebookPath === props.notebook.dir) refreshGraphViewData();
    };

    const focusedOnNoteCallback = (data: FocusedOnNoteEventData) => {
      if (data.notebookPath === props.notebook.dir) {
        setFocusedNoteFilePath(data.noteFilePath);
      }
    };

    globalEmitter.on(EventType.ModifiedMarkdown, refreshIfCurrent);
    globalEmitter.on(EventType.CreatedNote, refreshIfCurrent);
    globalEmitter.on(EventType.DeletedNote, refreshIfCurrent);
    globalEmitter.on(EventType.ChangedNoteFilePath, refreshIfCurrent);
    globalEmitter.on(EventType.PerformedGitOperation, refreshIfCurrent);
    globalEmitter.on(EventType.FocusedOnNote, focusedOnNoteCallback);
    return () => {
      globalEmitter.off(EventType.ModifiedMarkdown, refreshIfCurrent);
      globalEmitter.off(EventType.CreatedNote, refreshIfCurrent);
      globalEmitter.off(EventType.DeletedNote, refreshIfCurrent);
      globalEmitter.off(EventType.ChangedNoteFilePath, refreshIfCurrent);
      globalEmitter.off(EventType.PerformedGitOperation, refreshIfCurrent);
      globalEmitter.off(EventType.FocusedOnNote, focusedOnNoteCallback);
    };
  }, [refreshGraphViewData, props.notebook, props.tabNode, tabNodeVisible]);

  useEffect(() => {
    if (!tabNodeVisible) return;
    let cancelled = false;
    props.notebook
      .refreshNotesIfNotLoaded({ dir: "./", includeSubdirectories: true })
      .then(() => {
        if (!cancelled) refreshGraphViewData();
      })
      .catch((error) => {
        if (!cancelled) console.error(error);
      });
    return () => {
      cancelled = true;
    };
  }, [props.notebook, tabNodeVisible, refreshGraphViewData]);

  useEffect(() => {
    const element = graphView.current;
    if (!element) return;
    const svg = d3
      .select(element)
      .append("svg")
      .attr("width", element.offsetWidth)
      .attr("height", element.offsetHeight);
    const container = svg.append("g");
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        transform.current = event.transform;
        container.attr("transform", event.transform);
      });
    svg.call(zoom).call(zoom.transform, transform.current);
    const link = container
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(graphViewData.links)
      .enter()
      .append("line")
      .style("stroke", defaultFillColor)
      .attr("stroke-width", "0.5px");
    const node = container
      .append("g")
      .attr("class", "nodes")
      .selectAll("circle")
      .data(graphViewData.nodes)
      .enter()
      .append("circle")
      .attr("r", 8)
      .style("fill", defaultFillColor);
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
    const fixna = (x: number) => (Number.isFinite(x) ? x : 0);
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const simulation = d3
      .forceSimulation(
        graphViewData.nodes as (GraphViewNode & d3.SimulationNodeDatum)[],
      )
      .force("charge", d3.forceManyBody().strength(-3000))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("x", d3.forceX(width / 2).strength(1))
      .force("y", d3.forceY(height / 2).strength(1))
      .force(
        "link",
        d3
          .forceLink(graphViewData.links)
          .id((d) => (d as GraphViewNode).id)
          .distance(100)
          .strength(1),
      )
      .on("tick", () => {
        node.attr(
          "transform",
          (d: any) => `translate(${fixna(d.x)},${fixna(d.y)})`,
        );
        text.attr(
          "transform",
          (d: any) => `translate(${fixna(d.x)},${fixna(d.y)})`,
        );
        link
          .attr("x1", (d: any) => fixna(d.source.x))
          .attr("y1", (d: any) => fixna(d.source.y))
          .attr("x2", (d: any) => fixna(d.target.x))
          .attr("y2", (d: any) => fixna(d.target.y));
      });
    const resize = () => {
      const width = element.offsetWidth,
        height = element.offsetHeight;
      svg.attr("width", width).attr("height", height);
      simulation
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("x", d3.forceX(width / 2).strength(1))
        .force("y", d3.forceY(height / 2).strength(1));
    };
    resize();
    const removeArrows = () => {
      container.selectAll(".arrows circle").interrupt();
      container.selectAll(".arrows").remove();
    };
    const unfocus = () => {
      node.style("fill", defaultFillColor);
      link.style("stroke", defaultFillColor);
      removeArrows();
      setHoveredGraphViewNode(null);
    };
    const focus = (d: GraphViewNode) => {
      node
        .filter(
          (o) =>
            o.id === d.id ||
            props.notebook.referenceMap.hasRelation(o.id, d.id),
        )
        .style("fill", (o) =>
          o.id === d.id
            ? theme.palette.primary.main
            : theme.palette.primary.light,
        );
      link.style("stroke", (o: any) =>
        o.source.id === d.id || o.target.id === d.id
          ? theme.palette.primary.light
          : defaultFillColor,
      );
      removeArrows();
      const arrow = container
        .append("g")
        .attr("class", "arrows")
        .selectAll("circle")
        .data(graphViewData.links)
        .enter()
        .filter(
          (l: any) =>
            (l.source.id === d.id || l.target.id === d.id) &&
            l.source.id !== l.target.id,
        )
        .append("circle")
        .style("fill", theme.palette.primary.light)
        .attr("r", 2);
      const repeat = () => {
        arrow
          .attr("cx", (l: any) => l.source.x)
          .attr("cy", (l: any) => l.source.y)
          .transition()
          .duration(1500)
          .ease(d3.easeLinear)
          .attr("cx", (l: any) => l.target.x)
          .attr("cy", (l: any) => l.target.y)
          .on("end", repeat);
      };
      repeat();
      setHoveredGraphViewNode(d);
    };
    node
      .on("mouseover", (_event, d) => focus(d))
      .on("mouseout", unfocus)
      .on("click", (_event, d) => openNoteAtPath(props.notebook, d.id));
    node.call(
      d3
        .drag<SVGCircleElement, GraphViewNode>()
        .on("start", function (event) {
          event.sourceEvent.stopPropagation();
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d3.select(this).attr("stroke", "black");
        })
        .on("drag", function (event, d: any) {
          d.x = event.x;
          d.y = event.y;
          d3.select(this).raise().attr("transform", `translate(${d.x},${d.y})`);
        })
        .on("end", function (event) {
          if (!event.active) simulation.alphaTarget(0);
          d3.select(this).attr("stroke", null);
        }),
    );
    const focusNote = (d: GraphViewNode) => {
      unfocus();
      focus(d);
    };
    resources.current = { resize, focus: focusNote };
    const focusedNode = graphViewData.nodes.find(
      (n) => n.id === focusedPath.current,
    );
    if (focusedNode) focusNote(focusedNode);
    return () => {
      resources.current = null;
      simulation.on("tick", null).stop();
      removeArrows();
      node
        .on(".drag", null)
        .on("mouseover", null)
        .on("mouseout", null)
        .on("click", null);
      // An active pan can keep receiving window events until mouseup.
      zoom.on("zoom", null);
      svg.interrupt().on(".zoom", null).remove();
    };
  }, [
    graphViewData,
    props.notebook,
    theme.palette.text.primary,
    theme.palette.primary.main,
    theme.palette.primary.light,
    openNoteAtPath,
  ]);

  useEffect(() => {
    focusedPath.current = focusedNoteFilePath;
    if (!focusedNoteFilePath) return;
    const node = graphViewData.nodes.find((n) => n.id === focusedNoteFilePath);
    if (node) resources.current?.focus(node);
  }, [focusedNoteFilePath, graphViewData]);

  return (
    <GraphViewPanel>
      <GraphViewCanvas ref={graphView}></GraphViewCanvas>
      {graphViewData && (
        <BottomPanel className={"editor-bottom-panel"}>
          <FilePath variant={"caption"}>
            {props.notebook.name +
              (hoveredGraphViewNode ? ": " + hoveredGraphViewNode.id : "")}
          </FilePath>
          <FilePath variant={"caption"}>
            {`${graphViewData.nodes.length} ${t("graph-view/node")}, ${
              graphViewData.links.length
            } ${t("graph-view/link")} `}
          </FilePath>
        </BottomPanel>
      )}
    </GraphViewPanel>
  );
}
