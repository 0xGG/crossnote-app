import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, request } from "node:https";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  rm,
  realpath,
  rmdir,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// A real Git HTTPS remote, restricted to disposable repositories on loopback.
// No developer repository, credential, user git config or external network is used.
const port = Number(process.env.GIT_FIXTURE_PORT || 4174);
const origin = `https://127.0.0.1:${port}`;
const tlsDirectory = process.env.CROSSNOTE_GIT_FIXTURE_TLS_DIR;
if (!tlsDirectory)
  throw new Error("Start the HTTPS Git fixture through Playwright");
const cert = await readFile(path.join(tlsDirectory, "cert.pem"));
const key = await readFile(path.join(tlsDirectory, "key.pem"));
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
const recordGitRequest = (repo, req, res, service) => {
  const header = req.headers.authorization;
  const auth = !header
    ? "missing"
    : header === repo.authorization
      ? "accepted"
      : "rejected";
  const event = { method: req.method, service, status: 0, auth };
  repo.requests.push(event);
  res.once("finish", () => (event.status = res.statusCode));
  return auth;
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
      // Replacing a directory with a file requires deleting its children first.
      const previous = await lstat(target).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
      if (previous?.isDirectory()) await rmdir(target);
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

function allowGitCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Git-Protocol",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "Content-Type");
}

