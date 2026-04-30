const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const dataFile = path.join(root, "data.json");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

function send(response, status, body, type = "application/json; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store"
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function readState() {
  if (!fs.existsSync(dataFile)) return null;
  return JSON.parse(fs.readFileSync(dataFile, "utf8"));
}

function writeState(state) {
  fs.writeFileSync(dataFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function serveFile(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const cleanPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const requestedPath = path.normalize(path.join(root, cleanPath));

  if (!requestedPath.startsWith(root)) {
    send(response, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  fs.readFile(requestedPath, (error, content) => {
    if (error) {
      send(response, 404, "Not found", "text/plain; charset=utf-8");
      return;
    }

    const type = types[path.extname(requestedPath)] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": type });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.url.startsWith("/api/state") && request.method === "GET") {
      send(response, 200, JSON.stringify(readState()));
      return;
    }

    if (request.url.startsWith("/api/state") && request.method === "POST") {
      const body = await readBody(request);
      const state = JSON.parse(body);
      writeState(state);
      send(response, 200, JSON.stringify({ ok: true }));
      return;
    }

    if (request.method === "GET") {
      serveFile(request, response);
      return;
    }

    send(response, 405, "Method not allowed", "text/plain; charset=utf-8");
  } catch (error) {
    send(response, 500, JSON.stringify({ error: error.message }));
  }
});

server.listen(port, host, () => {
  console.log(`Devartek Calendar running at http://${host}:${port}/`);
});
