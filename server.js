import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const dataDir = process.env.DATA_DIR || join(__dirname, "data");
const dataFile = join(dataDir, "players.json");

const port = Number(process.env.PORT || 3000);
const adminUser = process.env.ADMIN_USER || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "cambia-esta-clave";
const sessionSecret = process.env.SESSION_SECRET || adminPassword;
const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL);
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
const supabaseKeyType = process.env.SUPABASE_SERVICE_ROLE_KEY ? "service_role" : process.env.SUPABASE_ANON_KEY ? "anon" : "none";
const useSupabase = Boolean(supabaseUrl && supabaseKey);

const defaultPlayers = [
  { id: "arielon", emoji: "🦁", name: "Arielon", points: 0 },
  { id: "primo-franc", emoji: "🤠", name: "Primo Franc", points: 0 },
  { id: "bra", emoji: "🧢", name: "Bra", points: 0 },
  { id: "ferras", emoji: "⚡", name: "Ferras", points: 0 },
  { id: "manu", emoji: "🔥", name: "Manu", points: 0 },
  { id: "edu", emoji: "🎯", name: "Edu", points: 0 },
  { id: "sergi", emoji: "🚀", name: "Sergi", points: 0 },
  { id: "mino", emoji: "🧠", name: "Mino", points: 0 },
  { id: "rony", emoji: "🐺", name: "Rony", points: 0 },
  { id: "anderson", emoji: "🦅", name: "Anderson", points: 0 },
  { id: "miguelona", emoji: "👑", name: "Miguelona", points: 0 },
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

let writeQueue = Promise.resolve();

function normalizeSupabaseUrl(value) {
  if (!value) return "";

  try {
    const url = new URL(value.trim());
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
  }
}

async function ensureDataFile() {
  await mkdir(dataDir, { recursive: true });

  try {
    await readFile(dataFile, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeFile(dataFile, JSON.stringify(defaultPlayers, null, 2));
  }
}

async function ensureStorage() {
  if (!useSupabase) {
    await ensureDataFile();
    return;
  }

  await supabaseRequest("/players?on_conflict=id", {
    method: "POST",
    headers: { prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(defaultPlayers)
  });
}

async function readPlayers() {
  if (useSupabase) {
    const players = await supabaseRequest("/players?select=id,emoji,name,points");
    return hydratePlayers(players).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }

  await ensureDataFile();
  const raw = await readFile(dataFile, "utf8");
  const players = hydratePlayers(JSON.parse(raw));
  return players.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: supabaseKey,
      authorization: `Bearer ${supabaseKey}`,
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase error ${response.status}: ${message}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function hydratePlayers(savedPlayers) {
  return defaultPlayers.map((defaultPlayer) => {
    const savedPlayer = savedPlayers.find((player) => player.id === defaultPlayer.id);
    return normalizePlayer({ ...defaultPlayer, points: savedPlayer?.points ?? defaultPlayer.points });
  });
}

async function writePlayers(players) {
  if (useSupabase) {
    await supabaseRequest("/players?on_conflict=id", {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(hydratePlayers(players))
    });
    return;
  }

  writeQueue = writeQueue.then(async () => {
    await ensureDataFile();
    await writeFile(dataFile, JSON.stringify(hydratePlayers(players), null, 2));
  });

  return writeQueue;
}

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const separator = cookie.indexOf("=");
        return [cookie.slice(0, separator), decodeURIComponent(cookie.slice(separator + 1))];
      })
  );
}

function sign(value) {
  return createHmac("sha256", sessionSecret).update(value).digest("hex");
}

function createSessionToken() {
  const value = `${adminUser}:${Date.now()}`;
  return `${Buffer.from(value).toString("base64url")}.${sign(value)}`;
}

function isValidSession(req) {
  const token = parseCookies(req).quiniela_session;
  if (!token) return false;

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return false;

  let value;
  try {
    value = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return false;
  }

  const [user, timestamp] = value.split(":");
  if (user !== adminUser || Date.now() - Number(timestamp) > 1000 * 60 * 60 * 12) return false;

  const expected = sign(value);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return signatureBuffer.length === expectedBuffer.length && timingSafeEqual(signatureBuffer, expectedBuffer);
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Body too large");
  }
  return body ? JSON.parse(body) : {};
}

function normalizePlayer(input) {
  const id = String(input.id || "");
  const emoji = String(input.emoji || "").trim();
  const name = String(input.name || "").trim();
  const points = Number(input.points || 0);

  if (!id) throw new Error("El id es requerido");
  if (!name) throw new Error("El nombre es requerido");
  if (!Number.isFinite(points) || points < 0) throw new Error("Los puntos deben ser un numero positivo");

  return { id, emoji, name, points };
}

function getStorageStatus() {
  let supabaseHost = null;

  if (supabaseUrl) {
    try {
      supabaseHost = new URL(supabaseUrl).host;
    } catch {
      supabaseHost = "invalid-url";
    }
  }

  return {
    storage: useSupabase ? "supabase" : "local",
    supabaseHost,
    supabaseKeyType,
    dataFile: useSupabase ? null : dataFile
  };
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/players") {
    return json(res, 200, { players: await readPlayers(), canEdit: isValidSession(req) });
  }

  if (req.method === "GET" && pathname === "/api/storage") {
    return json(res, 200, getStorageStatus());
  }

  if (req.method === "POST" && pathname === "/api/login") {
    const body = await readBody(req);
    const valid = body.username === adminUser && body.password === adminPassword;

    if (!valid) return json(res, 401, { error: "Credenciales incorrectas" });

    res.setHeader("set-cookie", `quiniela_session=${encodeURIComponent(createSessionToken())}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`);
    return json(res, 200, { ok: true });
  }

  if (req.method === "POST" && pathname === "/api/logout") {
    res.setHeader("set-cookie", "quiniela_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    return json(res, 200, { ok: true });
  }

  if (!isValidSession(req)) return json(res, 401, { error: "No autorizado" });

  const playerMatch = pathname.match(/^\/api\/players\/([^/]+)$/);
  if (playerMatch && req.method === "PUT") {
    const id = decodeURIComponent(playerMatch[1]);
    const body = await readBody(req);
    const players = await readPlayers();
    const index = players.findIndex((player) => player.id === id);

    if (index === -1) return json(res, 404, { error: "Participante no encontrado" });

    players[index] = normalizePlayer({ ...players[index], points: body.points, id });
    await writePlayers(players);
    return json(res, 200, { players: await readPlayers() });
  }

  return json(res, 404, { error: "Ruta no encontrada" });
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(publicDir, requested));

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  try {
    const file = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("No encontrado");
  }
}

await ensureStorage();

if (useSupabase) {
  const { supabaseHost } = getStorageStatus();
  console.log(`Persistencia activa: Supabase (${supabaseHost}, key=${supabaseKeyType})`);
} else {
  console.warn(`Persistencia local activa: ${dataFile}. En hosting sin disco persistente, los resultados se pueden perder al reiniciar.`);
}

createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);

    if (pathname.startsWith("/api/")) {
      await handleApi(req, res, pathname);
      return;
    }

    await serveStatic(req, res, pathname);
  } catch (error) {
    json(res, 500, { error: error.message || "Error interno" });
  }
}).listen(port, () => {
  console.log(`Quiniela disponible en http://localhost:${port}`);
});
