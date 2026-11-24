import { execFileSync } from "node:child_process";
import { createHash, X509Certificate } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getCACertificates, setDefaultCACertificates } from "node:tls";

export const fixtureURL = `https://127.0.0.1:${process.env.GIT_FIXTURE_PORT || 4174}`;

function openssl() {
  if (process.platform === "win32") {
    const gitExecPath = execFileSync("git", ["--exec-path"], {
      encoding: "utf8",
      windowsHide: true,
    }).trim();
    const bundled = resolve(gitExecPath, "../../../usr/bin/openssl.exe");
    if (existsSync(bundled)) return bundled;
  }
  return "openssl";
}

export function configureGitFixtureTls() {
  let directory = process.env.CROSSNOTE_GIT_FIXTURE_TLS_DIR;
  if (!directory) {
    const generated = mkdtempSync(join(tmpdir(), "crossnote-git-tls-"));
    process.once("exit", () =>
      rmSync(generated, { recursive: true, force: true }),
    );
    execFileSync(
      openssl(),
      [
        "req",
        "-x509",
        "-newkey",
        "ec",
        "-pkeyopt",
        "ec_paramgen_curve:prime256v1",
        "-nodes",
        "-days",
        "1",
        "-subj",
        "/CN=127.0.0.1",
        "-addext",
        "subjectAltName=IP:127.0.0.1",
        "-addext",
        "basicConstraints=CA:FALSE",
        "-keyout",
        join(generated, "key.pem"),
        "-out",
        join(generated, "cert.pem"),
      ],
      { stdio: "pipe", windowsHide: true },
    );
    // Use the same leaf certificate in the fixture and every Playwright worker.
    process.env.CROSSNOTE_GIT_FIXTURE_TLS_DIR = directory = generated;
  }

  const cert = readFileSync(join(directory, "cert.pem"), "utf8");
  // Playwright's readiness and management requests run in Node processes.
  setDefaultCACertificates([...getCACertificates("default"), cert]);
  const key = new X509Certificate(cert).publicKey.export({
    type: "spki",
    format: "der",
  });
  const fingerprint = createHash("sha256").update(key).digest("base64");
  return `--ignore-certificate-errors-spki-list=${fingerprint}`;
}
