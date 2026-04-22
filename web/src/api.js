export const API_BASE =
  process.env.REACT_APP_API_URL ||
  (window.location.hostname === "localhost" ? "http://localhost:3001" : "");

export async function apiFetch(path, options = {}) {
  const isFormData =
    typeof FormData !== "undefined" && options?.body instanceof FormData;

const worker = (() => {
    try { return JSON.parse(localStorage.getItem("worker") || "{}"); }
    catch { return {}; }
  })();

  const headers = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
    ...(worker?.id ? { "X-Worker-Id": worker.id } : {}),
  };

  const url = (() => {
    if (/^https?:\/\//i.test(path)) return path;

    const base = String(API_BASE || "").replace(/\/+$/, "");
    let p = String(path || "");
    if (!p.startsWith("/")) p = "/" + p;

    if (base.endsWith("/api") && p.startsWith("/api/")) {
      p = p.replace(/^\/api/, "");
    }

    return `${base}${p}`;
  })();

  console.log("🌐 apiFetch ->", url);

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (!isJson) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Respuesta no-JSON. URL=${url} content-type=${contentType} preview=${text.slice(0, 80)}`
    );
  }

  const data = await res.json();

  if (!res.ok) {
    const msg = data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

export async function apiDownload(path, fallbackFileName = "archivo") {
  const worker = (() => {
    try { return JSON.parse(localStorage.getItem("worker") || "{}"); }
    catch { return {}; }
  })();

  const url = (() => {
    if (/^https?:\/\//i.test(path)) return path;

    const base = String(API_BASE || "").replace(/\/+$/, "");
    let p = String(path || "");
    if (!p.startsWith("/")) p = "/" + p;

    if (base.endsWith("/api") && p.startsWith("/api/")) {
      p = p.replace(/^\/api/, "");
    }

    return `${base}${p}`;
  })();

  console.log("⬇️ apiDownload ->", url);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      ...(worker?.id ? { "X-Worker-Id": worker.id } : {}),
    },
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        message = data?.error || message;
      } else {
        const text = await res.text();
        message = text || message;
      }
    } catch (_) {}
    throw new Error(message);
  }

  const blob = await res.blob();

  const disposition = res.headers.get("content-disposition") || "";
  const fileNameMatch = disposition.match(/filename\*?=(?:UTF-8'')?"?([^"]+)"?/i);
  const fileName = decodeURIComponent(fileNameMatch?.[1] || fallbackFileName);

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 2000);

  return { ok: true, fileName };
}