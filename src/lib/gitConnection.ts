import http, { type HttpClient } from "isomorphic-git/http/web";
import { DEFAULT_CORS_PROXY } from "../config";
import type { Notebook } from "./notebook";

export function repositoryAddress(value = ""): string {
  if (!URL.canParse(value)) {
    return value.replace(/^(https?:\/\/)[^/?#\\]*@/i, "$1");
  }
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

  const authenticatedHttp: HttpClient = {
    request(request) {
      const authenticated = Object.keys(request.headers ?? {}).some(
        (name) => name.toLowerCase() === "authorization",
      );
      if (!authenticated) return http.request(request);
      if (corsProxy !== savedProxy) {
        throw new Error("error/git-confirm-proxy");
      }
      if (
        !URL.canParse(url) ||
        new URL(url).protocol !== "https:" ||
        (corsProxy &&
          (!URL.canParse(corsProxy) ||
            new URL(corsProxy).protocol !== "https:"))
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
  return (
    gitHttpStatus(error) === 401 ||
    (error instanceof Error &&
      [
        "error/git-confirm-proxy",
        "error/git-credentials-require-https",
        "error/git-unexpected-target",
      ].includes(error.message))
  );
}