const serve = async (req, res) => {
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
    const url = new URL(req.url, origin);
    if (url.pathname === "/health") return json(res, { ready: true });
    if (url.pathname.startsWith("/proxy/")) {
      // Match isomorphic-git's proxy URL convention, without an open proxy.
      const prefix = `/proxy/127.0.0.1:${port}/git/`;
      if (!url.pathname.startsWith(prefix)) {
        res.writeHead(403).end();
        return;
      }
      allowGitCors(res);
      if (req.method === "OPTIONS") {
        res.writeHead(204).end();
        return;
      }
      const upstream = request(
        {
          host: "127.0.0.1",
          port,
          ca: cert,
          path: "/git/" + url.pathname.slice(prefix.length) + url.search,
          method: req.method,
          headers: { ...req.headers, host: `127.0.0.1:${port}` },
        },
        (response) => {
          res.writeHead(response.statusCode, response.headers);
          response.on("error", (error) => res.destroy(error));
          response.pipe(res);
        },
      );
      upstream.on("error", (error) => res.destroy(error));
      req.pipe(upstream);
      return;
    }
    if (url.pathname === "/repos" && req.method === "POST") {
      const { files, private: requiresAuth } = JSON.parse(
        (await body(req)).toString(),
      );
      const id = randomUUID();
      const credentials =
        requiresAuth === true
          ? {
              username: `fixture-user-${randomUUID()}`,
              password: `fixture-password-${randomUUID()}`,
            }
          : undefined;
      const repo = {
        bare: path.join(root, `${id}.git`),
        work: path.join(root, `${id}-work`),
        authorization:
          credentials &&
          `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`,
        denyReceive: false,
        redirect: null,
        requests: [],
      };
      await git(["init", "--bare", "--initial-branch=master", repo.bare]);
      await git(["--git-dir", repo.bare, "config", "http.receivepack", "true"]);
      await git(["clone", repo.bare, repo.work]);
      await git(["config", "core.autocrlf", "false"], repo.work);
      await commit(repo, files);
      repos.set(id, repo);
      return json(res, {
        id,
        url: `${origin}/git/${id}.git`,
        proxy: `${origin}/proxy`,
        credentials,
      });
    }
    const api = url.pathname.match(
      /^\/repos\/([\w-]+)(?:\/(file|requests|permissions|redirect))?$/,
    );
    if (api) {
      const repo = repos.get(api[1]);
      if (!repo) {
        res.writeHead(404).end();
        return;
      }
      if (api[2] === "requests" && req.method === "GET")
        return json(res, repo.requests);
      if (api[2] === "permissions" && req.method === "PUT") {
        const { denyReceive, receiveOnly } = JSON.parse(
          (await body(req)).toString(),
        );
        repo.denyReceive = denyReceive === true;
        repo.receiveOnly = receiveOnly === true;
        return json(res, { ok: true });
      }
      if (api[2] === "redirect" && req.method === "PUT") {
        const { destination, crossOrigin } = JSON.parse(
          (await body(req)).toString(),
        );
        const target = repos.get(destination);
        if (!repo.authorization || !target?.authorization) {
          res.writeHead(400).end();
          return;
        }
        const redirectOrigin = crossOrigin === true ? receiverOrigin : origin;
        repo.redirect = `${redirectOrigin}/git/${destination}.git/info/refs`;
        return json(res, { redirectOrigin });
      }
      if (!api[2] && req.method === "POST") {
        await git(["pull", "--ff-only"], repo.work);
        await commit(repo, JSON.parse((await body(req)).toString()).files);
        return json(res, { ok: true });
      }
      if (api[2] === "file" && req.method === "GET") {
        const file = url.searchParams.get("path");
        const bytes = await git([
          "--git-dir",
          repo.bare,
          "show",
          `master:${file}`,
        ]);
        return json(res, { bytes: [...bytes] });
      }
      if (api[2] || req.method !== "GET") {
        res.writeHead(405).end();
        return;
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
    const repo = repos.get(remote[1]);
    allowGitCors(res);
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    if (repo.authorization) {
      const service =
        remote[2] === "info/refs" ? url.searchParams.get("service") : remote[2];
      const auth = recordGitRequest(repo, req, res, service);
      if (
        auth !== "accepted" &&
        (!repo.receiveOnly ||
          (req.method === "POST" && service === "git-receive-pack"))
      ) {
        res
          .writeHead(401, {
            "WWW-Authenticate": 'Basic realm="crossnote-git-fixture"',
            "Content-Type": "text/plain",
          })
          .end("Fixture authentication required");
        return;
      }
      if (
        repo.redirect &&
        req.method === "GET" &&
        service === "git-upload-pack"
      ) {
        res.writeHead(307, { Location: repo.redirect + url.search }).end();
        return;
      }
      // Let discovery succeed so the test reaches the actual push request.
      if (
        req.method === "POST" &&
        service === "git-receive-pack" &&
        repo.denyReceive
      ) {
        await body(req);
        res
          .writeHead(403, { "Content-Type": "text/plain" })
          .end("Fixture write permission denied");
        return;
      }
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
    backend.stdin.on("error", (error) => {
      // Git can finish its CGI response before reading the entire request.
      if (error.code === "EPIPE") return;
      console.error(error);
      res.destroy(error);
      backend.kill();
    });
    backend.on("error", (error) => res.destroy(error));
    backend.on("close", (code, signal) => {
      if (!sent) res.statusCode = 500;
      else if (code !== 0 && res.statusCode < 400) {
        res.destroy(
          new Error(`git http-backend exited with ${signal ?? code}`),
        );
        return;
      }
      res.end();
    });
    backend.stdin.end(input);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(500);
    res.end(String(error));
  }
};
// The second listener gives redirect tests a distinct HTTPS origin while
// routing to the same disposable repositories and using the same pinned leaf.
const receiver = createServer({ cert, key }, serve);
await new Promise((resolve, reject) => {
  receiver.once("error", reject);
  receiver.listen(0, "127.0.0.1", resolve);
});
const receiverOrigin = `https://127.0.0.1:${receiver.address().port}`;
const server = createServer({ cert, key }, serve);
server.listen(port, "127.0.0.1", () =>
  console.log(`git fixture listening on ${port}`),
);
async function stop() {
  server.close();
  receiver.close();
  // Only this process's generated, real directory underneath the cache.
  if (path.dirname(root) === cache && (await realpath(root)) === root)
    await rm(root, { recursive: true, force: true });
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
