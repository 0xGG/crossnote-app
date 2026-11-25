import http, { type HttpClient } from "isomorphic-git/http/web";
import { Buffer } from "buffer";
import { DEFAULT_CORS_PROXY } from "../config";
import type { Notebook } from "./notebook";

export function repositoryAddress(value = ""): string {
  const stripped = value.replace(/^(https?:\/\/)[^/?#\\]*@/i, "$1");
  if (stripped !== value || !URL.canParse(value)) return stripped;
  const url = new URL(value);
  if (!url.username && !url.password) return value;
  url.username = "";
  url.password = "";
  return url.href;
}

export function effectiveGitProxy(proxy = ""): string {
  return proxy.startsWith("https://crossnote.app/cors")
    ? DEFAULT_CORS_PROXY
    : proxy;
}

export function gitConnection(
  repository: string,
  corsProxy: string,
  username = "",
  password = "",
  savedProxy = corsProxy,
) {
  const url = repositoryAddress(repository);
  if (!username && !password) return { http, url, corsProxy };

  const sendAuthenticated: HttpClient["request"] = async (request) => {
    if (corsProxy !== savedProxy) {
      throw new Error("error/git-confirm-proxy");
    }
    if (
      !URL.canParse(url) ||
      new URL(url).protocol !== "https:" ||
      (corsProxy &&
        (!URL.canParse(corsProxy) || new URL(corsProxy).protocol !== "https:"))
    ) {
      throw new Error("error/git-credentials-require-https");
    }
    // Match the Git client's repository and proxy URL conventions.
    const target = corsProxy
      ? corsProxy.endsWith("?")
        ? corsProxy + url
        : corsProxy + "/" + url.slice("https://".length)
      : url;
    const endpoints = ["git-upload-pack", "git-receive-pack"].flatMap(
      (service) => [
        new URL(target + "/info/refs?service=" + service).href,
        new URL(target + "/" + service).href,
      ],
    );
    if (!endpoints.includes(new URL(request.url).href)) {
      throw new Error("error/git-unexpected-target");
    }
    return http.request({
      ...request,
      // Same-origin redirects can forward Authorization to another repo.
      fetchOptions: { ...request.fetchOptions, redirect: "error" },
    });
  };
  const authenticatedHttp: HttpClient = {
    async request(request) {
      if (
        Object.keys(request.headers ?? {}).some(
          (name) => name.toLowerCase() === "authorization",
        )
      ) {
        return sendAuthenticated(request);
      }
      // Some remotes advertise receive-pack before challenging its POST.
      if (
        request.method !== "POST" ||
        !request.url.endsWith("/git-receive-pack")
      ) {
        return http.request(request);
      }
      const response = await http.request(request);
      if (response.statusCode !== 401) return response;
      const basic = Buffer.from(username.trim() + ":" + password).toString(
        "base64",
      );
      return sendAuthenticated({
        ...request,
        headers: { ...request.headers, authorization: "Basic " + basic },
      });
    },
  };
  return {
    url,
    corsProxy,
    http: authenticatedHttp,
    onAuth: () => ({ username, password }),
  };
}

export function notebookGitConnection(notebook: Notebook) {
  const savedProxy = notebook.gitCorsProxy ?? "";
  return gitConnection(
    notebook.gitURL,
    effectiveGitProxy(savedProxy),
    notebook.gitUsername,
    notebook.gitPassword,
    savedProxy,
  );
}

export function gitHttpStatus(error: unknown) {
  const { data } = Object(error) as { data?: { statusCode?: number } };
  return data?.statusCode;
}

export function needsGitSettings(error: unknown) {
  const status = gitHttpStatus(error);
  return (
    status === 401 ||
    status === 203 ||
    (error instanceof Error &&
      [
        "error/git-confirm-proxy",
        "error/git-credentials-require-https",
        "error/git-unexpected-target",
      ].includes(error.message))
  );
}
