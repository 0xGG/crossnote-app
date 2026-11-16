import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, request } from "node:http";
import { mkdir, mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// A real smart-HTTP remote, restricted to disposable repositories on loopback.
// No developer repository, credential, user git config or external network is used.
const port = Number(process.env.GIT_FIXTURE_PORT || 4174);
const cache = path.resolve(".cache");
await mkdir(cache, { recursive: true });
const root = await mkdtemp(path.join(cache, "git-http-"));
const env = {
  ...process.env,
  GIT_CONFIG_GLOBAL: path.join(root, "empty-config"),
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_TERMINAL_PROMPT: "0",
};
await writeFile(env.GIT_CONFIG_GLOBAL, "");
const execute = promisify(execFile);
const git = async (args, cwd = root) =>
  (
    await execute("git", args, {
      cwd,
      env,
      windowsHide: true,
      encoding: "buffer",
    })
  ).stdout;
const repos = new Map();
const body = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
};
const json = (res, value) => {
  res.setHeader("Content-Type", "application/json");
  // Management requests do not need pooled connections across idle git work.
  res.setHeader("Connection", "close");
  res.end(JSON.stringify(value));
};
const commit = async (repo, files) => {
  for (const [name, bytes] of Object.entries(files)) {
    if (
      !name ||
      name.split("/").some((part) => ["", ".", "..", ".git"].includes(part)) ||
      /[\\:]/.test(name)
    )
      throw new Error("Invalid fixture path");
    const target = path.resolve(repo.work, name);
    if (!target.startsWith(repo.work + path.sep))
      throw new Error("Outside fixture");
    if (bytes === null) await rm(target, { force: true });
    else {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, Buffer.from(bytes));
    }
  }
  await git(["add", "-A"], repo.work);
  await git(
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "commit",
      "--allow-empty",
      "-m",
      "Update fixture",
    ],
    repo.work,
  );
  await git(["push", "origin", "master"], repo.work);
};

const server = createServer(async (req, res) => {
  const started = Date.now();
  const label = `${req.method} ${new URL(req.url, "http://fixture").pathname}`;
  console.log(`${label} started`);
  res.once("close", () => {
    if (!res.writableFinished)
      console.log(`${label} closed before response ${Date.now() - started}ms`);
  });
  res.once("finish", () =>
    console.log(
      `${req.method} ${new URL(req.url, "http://fixture").pathname} ${res.statusCode} ${Date.now() - started}ms`,
    ),
  );
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === "/health") return json(res, { ready: true });
    if (url.pathname.startsWith("/proxy/")) {
      // Match isomorphic-git's proxy URL convention, without an open proxy.
      const prefix = `/proxy/127.0.0.1:${port}/git/`;
      if (!url.pathname.startsWith(prefix)) {
        res.writeHead(403).end();
        return;
      }
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, Git-Protocol",
      );
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Expose-Headers", "Content-Type");
      if (req.method === "OPTIONS") {
        res.writeHead(204).end();
        return;
      }
      const upstream = request(
        {
          host: "127.0.0.1",
          port,
          path: "/git/" + url.pathname.slice(prefix.length) + url.search,
          method: req.method,
          headers: { ...req.headers, host: `127.0.0.1:${port}` },
        },
        (response) => {
          res.writeHead(response.statusCode, response.headers);
          response.pipe(res);
        },
      );
      upstream.on("error", (error) => res.destroy(error));
      req.pipe(upstream);
      return;
    }
    if (url.pathname === "/repos" && req.method === "POST") {
      const id = randomUUID();
      const repo = {
        bare: path.join(root, `${id}.git`),
        work: path.join(root, `${id}-work`),
      };
      await git(["init", "--bare", "--initial-branch=master", repo.bare]);
      await git(["--git-dir", repo.bare, "config", "http.receivepack", "true"]);
      await git(["clone", repo.bare, repo.work]);
      await git(["config", "core.autocrlf", "false"], repo.work);
      await commit(repo, JSON.parse((await body(req)).toString()).files);
      repos.set(id, repo);
      return json(res, {
        id,
        url: `http://127.0.0.1:${port}/git/${id}.git`,
        proxy: `http://127.0.0.1:${port}/proxy`,
      });
    }
    const api = url.pathname.match(/^\/repos\/([\w-]+)(?:\/file)?$/);
    if (api) {
      const repo = repos.get(api[1]);
      if (!repo) {
        res.writeHead(404).end();
        return;
      }
      if (req.method === "POST") {
        await git(["pull", "--ff-only"], repo.work);
        await commit(repo, JSON.parse((await body(req)).toString()).files);
        return json(res, { ok: true });
      }
      if (url.pathname.endsWith("/file")) {
        const file = url.searchParams.get("path");
        const bytes = await git([
          "--git-dir",
          repo.bare,
          "show",
          `master:${file}`,
        ]);
        return json(res, { bytes: [...bytes] });
      }
      return json(res, {
        sha: (await git(["--git-dir", repo.bare, "rev-parse", "master"]))
          .toString()
          .trim(),
        files: (
          await git([
            "--git-dir",
            repo.bare,
            "ls-tree",
            "-r",
            "--name-only",
            "master",
          ])
        )
          .toString()
          .trim()
          .split("\n"),
      });
    }
    const remote = url.pathname.match(
      /^\/git\/([\w-]+)\.git\/(info\/refs|git-upload-pack|git-receive-pack)$/,
    );
    if (!remote || !repos.has(remote[1])) {
      res.writeHead(404).end();
      return;
    }
    const input = await body(req);
    const backend = spawn("git", ["http-backend"], {
      env: {
        ...env,
        GIT_PROJECT_ROOT: root,
        GIT_HTTP_EXPORT_ALL: "1",
        PATH_INFO: url.pathname.slice(4),
        QUERY_STRING: url.search.slice(1),
        REQUEST_METHOD: req.method,
        CONTENT_TYPE: req.headers["content-type"] || "",
        CONTENT_LENGTH: String(input.length),
        REMOTE_USER: "fixture",
        SERVER_PROTOCOL: "HTTP/1.1",
      },
      windowsHide: true,
    });
    let headers = Buffer.alloc(0);
    let sent = false;
    backend.stdout.on("data", (chunk) => {
      if (sent) {
        res.write(chunk);
        return;
      }
      headers = Buffer.concat([headers, chunk]);
      const split = headers.indexOf("\r\n\r\n");
      if (split < 0) return;
      for (const line of headers.subarray(0, split).toString().split("\r\n")) {
        const colon = line.indexOf(":");
        const key = line.slice(0, colon);
        const value = line.slice(colon + 1).trim();
        if (key.toLowerCase() === "status")
          res.statusCode = Number(value.split(" ")[0]);
        else res.setHeader(key, value);
      }
      sent = true;
      res.write(headers.subarray(split + 4));
    });
    backend.stderr.on("data", (chunk) => process.stderr.write(chunk));
    backend.on("error", (error) => res.destroy(error));
    backend.on("close", (code) => {
      if (code && !sent) res.statusCode = 500;
      res.end();
    });
    backend.stdin.end(input);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(500);
    res.end(String(error));
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`git fixture listening on ${port}`),
);
async function stop() {
  server.close();
  // Only this process's generated, real directory underneath the cache.
  if (path.dirname(root) === cache && (await realpath(root)) === root)
    await rm(root, { recursive: true, force: true });
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
