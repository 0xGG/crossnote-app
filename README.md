# 📝 Crossnote 交叉笔记

**I am planning to open source the front-end project as long as I finish implementing the offline features so as to become a REAL Progressive Web Application.**

Please check the [Notehub](https://github.com/0xGG/notehub) project, which will replace the old crossnote front-end.

![](logo192.png)

https://crossnote.app

<!-- @import "[TOC]" {cmd="toc" depthFrom=2 depthTo=6 orderedList=false} -->

<!-- code_chunk_output -->

- [🔭 Introduction - 介绍](#introduction-介绍)
- [💾 Installation - 安装](#installation-安装)
- [⚗️ Functionalities - 功能](#️-functionalities-功能)
  - [⌨️ Collaborative editing - 协作编辑 (WIP)](#️-collaborative-editing-协作编辑-wip)
  - [✏️ Markdown writing - Markdown 写作](#️-markdown-writing-markdown-写作)
  - [🏷️ Tag management - 标签管理](#️-tag-management-标签管理)
  - [😀 Interested in this project? - 对这个项目感兴趣？](#interested-in-this-project-对这个项目感兴趣)

<!-- /code_chunk_output -->

---

- 🚪 [Crossnote home page - 主页](https://crossnote.app)
  - 👀 [public notes - 公开的笔记](https://crossnote.app/public_notes)
- 🌐 [Crossnote Chrome extension](https://github.com/0xGG/crossnote-chrome)

> ☝️ We might switch to another domain name in the future.

Please visit [Crossnote project](https://crossnote.app/note/5bba7c9b-fd45-455b-8309-03d3d568adf6) note page for more information.  
请访问 [Crossnote project](https://crossnote.app/note/5bba7c9b-fd45-455b-8309-03d3d568adf6) 笔记页面了解更多信息。

- [Feature requests - 功能请求](https://crossnote.app/note/1176fe53-4e81-4dd5-9ca4-beee1400a3a6)
- [Issues - 问题](https://crossnote.app/note/2f7ec1f5-539e-4b89-a4a5-809701ff777c)
- [Plans - 计划](https://crossnote.app/note/1a322618-ed75-46ea-bff1-8864c195f111)
- [Changelogs - 更新记录](https://crossnote.app/note/3771a0ac-0ec1-4353-a807-4c9cd173ccd5)
- [Language packs - 语言包](https://crossnote.app/note/b34ef09e-1212-47d6-a9b9-ad1928ac3de3)

## 🔭 Introduction - 介绍

**Crossnote** is a markdown note taking platform developed by the [GitHub/0xGG](https://github.com/0xGG) team.

It is heavily inspired by [Markdown Preview Enhanced](https://github.com/shd101wyy/markdown-preview-enhanced), [Google Keep](https://keep.google.com), [Google Docs](https://docs.google.com), [Quip](https://quip.com), and [Notion](https://www.notion.so).

**Crossnote** is still under heavy development, and its production website is currently running on a Vultr VPS with only 8GB ram located in Los Angeles. The product is not stable yet (basically the more I code, the more bugs I produce haha), so your data is not guaranteed to be safely saved. **So let me reiterate: This product is not ready yet**. But I am happy if you could help me test it.

We also offer a chrome extension [here](https://github.com/0xGG/crossnote-chrome).

Any suggestions would be very helpful.

## 💾 Installation - 安装

**Crossnote** is developed as a **Progressive Web Application (PWA)**. It supports both modern desktop and mobile browsers. The goal of the application is to be built as an **offline first** web application in the future, so users can take notes even if the internet is not avaibale.

On desktop computers and android devices, I would suggest you to try [crossnote](https://crossnote.app) on **Chrome**. You can also create `Shortcut` to add it to your home screen (`Menu (top right corner) -> More tools -> Create shortcut...`).

On iOS devices (iPhone and iPad), I would suggest you to try [crossnote](https://crossnote.app) on **Safari** and add the webpage to home screen. ([How to create website shortcuts on iPhone and iPad](https://www.igeeksblog.com/how-to-create-website-shortcuts-on-iphone-ipad/)).

## ⚗️ Functionalities - 功能

### ⌨️ Collaborative editing - 协作编辑 (WIP)

[demo - 示例](https://crossnote.app/editor/8b2c2eee-c566-4601-8691-702cb34bc2bc?noteKey=222d939e-d803-473a-acd4-baddb5057c2c)

![Screen Shot 2020-02-08 at 8.22.17 PM](https://i.loli.net/2020/02/08/B79a3t4HXqMgDRe.png)

<img src="https://i.loli.net/2020/02/08/lxiTIkVStvrLM7Q.jpg" height="800">

### ✏️ Markdown writing - Markdown 写作

- **📝 Basic markdown syntax - 基础 markdown 语法**  
  [demo - 示例](https://crossnote.app/demo_editor/2f541826-923b-4215-b553-c3fbdd13e4d7)

- **📊 Diagrams - 图表**  
  [demo - 示例](https://crossnote.app/demo_editor/3f354ebf-2307-4eac-8a71-f9c47a7fe6d6)  
  Crossnote supports [Mermaid](https://github.com/mermaid-js/mermaid), [PlantUML](https://plantuml.com/), [ECharts](https://echarts.apache.org/en/index.html), [WaveDrom](https://wavedrom.com/), [Vega](https://vega.github.io/vega/) and [Vega Lite](https://vega.github.io/vega-lite/).

- **🖼 Slides - 幻灯片**  
  [demo - 示例](https://crossnote.app/demo_editor/858bcb05-35ef-4ee4-a75a-4f6357dd76d0)  
  Follows the same specs as in [Markdown Preview Enhanced](https://shd101wyy.github.io/markdown-preview-enhanced/#/presentation).  
  Please switch to `Preview` mode to see the final result.  
  ![Screenshot from 2020-02-08 21-34-20](https://i.loli.net/2020/02/08/iOfFhQRESubYcn2.png)

- **🛠 Widgets - 挂件**  
  Crossnote supports multiple widgets directly in your markdown note. You can find all of them in toolbar of the editor.

  ![Screenshot from 2020-02-08 21-36-12](https://i.loli.net/2020/02/08/tiM1BZOaKcCqSmd.png)

  - Timer - 计时器
  - Media - 媒体文件
    - Audio URL - 音频源
    - Video URL - 视频源
    * Youtube
    * Bilibili
    - Netease Music - 网易云音乐
  - OCR - 文字识别
  - [Kanban - 看板](https://crossnote.app/demo_editor/eb8bbe34-327a-4956-ab95-594eb176af6f)
  - [ABC notation](https://crossnote.app/demo_editor/3cb874a8-1369-4c6c-8aed-7ec97e028f49)

### 🏷️ Tag management - 标签管理

You can add arbitary tags to your notes and quickly access your notes by tag.

![Screenshot from 2020-02-08 21-44-24](https://i.loli.net/2020/02/08/Vzwo6phEvuiNmje.png)

### 😀 Interested in this project? - 对这个项目感兴趣？

I love open source, and I would like to continue to open source part of the frontend & backend code of this project in the future.

If you are interested in this project and want to get more involved (or even help commercialize the project 😎), you can reach me either by my email `shd101wyy@gmail.com` or by my wechat(微信) `shd101wyy`.

Thank you!
