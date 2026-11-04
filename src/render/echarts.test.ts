import { describe, expect, it, vi } from "vitest";
import { renderEcharts, usesGL, withoutPageAccess } from "./echarts";

// echarts draws on a canvas, which jsdom does not have: the chart here
// says it is drawn when the test says so.
const stub = vi.hoisted(() => {
  const chart = {
    listeners: {} as Record<string, () => void>,
    on(event: string, listener: () => void) {
      chart.listeners[event] = listener;
    },
    setOption: (_option: unknown) => {},
    dispose: () => {},
    finish: () => chart.listeners["finished"]?.(),
  };
  return { chart, init: (..._args: unknown[]) => chart };
});
vi.mock("echarts", () => ({
  init: (...args: unknown[]) => stub.init(...args),
}));

async function stubbedEcharts() {
  const chart = stub.chart;
  chart.listeners = {};
  chart.dispose = vi.fn();
  chart.setOption = vi.fn();
  const init = vi.fn((..._args: unknown[]) => chart);
  stub.init = init;
  return { chart, init };
}

describe("withoutPageAccess", () => {
  it("draws tooltips as text, not as HTML", () => {
    expect(
      withoutPageAccess({
        tooltip: { formatter: "<img src=x onerror=alert(1)>{b}" },
      }),
    ).toEqual({
      tooltip: {
        formatter: "<img src=x onerror=alert(1)>{b}",
        renderMode: "richText",
      },
    });
    expect(
      withoutPageAccess({ tooltip: [{}, { renderMode: "html" }] }).tooltip,
    ).toEqual([{ renderMode: "richText" }, { renderMode: "richText" }]);
  });

  it("keeps only the links that are web addresses, wherever they are", () => {
    const option = withoutPageAccess({
      title: [
        { link: "javascript:alert(1)", sublink: " https://example.org/" },
        { link: "JAVASCRIPT:alert(1)", text: "kept" },
      ],
      series: [
        {
          type: "treemap",
          data: [
            {
              link: "http://example.org/",
              children: [{ link: "data:text/html,<script>1</script>" }],
            },
          ],
        },
      ],
    });
    expect(option).toEqual({
      title: [{ sublink: " https://example.org/" }, { text: "kept" }],
      series: [
        {
          type: "treemap",
          data: [{ link: "http://example.org/", children: [{}] }],
        },
      ],
    });
  });

  it("escapes what the data view writes as HTML", () => {
    expect(
      withoutPageAccess({
        toolbox: {
          feature: {
            dataView: {
              title: "<b>Data</b>",
              lang: ["<img src=x onerror=alert(1)>", "Close", "Refresh"],
            },
          },
        },
      }).toolbox.feature.dataView,
    ).toEqual({
      title: "&lt;b&gt;Data&lt;/b&gt;",
      lang: ["&lt;img src=x onerror=alert(1)&gt;", "Close", "Refresh"],
    });
  });
});

describe("withoutPageAccess, wherever echarts reads the option", () => {
  it("keeps an axis pointer's links between axes, and no link that is not a web address", () => {
    const option = withoutPageAccess({
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      title: { link: ["javascript:alert(1)"], sublink: 2 },
    });
    expect(option).toEqual({
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      title: {},
    });
  });

  it("reads past the numbers, strings and nulls in a chart's data", () => {
    const option = {
      tooltip: {},
      series: [{ type: "line", data: [1, null, [2, null], "3"] }],
    };
    expect(withoutPageAccess(option).series[0].data).toEqual([
      1,
      null,
      [2, null],
      "3",
    ]);
  });

  it("draws as text the tooltips of a base option, a timeline's options and media queries", () => {
    const option = withoutPageAccess({
      baseOption: { tooltip: { formatter: "<img src=x onerror=alert(1)>" } },
      options: [{ tooltip: { renderMode: "html" } }],
      media: [{ query: {}, option: { tooltip: [{}] } }],
    });
    expect(option.baseOption.tooltip.renderMode).toBe("richText");
    expect(option.options[0].tooltip.renderMode).toBe("richText");
    expect(option.media[0].option.tooltip[0].renderMode).toBe("richText");
  });

  it("escapes data view labels however they are written, and drops labels that are not a list", () => {
    const option = withoutPageAccess({
      baseOption: {
        toolbox: {
          feature: {
            dataView: {
              title: ["<img src=x onerror=alert(1)>"],
              lang: [["<b>a</b>"], null, 2],
            },
          },
        },
      },
      toolbox: [
        {
          feature: {
            dataView: { lang: { 0: "<img src=x onerror=alert(1)>" } },
          },
        },
      ],
    });
    expect(option.baseOption.toolbox.feature.dataView).toEqual({
      title: "&lt;img src=x onerror=alert(1)&gt;",
      lang: ["&lt;b&gt;a&lt;/b&gt;", null, "2"],
    });
    expect(option.toolbox[0].feature.dataView).toEqual({});
  });
});

describe("usesGL", () => {
  it("asks for echarts-gl for 3D and WebGL charts only", () => {
    expect(usesGL({ series: [{ type: "scatter3D", data: [] }] })).toBe(true);
    expect(usesGL({ globe: {}, series: [] })).toBe(true);
    expect(usesGL({ series: [{ type: "scatterGL" }] })).toBe(true);
    expect(usesGL({ series: [{ type: "bar", data: [1] }] })).toBe(false);
  });
});

describe("renderEcharts", () => {
  it("draws in the preview's theme, is done once echarts says so, and disposes of the chart", async () => {
    const { chart, init } = await stubbedEcharts();
    const drawing = renderEcharts(
      '{"tooltip": {}, "series": [{"type": "bar", "data": [1]}]}',
      { attributes: { width: 300, height: "10em" } },
      { dark: true, inSlides: false },
    );
    let done = false;
    drawing.done.then(() => (done = true));
    await vi.waitFor(() => expect(init).toHaveBeenCalled());
    expect(init.mock.calls[0][1]).toBe("dark");
    // The option less what would reach the page.
    expect(chart.setOption).toHaveBeenCalledWith({
      tooltip: { renderMode: "richText" },
      series: [{ type: "bar", data: [1] }],
    });
    expect(drawing.element.style.width).toBe("300px");
    expect(drawing.element.style.height).toBe("10em");
    await new Promise((resolve) => setTimeout(resolve));
    expect(done).toBe(false);
    chart.finish();
    await drawing.done;
    drawing.dispose();
    expect(chart.dispose).toHaveBeenCalled();
  });

  it("is done once its first frame is drawn, for a chart whose animation never finishes", async () => {
    const { chart } = await stubbedEcharts();
    const drawing = renderEcharts(
      '{"series": [{"type": "effectScatter", "data": [[1, 2]]}]}',
      {},
      { dark: false, inSlides: false },
    );
    await vi.waitFor(() => expect(chart.listeners["rendered"]).toBeDefined());
    chart.listeners["rendered"]();
    await drawing.done;
  });

  it("starts no chart for a drawing disposed of while echarts loads", async () => {
    const { init } = await stubbedEcharts();
    const drawing = renderEcharts(
      '{"series": []}',
      {},
      { dark: false, inSlides: false },
    );
    await Promise.resolve();
    drawing.dispose();
    await drawing.done;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(init).not.toHaveBeenCalled();
  });

  it("shows why a chart it cannot read is not drawn", async () => {
    const drawing = renderEcharts(
      "{ not json",
      {},
      { dark: false, inSlides: false },
    );
    await drawing.done;
    expect(drawing.element.querySelector(".language-error")).not.toBeNull();
  });
});
