Versions of the third-party libraries vendored in this directory, loaded by
classic `<script>` tags from `index.html` and consumed by the echomd
powerpacks through their window globals.

This list is maintained by hand: keep it in sync when adding, upgrading or
removing a directory here. Upgrading these copies is tracked as its own round
in the project roadmap - none of them is visible to npm tooling, so Dependabot
and `pnpm audit` never report their vulnerabilities.

```json
{
  "prism": "1.23.0",
  "mermaid": "8.9.2",
  "marked": "0.7.0",
  "plantuml-encoder": "1.4.0",
  "echarts": "4.6.0",
  "echarts-gl": "1.1.1",
  "wavedrom": "2.3.2",
  "vega": "5.9.2",
  "vega-lite": "4.4.0",
  "vega-embed": "6.3.2"
}
```
