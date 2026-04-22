import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { apiFetch, API_BASE } from "../api.js";
import "./Inventory.css";
import ProSelect from "../components/ProSelect/ProSelect";
import {
  TbPackage,
  TbArrowsUpDown,
  TbArrowBigUpLines,
  TbArrowBigDownLines,
  TbArrowLeft,
  TbSearch,
  TbPlus,
  TbChartBar,
  TbClock,
  TbRefresh,
  TbDotsVertical,
  TbUserCircle,
  TbEdit,
  TbTrash,
  TbX,
  TbEye,
  TbAlertTriangle,
  TbListDetails,
} from "react-icons/tb";
import ReactECharts from "echarts-for-react";



/* =========================
  5) Activity UI Mapper (NO backend changes)
  - backend guarda PRODUCT_CREATED, MOVEMENT_CREATED, etc.
  - frontend lo mapea a UI pro
========================= */
function activityUI(a) {
  const action = String(a?.action || "");
  const meta = a?.meta || {};

  const base = {
    tone: "neutral", // neutral | green | red | blue | purple | amber
    icon: <TbClock />,
    title: "Actividad",
    verb: "realizó una acción",
  };

  if (action === "PRODUCT_CREATED") {
    return {
      tone: "green",
      icon: <TbPlus />,
      title: "Producto creado",
      verb: "ha creado un producto",
    };
  }

  if (action === "PRODUCT_DELETED") {
    return {
      tone: "amber",
      icon: <TbTrash />,
      title: "Producto eliminado",
      verb: "ha eliminado un producto",
    };
  }

  if (action === "MOVEMENT_CREATED") {
    const type = String(meta?.type || "");
    if (type === "IN") {
      return {
        tone: "blue",
        icon: <TbArrowBigUpLines />,
        title: "Entrada registrada",
        verb: "ha registrado una entrada",
      };
    }
    if (type === "OUT") {
      return {
        tone: "red",
        icon: <TbArrowBigDownLines />,
        title: "Salida registrada",
        verb: "ha registrado una salida",
      };
    }
    return {
      tone: "purple",
      icon: <TbArrowsUpDown />,
      title: "Movimiento registrado",
      verb: "ha registrado un movimiento",
    };
  }

  return base;
}
function formatActivityDate(dt) {
  if (!dt) return "";
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return String(dt);
  }
}
function stockMovementUI(m) {
  const type = String(m?.movement_type || m?.type || "").toUpperCase();
  const qty = Number(m?.qty || 0);

  if (type === "IN") {
    return {
      tone: "green",
      icon: <TbArrowBigUpLines />,
      title: "Entrada registrada",
      verb: "registró una entrada al inventario",
      impact: `+${qty} unidades`,
    };
  }

  if (type === "OUT") {
    return {
      tone: "red",
      icon: <TbArrowBigDownLines />,
      title: "Salida registrada",
      verb: "registró una salida del inventario",
      impact: `-${qty} unidades`,
    };
  }

  return {
    tone: "neutral",
    icon: <TbArrowsUpDown />,
    title: "Movimiento registrado",
    verb: "registró un movimiento",
    impact: `${qty} unidades`,
  };
}
/* =========================
  Permisos (mismo concepto adminpanel)
  - Usa access_policies: depto + level => allowed_modules
========================= */
function canAccessModule(moduleKey, currentWorker, policies = []) {
  if (!currentWorker?.department_id || !currentWorker?.level_id) return true; // fallback

  const p = (policies || []).find(
    (x) => String(x.department_id) === String(currentWorker.department_id) &&
          String(x.level_id) === String(currentWorker.level_id)
  );

  // si no existe policy -> por tu regla: permite todo
  if (!p) return true;

  const allowed = p.allowed_modules || [];
  return allowed.includes(moduleKey);
}

/* =========================
  Mini Charts (SVG, sin librerías)
========================= */
function SparkBars({ values = [] }) {
  const max = Math.max(1, ...values.map((v) => Number(v || 0)));
  return (
    <div className="invSpark">
      {values.slice(-14).map((v, i) => (
        <span
          key={i}
          className="invSparkBar"
          style={{ height: `${Math.max(6, (Number(v || 0) / max) * 100)}%` }}
          title={String(v)}
        />
      ))}
    </div>
  );
}

function Donut({ a = 0, b = 0, labelA = "Entradas", labelB = "Salidas" }) {
  const total = Math.max(1, Number(a) + Number(b));
  const aPct = (Number(a) / total) * 100;
  return (
    <div className="invDonutWrap">
      <svg className="invDonut" viewBox="0 0 42 42">
        <circle className="invDonutBg" cx="21" cy="21" r="15.915" />
        <circle
          className="invDonutA"
          cx="21"
          cy="21"
          r="15.915"
          strokeDasharray={`${aPct} ${100 - aPct}`}
          strokeDashoffset="25"
        />
      </svg>
      <div className="invDonutLegend">
        <div className="invLegendRow"><span className="invLegendDot a" /> {labelA}: <b>{a}</b></div>
        <div className="invLegendRow"><span className="invLegendDot b" /> {labelB}: <b>{b}</b></div>
      </div>
    </div>
  );
}
/* =========================
  Mini Charts (SVG) + View switcher
========================= */
const CARD_VIEWS = [
  { key: "table", label: "Tabla" },
  { key: "bar", label: "Barras" },
  { key: "line", label: "Líneas" },
  { key: "pie", label: "Pastel" },
];
// =========================
// ✅ Filtros por CARD (ProSelect) - GLOBAL
// (CardRangeFilter está fuera de Inventory, por eso debe existir aquí)
// =========================
const CARD_RANGES = [
  { key: "7", label: "Hace 7 días", type: "days", value: 7 },
  { key: "30", label: "Hace 30 días", type: "days", value: 30 },
  { key: "90", label: "Hace 90 días", type: "days", value: 90 },
  { key: "this_month", label: "Este mes", type: "month", value: "this" },
  { key: "last_month", label: "Mes pasado", type: "month", value: "last" },
];
/* =========================
  Text transforms + Money
  - Title Case para inputs de texto (NO búsqueda)
  - SKU siempre en mayúsculas
  - Moneda MXN ($)
========================= */
const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function toTitleCaseLive(value) {
  const s = String(value ?? "");
  // conserva espacios mientras escribes
  return s
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part)) return part;
      const lower = part.toLocaleLowerCase("es-MX");
      const first = lower.charAt(0).toLocaleUpperCase("es-MX");
      return first + lower.slice(1);
    })
    .join("");
}

function toSkuUpperLive(value) {
  return String(value ?? "").toLocaleUpperCase("es-MX");
}

function normalizeSkuBase(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("es-MX");
}

function buildSkuPrefixFromName(name = "") {
  const clean = normalizeSkuBase(name);
  if (!clean) return "PROD";

  const words = clean.split(" ").filter(Boolean);

  if (words.length === 1) {
    return words[0].slice(0, 4).padEnd(4, "X");
  }

  if (words.length === 2) {
    return `${words[0].slice(0, 2)}${words[1].slice(0, 2)}`.padEnd(4, "X");
  }

  if (words.length === 3) {
    return `${words[0].slice(0, 2)}${words[1].slice(0, 1)}${words[2].slice(0, 1)}`.padEnd(4, "X");
  }

  return words
    .slice(0, 4)
    .map((w) => w.charAt(0))
    .join("")
    .padEnd(4, "X");
}

function buildNextSkuPreview(name = "", products = []) {
  const prefix = buildSkuPrefixFromName(name);

  let maxNum = 0;

  for (const p of products || []) {
    const sku = String(p?.sku || "").trim().toLocaleUpperCase("es-MX");
    const match = sku.match(new RegExp(`^${prefix}(\\d{4})$`));
    if (!match) continue;

    const n = Number(match[1] || 0);
    if (n > maxNum) maxNum = n;
  }

  return `${prefix}${String(maxNum + 1).padStart(4, "0")}`;
}

function parseMoneyToNumber(input) {
  const raw = String(input ?? "");
  // deja números y punto decimal
  const cleaned = raw.replace(/[^\d.]/g, "");
  // evita múltiples puntos
  const parts = cleaned.split(".");
  const normalized =
    parts.length <= 2 ? cleaned : `${parts[0]}.${parts.slice(1).join("")}`;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function MiniBarsChart({ items = [], valueKey = "value", labelKey = "label" }) {
  const top = (items || []).slice(0, 8);
  const max = Math.max(1, ...top.map((x) => Number(x?.[valueKey] || 0)));
  return (
    <div className="invChartBox">
      <svg className="invChartSvg" viewBox="0 0 320 180" preserveAspectRatio="none">
        {/* baseline */}
        <line x1="18" y1="160" x2="312" y2="160" stroke="rgba(10,12,14,0.14)" strokeWidth="2" />
        {top.map((x, i) => {
          const v = Number(x?.[valueKey] || 0);
          const h = (v / max) * 120;
          const barW = 28;
          const gap = 10;
          const x0 = 22 + i * (barW + gap);
          const y0 = 160 - h;
          return (
            <g key={i}>
              <rect
                x={x0}
                y={y0}
                width={barW}
                height={h}
                rx="8"
                fill="var(--invChartMain)"
                opacity="0.85"
              />
              <text
                x={x0 + barW / 2}
                y={174}
                textAnchor="middle"
                fontSize="10"
                fill="rgba(10,12,14,0.62)"
              >
                {(String(x?.[labelKey] || "")).slice(0, 4)}
              </text>
              <text
                x={x0 + barW / 2}
                y={y0 - 6}
                textAnchor="middle"
                fontSize="10"
                fill="rgba(10,12,14,0.78)"
              >
                {Math.round(v)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MiniLineChart({ items = [], valueKey = "value" }) {
  const top = (items || []).slice(0, 12);
  const vals = top.map((x) => Number(x?.[valueKey] || 0));
  const max = Math.max(1, ...vals);
  const min = Math.min(0, ...vals);

  const w = 320, h = 180;
  const padL = 18, padR = 8, padT = 12, padB = 20;

  const toX = (i) => {
    const n = Math.max(1, top.length - 1);
    return padL + (i / n) * (w - padL - padR);
  };
  const toY = (v) => {
    const span = Math.max(1, max - min);
    const t = (v - min) / span;
    return (h - padB) - t * (h - padT - padB);
  };

  const d = top.map((x, i) => `${i === 0 ? "M" : "L"} ${toX(i)} ${toY(Number(x?.[valueKey] || 0))}`).join(" ");

  return (
    <div className="invChartBox">
      <svg className="invChartSvg" viewBox="0 0 320 180" preserveAspectRatio="none">
        <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="rgba(10,12,14,0.14)" strokeWidth="2" />
        <path d={d} fill="none" stroke="var(--invChartMain)" strokeWidth="3" strokeLinecap="round" />
        {top.map((x, i) => {
          const v = Number(x?.[valueKey] || 0);
          return (
            <g key={i}>
              <circle cx={toX(i)} cy={toY(v)} r="4" fill="var(--invChartMain)" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MiniPieChart({ a = 0, b = 0, labelA = "A", labelB = "B" }) {
  return (
    <div className="invChartBox invChartPie">
      <Donut a={a} b={b} labelA={labelA} labelB={labelB} />
    </div>
  );
}

function CardMenu({ open, anchorRight = false, onPick }) {
  if (!open) return null;
  return (
    <div className={`invCardMenu ${anchorRight ? "r" : ""}`}>
      {CARD_VIEWS.map((v) => (
        <button key={v.key} type="button" className="invMenuItem" onClick={() => onPick(v.key)}>
          {v.label}
        </button>
      ))}
    </div>
  );
}
function MiniTableView({ rows = [], cols = [] }) {
  // cols: [{ key, label, align?: "l"|"c"|"r", render?: (row)=>node }]
  return (
    <div className="invMiniGrid">
      <div className="invMiniGridHead">
        {cols.map((c) => (
          <div
            key={c.key}
            className={`invMiniGridCell ${c.align || "c"}`}   // ✅ default CENTER
            title={String(c.label || "")}
          >
            {c.label}
          </div>
        ))}
      </div>

      <div className="invMiniGridBody">
        {rows.length === 0 ? (
          <div style={{ padding: 12 }}>
            <InventoryEmptyState
              compact
              icon={<TbListDetails />}
              title="Sin datos"
              subtitle="No hay filas disponibles para esta vista."
            />
          </div>
        ) : (
          rows.map((r, i) => (
            <div className="invMiniGridRow" key={r.id || r.product_id || i}>
              {cols.map((c) => (
                <div
                  key={c.key}
                  className={`invMiniGridCell ${c.align || "c"}`} // ✅ default CENTER
                  title={String((r?.[c.key] ?? "") || "")}
                >
                  {c.render ? c.render(r) : (r?.[c.key] ?? "-")}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
function CardRangeFilter({ value, onChange, ariaLabel = "filtro" }) {
  return (
    <div style={{ minWidth: 180 }}>
      <ProSelect value={value} onChange={onChange} ariaLabel={ariaLabel} placeholder="Periodo">
        {CARD_RANGES.map((r) => (
          <option key={r.key} value={r.key}>
            {r.label}
          </option>
        ))}
      </ProSelect>
    </div>
  );
}

function CardTopActions({ id, openCardMenu, setOpenCardMenu, setView }) {
  return (
    <div className="invCardTopActions">
      <button
        className="invIconBtn"
        type="button"
        title="Vista"
        onClick={() => setOpenCardMenu((prev) => (prev === id ? null : id))}
      >
        <TbDotsVertical />
      </button>

      <CardMenu
        open={openCardMenu === id}
        anchorRight
        onPick={(view) => setView(id, view)}
      />
    </div>
  );
}

function InventoryEmptyState({
  icon = <TbChartBar />,
  title = "Sin datos disponibles",
  subtitle = "Todavía no hay información suficiente para mostrar esta sección.",
  compact = false,
}) {
  return (
    <div className={`invEmptyStatePro ${compact ? "isCompact" : ""}`}>
      <div className="invEmptyStatePro__iconWrap">
        <div className="invEmptyStatePro__icon">
          {icon}
        </div>
      </div>

      <div className="invEmptyStatePro__content">
        <div className="invEmptyStatePro__title">{title}</div>
        <div className="invEmptyStatePro__sub">{subtitle}</div>
      </div>
    </div>
  );
}

function ProTableCard({
  title,
  subtitle,
  leftIcon,
  right,
  columns = [],
  rows = [],
  page = 1,
  pageSize = 10,
  total = 0,
  onPageChange,
  onPageSizeChange,
  emptyText = "Sin registros",
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="invOwnTableCard invOwnTableCard--premium">
      <div className="invOwnTableHero">
        <div className="invOwnTableHero__left">
          <div className="invOwnTableCard__titleWrap">
            <div className="invOwnTableCard__icon">{leftIcon}</div>

            <div className="invOwnTableCard__titleBox">
              <div className="invOwnTableCard__eyebrow">Panel operativo</div>
              <div className="invOwnTableCard__title">{title}</div>
              {subtitle ? <div className="invOwnTableCard__subtitle">{subtitle}</div> : null}
            </div>
          </div>
        </div>

        <div className="invOwnTableHero__right">
          {right ? <div className="invOwnTableCard__right">{right}</div> : null}
        </div>
      </div>

      <div className="invOwnTableWrap">
        <table className="invOwnTable invOwnTable--premium">
          <colgroup>
            {columns.map((col) => (
              <col
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
              />
            ))}
          </colgroup>

          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={col.align ? `ta-${col.align}` : ""}
                >
                  <span className="invOwnTable__thText">{col.label}</span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <div className="invOwnTable__emptyWrap">
                    <div className="invOwnTable__emptyIcon">
                      <TbPackage />
                    </div>
                    <div className="invOwnTable__emptyTitle">Sin registros</div>
                    <div className="invOwnTable__empty">{emptyText}</div>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={row.id || row.product_id || idx}>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={col.align ? `ta-${col.align}` : ""}
                    >
                      {col.render ? col.render(row) : row[col.key] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="invOwnTableFooter">
        <div className="invOwnTableFooter__meta">
          Mostrando <b>{from}</b> - <b>{to}</b> de <b>{total}</b> registros
        </div>

        <div className="invOwnTableFooter__controls">
          <div className="invOwnPageSizeWrap">
            <span>Filas</span>
            <select
              className="invOwnPageSize"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>

          <button
            type="button"
            className="invOwnPagerBtn"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            Anterior
          </button>

          <div className="invOwnPagerInfo">
            <span className="invOwnPagerInfo__dot" />
            Página <b>{page}</b> de <b>{totalPages}</b>
          </div>

          <button
            type="button"
            className="invOwnPagerBtn"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}

function RenderCardView({
  view = "bar",
  items = [],

  // pie (si se pasan, usa 2 slices; si NO, arma pie con items)
  pieA = null,
  pieB = null,
  pieLabelA = "Entradas",
  pieLabelB = "Salidas",

  // tabla
  tableRows = [],
  tableCols = [],

  chartTone = "teal", // teal | blue | green | red | purple

  // ✅ altura controlable (para que la card grande NO tenga huecos)
  height = 240,

  // ✅ estado vacío profesional
  emptyTitle = "Sin datos",
  emptySubtitle = "No hay información suficiente para mostrar esta tarjeta.",
}) {
  const hasChartData = (items || []).some((x) => Number(x?.value ?? x ?? 0) > 0);
  const hasTableData = Array.isArray(tableRows) && tableRows.length > 0;
const hasPiePair =
  pieA !== null &&
  pieA !== undefined &&
  pieB !== null &&
  pieB !== undefined &&
  (Number(pieA || 0) > 0 || Number(pieB || 0) > 0);

const renderEmpty = () => (
    <div className="invCardBody">
      <InventoryEmptyState
        compact
        icon={<TbChartBar />}
        title={emptyTitle}
        subtitle={emptySubtitle}
      />
    </div>
  );

  // ✅ tabla
  if (view === "table") {
    if (!hasTableData) return renderEmpty();

    return (
      <div className="invCardBody isScroll viewTable">
        <MiniTableView rows={tableRows} cols={tableCols} />
      </div>
    );
  }

  // ===== paleta por tono (sin “colores random”) =====
  const toneColor = (() => {
    if (chartTone === "blue") return "#60a5fa";
    if (chartTone === "green") return "#34d399";
    if (chartTone === "red") return "#fb7185";
    if (chartTone === "purple") return "#a78bfa";
    return "#2dd4bf"; // teal
  })();

  // normaliza items -> {name, value}
  const data = (items || []).map((x, idx) => ({
    name: String(x?.label ?? `#${idx + 1}`),
    value: Number(x?.value ?? x ?? 0),
  }));

  if (view === "pie") {
const hasTwo =
  pieA !== null &&
  pieA !== undefined &&
  pieB !== null &&
  pieB !== undefined;

const pieData = hasTwo
  ? [
      { name: pieLabelA, value: Number(pieA || 0) },
      { name: pieLabelB, value: Number(pieB || 0) },
    ]
  : (data || []).filter((d) => d.value > 0).slice(0, 8);

    if (!hasPiePair && pieData.length === 0) return renderEmpty();

    const option = {
      tooltip: { trigger: "item" },
      legend: {
        top: "5%",
        left: "center",
        type: "scroll",
        textStyle: { fontWeight: 900, color: "rgba(10,12,14,0.70)" },
      },
      series: [
        {
          name: "Distribución",
          type: "pie",
          radius: ["40%", "70%"],
          center: ["50%", "60%"],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: "#fff",
            borderWidth: 2,
          },
          label: {
            show: false,
            position: "center",
          },
          emphasis: {
            scale: true,
            scaleSize: 6,
            label: {
              show: true,
              fontSize: 34,
              fontWeight: "bold",
              color: "rgba(10,12,14,0.88)",
              formatter: (p) => `${p.name}\n${p.value}`,
            },
          },
          labelLine: { show: false },
          minAngle: 6,
          data: pieData.map((p, i) => ({
            ...p,
            itemStyle: hasTwo
              ? { color: i === 0 ? toneColor : "rgba(10,12,14,0.18)" }
              : { color: i === 0 ? toneColor : undefined },
          })),
        },
      ],
    };

    return (
      <div className="invCardBody">
        <div className="invEChartWrap" style={{ minHeight: height, height }}>
          <ReactECharts option={option} style={{ height: "100%", width: "100%" }} notMerge />
        </div>
      </div>
    );
  }

  if (view === "line") {
    if (!hasChartData) return renderEmpty();

    const option = {
      title: { text: "", left: "left" },
      tooltip: { trigger: "axis" },
      legend: { top: 6 },
      toolbox: {
        show: true,
        right: 6,
        feature: {
          dataZoom: { yAxisIndex: "none" },
          dataView: { readOnly: true },
          magicType: { type: ["line", "bar"] },
          restore: {},
          saveAsImage: {},
        },
      },
      grid: { left: 12, right: 18, top: 42, bottom: 34, containLabel: true },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: data.map((d) => d.name),
        axisLabel: { color: "rgba(10,12,14,0.62)", fontWeight: 900, hideOverlap: true },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "rgba(10,12,14,0.14)" } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "rgba(10,12,14,0.62)", fontWeight: 900 },
        splitLine: { lineStyle: { color: "rgba(10,12,14,0.10)" } },
      },
      series: [
        {
          name: "Valor",
          type: "line",
          smooth: true,
          symbol: "circle",
          symbolSize: 8,
          data: data.map((d) => d.value),
          lineStyle: { width: 3, color: toneColor },
          itemStyle: { color: toneColor },
          areaStyle: { opacity: 0.10, color: toneColor },
          markPoint: {
            data: [
              { type: "max", name: "Max" },
              { type: "min", name: "Min" },
            ],
          },
          markLine: {
            data: [{ type: "average", name: "Avg" }],
          },
        },
      ],
      dataZoom: [{ type: "inside" }, { type: "slider", height: 16, bottom: 8 }],
    };

    return (
      <div className="invCardBody">
        <div className="invEChartWrap" style={{ minHeight: height, height }}>
          <ReactECharts option={option} style={{ height: "100%", width: "100%" }} notMerge />
        </div>
      </div>
    );
  }

  if (!hasChartData) return renderEmpty();

  const option = {
    animation: true,
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "cross",
        crossStyle: { color: "rgba(10,12,14,0.45)" },
      },
    },
    toolbox: {
      show: true,
      right: 6,
      feature: {
        dataView: { show: true, readOnly: true },
        magicType: { show: true, type: ["line", "bar"] },
        restore: { show: true },
        saveAsImage: { show: true },
      },
    },
    legend: {
      data: ["Valor"],
      top: 6,
      textStyle: { fontWeight: 900, color: "rgba(10,12,14,0.70)" },
    },
    grid: { left: 12, right: 18, top: 42, bottom: 34, containLabel: true },
    xAxis: [
      {
        type: "category",
        data: data.map((d) => d.name),
        axisPointer: { type: "shadow" },
        axisLabel: { color: "rgba(10,12,14,0.62)", fontWeight: 900, hideOverlap: true },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "rgba(10,12,14,0.14)" } },
      },
    ],
    yAxis: [
      {
        type: "value",
        name: "Cantidad",
        min: 0,
        axisLabel: { color: "rgba(10,12,14,0.62)", fontWeight: 900 },
        splitLine: { lineStyle: { color: "rgba(10,12,14,0.10)" } },
      },
    ],
    series: [
      {
        name: "Valor",
        type: "bar",
        data: data.map((d) => d.value),
        barWidth: 26,
        itemStyle: { color: toneColor, borderRadius: [10, 10, 10, 10] },
        emphasis: { focus: "series" },
        tooltip: {
          valueFormatter: (v) => `${v}`,
        },
      },
    ],
  };

  return (
    <div className="invCardBody">
      <div className="invEChartWrap" style={{ minHeight: height, height }}>
        <ReactECharts option={option} style={{ height: "100%", width: "100%" }} notMerge />
      </div>
    </div>
  );
}
/* =========================
  Modal pro (simple)
========================= */
function Modal({
  open,
  title,
  onClose,
  onRequestClose,
  children,
  modalClassName = "",
  bodyClassName = "",
}) {
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) setClosing(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e) => {
      if (e.key === "Escape") {
        (onRequestClose || closeAnimated)();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onRequestClose]);

  const closeAnimated = async () => {
    setClosing(true);
    await new Promise((r) => setTimeout(r, 220));
    onClose?.();
  };

  const handleBackdrop = async () => {
    if (onRequestClose) return onRequestClose();
    return closeAnimated();
  };

  const handleX = async () => {
    if (onRequestClose) return onRequestClose();
    return closeAnimated();
  };

  if (!open) return null;

  return (
    <div
      className={`invModalBack ${closing ? "isClosing" : "isOpening"}`}
      onMouseDown={handleBackdrop}
    >
      <div
        className={`invModal ${modalClassName} ${closing ? "isClosing" : "isOpening"}`.trim()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="invModalTop">
          <div className="invModalTitle">{title}</div>

          <button
            className="invIconBtn invCloseBtn"
            onClick={handleX}
            type="button"
            aria-label="Cerrar"
          >
            <TbX />
          </button>
        </div>

        <div className={`invModalBody ${bodyClassName}`.trim()}>{children}</div>
      </div>
    </div>
  );
}
// =========================
// SweetAlerts PRO (confirm + loading + toast)
// =========================
async function swalConfirm({ title, text, confirmText = "Sí, continuar", icon = "warning" }) {
  const r = await Swal.fire({
    title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: "Cancelar",
    reverseButtons: true,
    focusCancel: true,
    heightAuto: false,
  });
  return r.isConfirmed;
}

function swalLoading(title = "Procesando…") {
  Swal.fire({
    title,
    allowOutsideClick: false,
    allowEscapeKey: false,
    didOpen: () => Swal.showLoading(),
    heightAuto: false,
  });
}

function swalToast(icon, title) {
  return Swal.fire({
    toast: true,
    position: "top-end",
    icon,
    title,
    showConfirmButton: false,
    timer: 2200,
    timerProgressBar: true,
    heightAuto: false,
  });
}

async function swalApiWrap(fn, { loadingTitle, successTitle } = {}) {
  try {
    if (loadingTitle) swalLoading(loadingTitle);
    const res = await fn();
    Swal.close();
    if (successTitle) await swalToast("success", successTitle);
    return res;
  } catch (e) {
    Swal.close();
    await Swal.fire({
      icon: "error",
      title: "Error",
      text: e?.message || "Algo falló",
      heightAuto: false,
    });
    throw e;
  }
}
/* =========================
  Main
========================= */
export default function Inventory({ currentWorker }) {
  const [tab, setTab] = useState("dashboard"); // dashboard | products | stock | movements | analytics(análisis operativo)
const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  // data
  const [policies, setPolicies] = useState([]);
  const [products, setProducts] = useState([]);
  const [stock, setStock] = useState([]);
const [analytics, setAnalytics] = useState([]);
const [activity, setActivity] = useState([]);

const [performanceSummary, setPerformanceSummary] = useState(null);
  // ✅ TOP widgets (dashboard pro)
  const [topStock, setTopStock] = useState([]);
  const [topIn, setTopIn] = useState([]);
  const [topOut, setTopOut] = useState([]);

  // ✅ 5) Top Entradas + Top Salidas (toggle tipo carrusel)
  const [topIOPane, setTopIOPane] = useState("IN");   // IN | OUT

// ui
const [q, setQ] = useState("");
const [onlyLowStock, setOnlyLowStock] = useState(false); // ✅ NUEVO
const [movementOpen, setMovementOpen] = useState(false);
const [movementType, setMovementType] = useState("IN");
const [movementReason, setMovementReason] = useState("");
const [movementItems, setMovementItems] = useState([]);

// ✅ dirty control (movimiento)
const [movementDirty, setMovementDirty] = useState(false);

const [productOpen, setProductOpen] = useState(false);

// ✅ create | edit
const [productMode, setProductMode] = useState("create");
const [editingProductId, setEditingProductId] = useState(null);

const [productDraft, setProductDraft] = useState({
  name: "",
  sku: "",
  unit: "pz",
  stock_min: "",
});
// ✅ dirty control (producto)
const [productDirty, setProductDirty] = useState(false);
const [productSkuTouched, setProductSkuTouched] = useState(false);

// ✅ detalle de movimientos por producto (stock)
const [stockDetailOpen, setStockDetailOpen] = useState(false);
const [stockDetailLoading, setStockDetailLoading] = useState(false);
const [selectedStockProduct, setSelectedStockProduct] = useState(null);
const [stockMovementRows, setStockMovementRows] = useState([]);

// ✅ preview profesional de movimiento individual
const [movementPreviewOpen, setMovementPreviewOpen] = useState(false);
const [selectedMovement, setSelectedMovement] = useState(null);

// ✅ modal profesional de edición de movimiento
const [movementEditOpen, setMovementEditOpen] = useState(false);
const [editingMovementItem, setEditingMovementItem] = useState(null);
const [movementEditDraft, setMovementEditDraft] = useState({
  qty: "",
  reason: "",
});

const [productPage, setProductPage] = useState(1);
const [productPageSize, setProductPageSize] = useState(10);

const [stockPage, setStockPage] = useState(1);
const [stockPageSize, setStockPageSize] = useState(10);
  // ✅ menú abierto (id de la card) o null
  const [openCardMenu, setOpenCardMenu] = useState(null);
// ✅ vista por card (table|bar|line|pie)
const [cardView, setCardView] = useState({
  // dashboard
  topStock: "bar",
  io: "pie",
  topIn: "bar",
  topOut: "bar",
  lowStock: "line",

  // analytics tab
  perf30: "line",
  aRisk: "pie",
  aRotation: "bar",
  aDead: "bar",
  aCoverage: "bar",
});


const [cardRange, setCardRange] = useState({
  // dashboard
  io: "30",
  topIn: "30",
  topOut: "30",
  lowStock: "30",

  // analytics tab
  perf30: "30",
  aTopIO: "30",

  // historial
  movements: "30",
});

function rangeToDays(rangeKey) {
  const r = CARD_RANGES.find((x) => x.key === rangeKey) || CARD_RANGES[1];
if (r.type === "days") return Number(r.value) || 30;

  // month-based
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const startLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const diffDays = (a, b) => Math.ceil((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
  if (r.value === "this") return Math.max(7, diffDays(now, start));
return Number(Math.max(7, diffDays(now, startLast))) || 30;
}

function filterByRange(list = [], rangeKey) {
  const days = rangeToDays(rangeKey);
  const min = Date.now() - days * 24 * 60 * 60 * 1000;
  return (list || []).filter((x) => {
    const t = x?.created_at ? new Date(x.created_at).getTime() : 0;
    return t >= min;
  });
}
  const setView = (id, view) => {
    setCardView((p) => ({ ...p, [id]: view }));
    setOpenCardMenu(null);
  };

const allowed = useMemo(
  () => canAccessModule("inventory", currentWorker, policies),
  [currentWorker, policies]
);

/* =========================
   ✅ CARGA PRINCIPAL (loadAll)
   - days controla analytics/performanceSummary/top/activity
   - lightweight=true evita recargar products/stock/policies cada vez
========================= */
async function loadAll({ days = 30, lightweight = false } = {}) {
  setLoading(true);

  // ✅ policies solo si no es lightweight
  let p = { data: [] };
  if (!lightweight) {
    p = await apiFetch("/api/admin/access-policies").catch((e) => {
      console.warn("⚠️ policies failed:", e.message);
      return { data: [] };
    });
  }

  const endpoints = [
    // solo al cargar “completo”
    ...(!lightweight
      ? [
          { key: "products", url: "/api/inventory/products" },
          { key: "stock", url: "/api/inventory/stock" },
        ]
      : []),

    // dashboard/analytics depende del periodo
    { key: "analytics", url: `/api/inventory/analytics?days=${days}` },
    { key: "performanceSummary", url: `/api/inventory/performance-summary?days=${days}`, optional: true },

    { key: "activity", url: `/api/inventory/activity?days=${days}&limit=25&offset=0` },

    { key: "topStock", url: "/api/inventory/top-stock?limit=8" },
    { key: "topIn", url: `/api/inventory/top-in?days=${days}&limit=8` },
    { key: "topOut", url: `/api/inventory/top-out?days=${days}&limit=8` },
  ];
  try {
    const results = await Promise.allSettled(endpoints.map((e) => apiFetch(e.url)));

    const byKey = {};
    const failed = [];

    results.forEach((r, i) => {
      const k = endpoints[i].key;

      if (r.status === "fulfilled") {
        byKey[k] = r.value?.data ?? null;
        return;
      }

      const isOptional = !!endpoints[i].optional;
      byKey[k] = null;

      if (!isOptional) {
        failed.push(`${endpoints[i].url} -> ${r.reason?.message || r.reason}`);
      }

      console.warn(
        "❌ Inventory endpoint failed:",
        endpoints[i].url,
        r.reason?.message || r.reason,
        isOptional ? "(optional)" : ""
      );
    });

    setLoadError(failed.length ? `Fallaron ${failed.length} endpoints. Revisa consola/Network.` : "");

    if (!lightweight) {
      setPolicies(p.data || []);
      setProducts(byKey.products || []);
      setStock(byKey.stock || []);
    }

    setAnalytics(byKey.analytics || []);
    setPerformanceSummary(byKey.performanceSummary || null);
    setActivity(byKey.activity || []);

    setTopStock(byKey.topStock || []);
    setTopIn(byKey.topIn || []);
    setTopOut(byKey.topOut || []);
  } finally {
    setLoading(false);
  }
}

/* =========================
   ✅ Recargar dashboard por periodo
========================= */
async function reloadDashboardDays(days) {
  return loadAll({ days, lightweight: true });
}
useEffect(() => {
  loadAll();
  // eslint-disable-next-line
}, []);
useEffect(() => {
  // fuerza a ECharts a recalcular layout (móvil/rotación/cambio tab)
  const t = setTimeout(() => {
    window.dispatchEvent(new Event("resize"));
  }, 80);
  return () => clearTimeout(t);
}, [tab, openCardMenu, cardView, cardRange]);
/* =========================
   Realtime (SSE)
   - Se actualiza SOLO cuando entra/sale algo o crean producto
========================= */
useEffect(() => {
  let es;
  let fallbackTimer;

  const connect = () => {
    try {
      // ✅ arma URL igual que apiFetch (evita /api/api si API_BASE="/api")
      const sseUrl = (() => {
        const base = String(API_BASE || "").replace(/\/+$/, ""); // sin slash final
        let p = "/api/inventory/stream";
        if (base.endsWith("/api") && p.startsWith("/api/")) {
          p = p.replace(/^\/api/, ""); // quita solo el primer /api
        }
        return `${base}${p}`;
      })();

      es = new EventSource(sseUrl);

es.onmessage = (ev) => {
  try {
    const msg = JSON.parse(ev.data || "{}");
    if (!msg?.type) return;

    // ✅ toaster LOW STOCK (a todos con inventario abierto)
    if (msg.type === "LOW_STOCK") {
      const name = msg.name || "Producto";
      const rem = Number(msg.remaining || 0);

      Swal.fire({
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 4200,
        timerProgressBar: true,
        icon: "warning",
        title: "Alerta",
        html: `
          <div style="font-weight:900;opacity:.9;margin-top:2px">
            <span style="opacity:.75">El producto</span> <b>${name}</b>
            <span style="opacity:.75">se está acabando</span>
          </div>
          <div style="font-weight:900;opacity:.85;margin-top:2px">
            Quedan <b>${rem}</b> en stock
          </div>
        `,
        background: "rgba(255,255,255,0.96)",
        didOpen: (toast) => {
          toast.style.borderRadius = "14px";
          toast.style.boxShadow = "0 18px 70px rgba(0,0,0,0.18)";
        },
        heightAuto: false,
      });
    }

    // ✅ recarga datos (stock / productos / actividad)
    if (
      msg.type === "MOVEMENT_CREATED" ||
      msg.type === "MOVEMENT_UPDATED" ||
      msg.type === "MOVEMENT_DELETED" ||
      msg.type === "PRODUCT_CREATED" ||
      msg.type === "PRODUCT_DELETED" ||
      msg.type === "LOW_STOCK"
    ) {
      loadAll();
    }
  } catch (e) {}
};

      es.onerror = () => {
        try { es?.close?.(); } catch (e) {}
        es = null;

        if (!fallbackTimer) {
          fallbackTimer = setInterval(() => loadAll(), 15000);
        }
      };
    } catch (e) {
      if (!fallbackTimer) {
        fallbackTimer = setInterval(() => loadAll(), 15000);
      }
    }
  };

  connect();

  return () => {
    try { es?.close?.(); } catch (e) {}
    if (fallbackTimer) clearInterval(fallbackTimer);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
  // métricas dashboard
  const totals = useMemo(() => {
    const totalProducts = products.length;
    const totalStock = stock.reduce((a, x) => a + Number(x.stock || 0), 0);

    const last = analytics || [];
    const sumIn = last.reduce((a, x) => a + Number(x.qty_in || 0), 0);
    const sumOut = last.reduce((a, x) => a + Number(x.qty_out || 0), 0);

    // spark
    const sparkIn = last.map((x) => Number(x.qty_in || 0));
    const sparkOut = last.map((x) => Number(x.qty_out || 0));

    return {
      totalProducts,
      totalStock,
      sumIn,
      sumOut,
      sparkIn,
      sparkOut,
    };
  }, [products, stock, analytics]);

  // filtros
  const filteredProducts = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products;
    return products.filter((p) => {
      const hay = `${p.sku || ""} ${p.name || ""} ${p.unit || ""}`.toLowerCase();
      return hay.includes(s);
    });
  }, [products, q]);
useEffect(() => {
  setProductPage(1);
}, [q, products.length]);

useEffect(() => {
  setStockPage(1);
}, [q, onlyLowStock, stock.length]);
const filteredStock = useMemo(() => {
  const base = stock || [];
  const s = q.trim().toLowerCase();

  let out = base;

  if (s) {
    out = out.filter((p) => {
      const hay = `${p.sku || ""} ${p.name || ""}`.toLowerCase();
      return hay.includes(s);
    });
  }

  if (onlyLowStock) {
    out = out.filter((p) => {
      const currentStock = Number(p.stock || 0);
      const minStock = Number(p.stock_min || 0);
      return Boolean(p.is_low_stock) || currentStock <= minStock;
    });
  }

  return out;
}, [stock, q, onlyLowStock]);
/* =========================
   ✅ DataGrid: Products & Stock
========================= */

const stockByProductId = useMemo(() => {
  const m = new Map();
  (stock || []).forEach((s) => {
    const id = String(s.product_id || s.id || "");
    if (!id) return;
    m.set(id, Number(s.stock || 0));
  });
  return m;
}, [stock]);

// rows PRODUCTS (DataGrid pide "id")
const productRows = useMemo(() => {
  return (filteredProducts || []).map((p) => {
    const st = stockByProductId.get(String(p.id)) ?? 0;
    return {
      id: p.id,
      name: p.name || "",
      sku: p.sku || "",
      unit: p.unit || "",
      stock: Number(st || 0),
      stock_min: Number(p.stock_min || 0),
      _raw: p,
    };
  });
}, [filteredProducts, stockByProductId]);

const productColumns = useMemo(
  () => [
    {
      key: "name",
      label: "Producto",
      render: (row) => {
const st = Number(row.stock || 0);
const low = Number(st) <= Number(row._raw?.stock_min || 0);

        return (
          <div className="invOwnProductCell">
            <div className="invOwnProductCell__avatar">
              <TbPackage />
            </div>

            <div className="invOwnCellMain">
              <div className="invOwnCellMain__title">{row.name || "-"}</div>
              <div className="invOwnCellMain__sub">
                {row.unit ? `Unidad: ${row.unit}` : "Producto registrado"}
              </div>

              <div className="invOwnCellMain__meta">
                <span className="invSoftTag">{row.unit || "—"}</span>
                {low ? <span className="invBadgeLow">Stock bajo</span> : null}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: "sku",
      label: "Referencia",
      align: "center",
      width: 150,
      render: (row) => <span className="invSkuPill invSkuPillPro">{row.sku || "—"}</span>,
    },
    {
      key: "stock",
      label: "Stock",
      align: "center",
      width: 130,
      render: (row) => {
        const st = Number(row.stock || 0);
        const low = st <= Number(row.stock_min || 0);
        return <span className={`invStockPill invStockPillPro ${low ? "low" : "ok"}`}>{st}</span>;
      },
    },
    {
      key: "actions",
      label: "Acciones",
      align: "center",
      width: 170,
      render: (row) => {
        const p = row._raw;
        return (
          <div className="invRowActions invRowActionsPro">
            <button
              type="button"
              className="invActBtn edit"
              title="Editar producto"
              onClick={() => openEditProduct(p)}
            >
              <TbEdit />
            </button>

            <button
              type="button"
              className="invActBtn del"
              title="Eliminar producto"
              onClick={() => deleteProduct(p)}
            >
              <TbTrash />
            </button>
          </div>
        );
      },
    },
  ],
  [openEditProduct, deleteProduct]
);
const stockRows = useMemo(() => {
  return (filteredStock || []).map((s) => ({
    id: s.product_id || s.id,
    name: s.name || s.product_name || "",
    sku: s.sku || "",
    unit: s.unit || "pz",
    stock: Number(s.stock || 0),
    stock_min: Number(s.stock_min || 0),
    is_low_stock: Boolean(s.is_low_stock),
    _raw: s,
  }));
}, [filteredStock]);
const stockStats = useMemo(() => {
  const rows = stockRows || [];
  const totalSkus = rows.length;
  const totalQty = rows.reduce((a, r) => a + Number(r.stock || 0), 0);

  const lowCount = rows.filter((r) => {
    const currentStock = Number(r.stock || 0);
    const minStock = Number(r.stock_min || 0);
    return Boolean(r.is_low_stock) || currentStock <= minStock;
  }).length;

  const lowPct = totalSkus ? (lowCount / totalSkus) * 100 : 0;

  return {
    totalSkus,
    totalQty,
    lowCount,
    lowPct,
  };
}, [stockRows]);
const paginatedProductRows = useMemo(() => {
  const start = (productPage - 1) * productPageSize;
  const end = start + productPageSize;
  return productRows.slice(start, end);
}, [productRows, productPage, productPageSize]);

const paginatedStockRows = useMemo(() => {
  const start = (stockPage - 1) * stockPageSize;
  const end = start + stockPageSize;
  return stockRows.slice(start, end);
}, [stockRows, stockPage, stockPageSize]);
const stockColumns = useMemo(
  () => [
    {
      key: "name",
      label: "Producto",
      render: (row) => {
        const st = Number(row.stock || 0);
        const min = Number(row.stock_min || 0);
        const low = st <= min;

        return (
          <div className="invOwnProductCell">
            <div className={`invOwnProductCell__avatar ${low ? "isLow" : ""}`}>
              <TbPackage />
            </div>

            <div className="invOwnCellMain">
              <div className="invOwnCellMain__title">{row.name || "-"}</div>
              <div className="invOwnCellMain__sub">
                {low ? "Por debajo del mínimo" : "Stock saludable"}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: "sku",
      label: "Referencia",
      align: "center",
      width: 150,
      render: (row) => <span className="invSkuPill invSkuPillPro">{row.sku || "—"}</span>,
    },
    {
      key: "stock_min",
      label: "Mínimo",
      align: "center",
      width: 130,
      render: (row) => <span className="invSoftMetric">{Number(row.stock_min || 0)}</span>,
    },
    {
      key: "stock",
      label: "Disponible",
      align: "center",
      width: 140,
      render: (row) => {
        const st = Number(row.stock || 0);
        const low = st <= Number(row.stock_min || 0);
        return <span className={`invStockPill invStockPillPro ${low ? "low" : "ok"}`}>{st}</span>;
      },
    },
    {
      key: "alert",
      label: "Estado",
      align: "center",
      width: 150,
      render: (row) => {
        const low =
          Boolean(row.is_low_stock) ||
          Number(row.stock || 0) <= Number(row.stock_min || 0);

        return low ? (
          <span className="invAlertPill low">
            <TbAlertTriangle /> Bajo
          </span>
        ) : (
          <span className="invAlertPill ok">Óptimo</span>
        );
      },
    },
    {
      key: "actions",
      label: "Detalle",
      align: "center",
      width: 130,
      render: (row) => {
        return (
          <div className="invRowActions invRowActionsPro">
            <button
              type="button"
              className="invActBtn view"
              title="Ver movimientos"
              onClick={() => openStockMovements(row)}
            >
              <TbEye />
            </button>
          </div>
        );
      },
    },
  ],
  []
);
const dataGridSx = useMemo(() => ({}), []);

function openMovement(type) {
  setMovementType(type);
  setMovementReason("");
  setMovementItems([{ product_id: "", qty: 1 }]);
  setMovementOpen(true);
}

function addMovementRow() {
  setMovementDirty(true);
  setMovementItems((prev) => [...prev, { product_id: "", qty: 1 }]);
}
function updateMovementRow(i, key, val) {
  setMovementDirty(true);
  setMovementItems((prev) =>
    prev.map((row, idx) => {
      if (idx !== i) return row;
      return { ...row, [key]: val };
    })
  );
}
function removeMovementRow(i) {
  setMovementDirty(true);
  setMovementItems((prev) => prev.filter((_, idx) => idx !== i));
}

async function saveMovement() {
  const items = movementItems
    .map((it) => ({
      product_id: it.product_id,
      qty: Number(it.qty || 0),
      unit_cost: 0,
    }))
    .filter((x) => x.product_id && x.qty > 0);

  // ✅ CIERRA MODAL ANTES de cualquier SweetAlert
  setMovementOpen(false);
  await new Promise((r) => setTimeout(r, 180));

  if (items.length === 0) {
    await Swal.fire({
      icon: "info",
      title: "Falta información",
      text: "Agrega al menos 1 producto con cantidad > 0",
      heightAuto: false,
    });
    return;
  }

  const ok = await swalConfirm({
    title: movementType === "IN" ? "Confirmar entrada" : "Confirmar salida",
    text: `Se registrarán ${items.length} producto(s). ¿Deseas continuar?`,
    confirmText: "Registrar",
    icon: "question",
  });
  if (!ok) return;

  try {
    await swalApiWrap(
      () =>
        apiFetch("/api/inventory/movements", {
          method: "POST",
          body: JSON.stringify({
            type: movementType,
            reason: movementReason,
            created_by: currentWorker?.id || null,
            items,
          }),
        }),
      {
        loadingTitle: "Registrando movimiento…",
        successTitle: "Movimiento registrado",
      }
    );
  } catch (e) {
    const msg = String(e?.message || "");

    if (msg.includes("INSUFFICIENT_STOCK")) {
      await Swal.fire({
        icon: "warning",
        title: "No se puede registrar la salida",
        html: `
          <div style="text-align:left;font-weight:800;opacity:.9;margin-bottom:8px">
            No hay stock suficiente para completar la salida.
          </div>
          <div style="text-align:left;opacity:.85">
            Revisa cantidades vs existencias.
          </div>
        `,
        heightAuto: false,
      });
      return;
    }

    return;
  }

  await loadAll();
  setTab("dashboard");
}
async function deleteProduct(p) {
  if (!p?.id) return;

  const st = stockByProductId.get(String(p.id)) ?? 0;

  const ok = await swalConfirm({
    title: "Eliminar producto",
    text:
      st > 0
        ? `Este producto aún tiene stock (${st}). Si lo eliminas puedes romper reportes/historial. ¿Continuar?`
        : `¿Seguro que deseas eliminar "${p.name}"?`,
    confirmText: "Eliminar",
    icon: "warning",
  });
  if (!ok) return;

  await swalApiWrap(
    () =>
      apiFetch(`/api/inventory/products/${p.id}`, {
        method: "DELETE",
        body: JSON.stringify({
          deleted_by: currentWorker?.id || null,
        }),
      }),
    {
      loadingTitle: "Eliminando producto…",
      successTitle: "Producto eliminado",
    }
  );

  await loadAll();
  setTab("products");
}
function openCreateProduct() {
  setProductMode("create");
  setEditingProductId(null);
  setProductDirty(false);
  setProductSkuTouched(false);

  setProductDraft({
    name: "",
    sku: "",
    unit: "pz",
    stock_min: "",
  });

  setProductOpen(true);
}
function openEditProduct(p) {
  if (!p?.id) return;

  setProductMode("edit");
  setEditingProductId(p.id);
  setProductDirty(false);
  setProductSkuTouched(true);

  setProductDraft({
    name: p.name || "",
    sku: p.sku || "",
    unit: p.unit || "pz",
    stock_min: String(p.stock_min ?? ""),
  });

  setProductOpen(true);
}
async function loadStockMovementsForProduct(productId) {
  const res = await apiFetch(
    `/api/inventory/stock-movements/${encodeURIComponent(productId)}?limit=100&offset=0`
  );

  setStockMovementRows(Array.isArray(res?.data) ? res.data : []);
}

async function openStockMovements(row) {
  const productId = row?.id || row?.product_id;

  if (!productId) {
    await Swal.fire({
      icon: "error",
      title: "Producto inválido",
      text: "No se encontró el id del producto para consultar movimientos.",
      heightAuto: false,
    });
    return;
  }

  setSelectedStockProduct(row);
  setSelectedMovement(null);
  setMovementPreviewOpen(false);
  setStockMovementRows([]);
  setStockDetailLoading(true);
  setStockDetailOpen(true);

  try {
    await loadStockMovementsForProduct(productId);
  } catch (e) {
    await Swal.fire({
      icon: "error",
      title: "No se pudieron cargar los movimientos",
      text: e?.message || "Error al consultar el desglose del producto.",
      heightAuto: false,
    });
    setStockDetailOpen(false);
  } finally {
    setStockDetailLoading(false);
  }
}

function openMovementPreview(m) {
  setSelectedMovement(m);
  setMovementPreviewOpen(true);
}

function editStockMovementItem(m) {
  if (!m?.item_id) return;

  setEditingMovementItem(m);
  setMovementEditDraft({
    qty: String(Number(m.qty || 0) || ""),
    reason: String(m.movement_reason || m.reason || ""),
  });
  setMovementEditOpen(true);
}

async function saveEditedStockMovementItem() {
  if (!editingMovementItem?.item_id) return;

  const qty = Number(movementEditDraft.qty || 0);
  const reason = String(movementEditDraft.reason || "").trim();

  if (!qty || qty <= 0) {
    await Swal.fire({
      icon: "info",
      title: "Cantidad inválida",
      text: "La cantidad debe ser mayor a 0.",
      heightAuto: false,
    });
    return;
  }

  const ok = await swalConfirm({
    title: "Guardar cambios",
    text: "¿Deseas actualizar este movimiento?",
    confirmText: "Guardar",
    icon: "question",
  });
  if (!ok) return;

  await swalApiWrap(
    () =>
      apiFetch(`/api/inventory/movement-items/${editingMovementItem.item_id}`, {
        method: "PUT",
        body: JSON.stringify({
          qty,
          reason,
          updated_by: currentWorker?.id || null,
        }),
      }),
    {
      loadingTitle: "Guardando movimiento…",
      successTitle: "Movimiento actualizado",
    }
  );

  setMovementEditOpen(false);
  setEditingMovementItem(null);
  setMovementEditDraft({ qty: "", reason: "" });

  setMovementPreviewOpen(false);
  setSelectedMovement(null);

  await loadAll();

  if (selectedStockProduct?.id || selectedStockProduct?.product_id) {
    await loadStockMovementsForProduct(
      selectedStockProduct?.id || selectedStockProduct?.product_id
    );
  }
}

function closeMovementEditModal() {
  setMovementEditOpen(false);
  setEditingMovementItem(null);
  setMovementEditDraft({ qty: "", reason: "" });
}
async function deleteStockMovementItem(m) {
  if (!m?.item_id) return;

  const ok = await swalConfirm({
    title: "Eliminar movimiento",
    text: "¿Seguro que deseas eliminar esta partida del inventario?",
    confirmText: "Eliminar",
    icon: "warning",
  });

  if (!ok) return;

  await swalApiWrap(
    () =>
      apiFetch(`/api/inventory/movement-items/${m.item_id}`, {
        method: "DELETE",
        body: JSON.stringify({
          deleted_by: currentWorker?.id || null,
        }),
      }),
    {
      loadingTitle: "Eliminando movimiento…",
      successTitle: "Movimiento eliminado",
    }
  );

  setMovementPreviewOpen(false);
  setSelectedMovement(null);

  await loadAll();

  if (selectedStockProduct?.id || selectedStockProduct?.product_id) {
    await loadStockMovementsForProduct(selectedStockProduct?.id || selectedStockProduct?.product_id);
  }
} 

const movementPreview = useMemo(() => {
  if (!selectedMovement) return null;

  const ui = stockMovementUI(selectedMovement);
  const type = String(
    selectedMovement?.movement_type || selectedMovement?.type || ""
  ).toUpperCase();

  const qty = Number(selectedMovement?.qty || 0);

  const currentStock = Number(selectedStockProduct?.stock || 0);
  const stockMin = Number(selectedStockProduct?.stock_min || 0);

  const who =
    selectedMovement?.actor_full_name ||
    selectedMovement?.actor_username ||
    "Usuario";

  const username = selectedMovement?.actor_username
    ? `@${selectedMovement.actor_username}`
    : "";

  const department = selectedMovement?.actor_department || "";
  const when = formatActivityDate(
    selectedMovement?.movement_created_at || selectedMovement?.created_at
  );
  const reason =
    selectedMovement?.movement_reason || selectedMovement?.reason || "Sin motivo";

  const reasonLower = String(reason || "").toLowerCase();
  const isLossReason =
    type === "OUT" &&
    (
      reasonLower.includes("merma") ||
      reasonLower.includes("pérdida") ||
      reasonLower.includes("perdida") ||
      reasonLower.includes("daño") ||
      reasonLower.includes("daño") ||
      reasonLower.includes("caduc") ||
      reasonLower.includes("robo") ||
      reasonLower.includes("baja")
    );

  const operationLabel =
    type === "IN"
      ? "Ingreso"
      : isLossReason
      ? "Pérdida"
      : type === "OUT"
      ? "Salida"
      : "Movimiento";

  const stockRelationOption = {
    animation: true,
    tooltip: { trigger: "axis" },
    grid: { left: 18, right: 18, top: 22, bottom: 26, containLabel: true },
    xAxis: {
      type: "category",
      data: ["Movimiento", "Stock actual", "Mínimo"],
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "rgba(10,12,14,0.14)" } },
      axisLabel: { fontWeight: 900, color: "rgba(10,12,14,0.70)" },
    },
    yAxis: {
      type: "value",
      axisLabel: { fontWeight: 900, color: "rgba(10,12,14,0.62)" },
      splitLine: { lineStyle: { color: "rgba(10,12,14,0.08)" } },
    },
    series: [
      {
        type: "bar",
        barWidth: 28,
        data: [
          { value: qty, itemStyle: { color: type === "IN" ? "#13a96f" : "#e04646", borderRadius: 10 } },
          { value: currentStock, itemStyle: { color: "#2f6fed", borderRadius: 10 } },
          { value: stockMin, itemStyle: { color: "#7b8794", borderRadius: 10 } },
        ],
      },
    ],
  };

  const impactDonutOption = {
    animation: true,
    tooltip: { trigger: "item" },
    legend: {
      bottom: 0,
      left: "center",
      textStyle: { fontWeight: 800, color: "rgba(10,12,14,0.68)" },
    },
    series: [
      {
        type: "pie",
        radius: ["52%", "74%"],
        center: ["50%", "44%"],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: {
          borderColor: "#fff",
          borderWidth: 2,
          borderRadius: 10,
        },
        data: [
          {
            name: operationLabel,
            value: Math.max(0, qty),
            itemStyle: { color: type === "IN" ? "#13a96f" : "#e04646" },
          },
          {
            name: "Stock actual",
            value: Math.max(0, currentStock),
            itemStyle: { color: "#2f6fed" },
          },
        ],
      },
    ],
  };

  return {
    ui,
    qty,
    currentStock,
    stockMin,
    who,
    username,
    department,
    when,
    reason,
    type,
    operationLabel,
    stockRelationOption,
    impactDonutOption,
  };
}, [selectedMovement, selectedStockProduct]);

async function saveProduct() {
  const name = String(productDraft.name || "").trim();
  const sku = String(productDraft.sku || "").trim();
  const unit = productDraft.unit || "pz";
  const stock_min = parseMoneyToNumber(productDraft.stock_min);

  const isEdit = productMode === "edit" && !!editingProductId;

  // ✅ CIERRA MODAL ANTES de cualquier SweetAlert
  setProductOpen(false);
  await new Promise((r) => setTimeout(r, 180));

  if (!name) {
    await Swal.fire({
      icon: "info",
      title: "Falta nombre",
      text: "Escribe el nombre del producto.",
      heightAuto: false,
    });
    return;
  }

  const ok = await swalConfirm({
    title: isEdit ? "Confirmar cambios" : "Confirmar producto",
    text: isEdit
      ? `¿Guardar cambios del producto "${name}"?`
      : `¿Crear el producto "${name}"?`,
    confirmText: isEdit ? "Guardar" : "Crear",
    icon: "question",
  });
  if (!ok) return;

  await swalApiWrap(
    () =>
      apiFetch(
        isEdit ? `/api/inventory/products/${editingProductId}` : "/api/inventory/products",
        {
          method: isEdit ? "PUT" : "POST",
          body: JSON.stringify({
            name,
            sku,
            unit,
            stock_min,
            updated_by: currentWorker?.id || null,
            created_by: currentWorker?.id || null,
          }),
        }
      ),
    {
      loadingTitle: isEdit ? "Guardando cambios…" : "Creando producto…",
      successTitle: isEdit ? "Producto actualizado" : "Producto creado",
    }
  );

  await loadAll();
  setTab("products");
}
/* =========================
   ✅ 2.5 Confirmación al cerrar (ESC / backdrop / X / Cancelar)
========================= */
async function confirmCloseIfDirty(kind) {
  const isDirty = kind === "product" ? productDirty : movementDirty;

  if (!isDirty) return true;

  const r = await Swal.fire({
    icon: "warning",
    title: "¿Cancelar cambios?",
    text: "No has guardado. Si sales, se perderán los cambios.",
    showCancelButton: true,
    confirmButtonText: "Sí, salir",
    cancelButtonText: "Volver",
    reverseButtons: true,
    focusCancel: true,
    heightAuto: false,
  });

  return r.isConfirmed;
}

async function requestCloseProductModal() {
  const ok = await confirmCloseIfDirty("product");
  if (!ok) return;
  setProductOpen(false);
  setProductDirty(false);
}

async function requestCloseMovementModal() {
  const ok = await confirmCloseIfDirty("movement");
  if (!ok) return;
  setMovementOpen(false);
  setMovementDirty(false);
}
const movementModalTotals = useMemo(() => {
  const cleanItems = (movementItems || []).map((it) => {
    const product = (products || []).find((p) => String(p.id) === String(it.product_id));
    const qty = Number(it.qty || 0);
    const unitValue = 0;
    const lineTotal = 0;

    return {
      ...it,
      product,
      qty,
      unitValue,
      lineTotal,
    };
  });

  const totalLines = cleanItems.filter((x) => x.product_id).length;
  const totalQty = cleanItems.reduce((a, x) => a + Number(x.qty || 0), 0);
  const totalAmount = 0;

  return {
    items: cleanItems,
    totalLines,
    totalQty,
    totalAmount,
  };
}, [movementItems, products]);
const productModalSummary = useMemo(() => {
  const stockMin = parseMoneyToNumber(productDraft.stock_min);

  return {
    name: String(productDraft.name || "").trim() || "Producto sin nombre",
    sku: String(productDraft.sku || "").trim() || "Sin SKU",
    unit: productDraft.unit || "pz",
    stockMin,
  };
}, [productDraft]);
if (!allowed) {
  return (
   <div className="invWrap invMonday">
      <div className="invNoAccess">
        <div className="invNoAccessTitle">Sin acceso</div>
        <div className="invNoAccessSub">
          Tu puesto/departamento no tiene permiso para el módulo <b>Inventario</b>.
        </div>
      </div>
    </div>
  );
}

return (
  <div className="invWrap invFluid">
 {/* Header pro */}
<div className="invTop">
  <div className="invTopLeft">
    <div className="invTitle">
      <TbPackage /> Inventario
    </div>
<div className="invSub">
  Dashboard · Productos · Stock · Movimientos · Rendimiento operativo
</div>
  </div>

  {/* ✅ Búsqueda centrada entre título y botones */}
  <div className="invTopMid">
    <div className="invSearch">
      <TbSearch />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar producto, sku, unidad..."
      />
    </div>
  </div>

  {/* ✅ Botones arriba derecha */}
  <div className="invTopRight">
    <button className="invBtn invIn" type="button" onClick={() => openMovement("IN")}>
      <TbArrowBigUpLines /> Entrada
    </button>

    <button className="invBtn invOut" type="button" onClick={() => openMovement("OUT")}>
      <TbArrowBigDownLines /> Salida
    </button>
  </div>
</div>

      {/* Tabs */}
      <div className="invTabs">
        <button className={`invTab ${tab === "dashboard" ? "on" : ""}`} onClick={() => setTab("dashboard")}>
          Inicio
        </button>
        <button className={`invTab ${tab === "products" ? "on" : ""}`} onClick={() => setTab("products")}>
          Productos
        </button>
        <button className={`invTab ${tab === "stock" ? "on" : ""}`} onClick={() => setTab("stock")}>
          Stock
        </button>
        <button className={`invTab ${tab === "analytics" ? "on" : ""}`} onClick={() => setTab("analytics")}>
          Análisis
        </button>
        <button className={`invTab ${tab === "movements" ? "on" : ""}`} onClick={() => setTab("movements")}>
          Historial
        </button>
      </div>

     {loading ? (
  <div className="invLoading">Cargando inventario…</div>
) : (
  <>
    {/* ✅ Banner de error si algo falló */}
    {loadError ? (
      <div className="invCard" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>⚠️ Inventario: carga parcial</div>
        <div style={{ opacity: 0.8 }}>{loadError}</div>
        <div style={{ opacity: 0.65, marginTop: 6 }}>
          Abre DevTools → Network y revisa qué endpoint responde 404/500.
        </div>
      </div>
    ) : null}

    {/* =========================
        DASHBOARD
    ========================= */}
{tab === "dashboard" && (
  <div className="invDash">
    {/* ===== KPIs (arriba, estilo software) ===== */}
    <div className="invKpiRow">
      <div className="invKpiTile toneA">
        <div className="invKpiTileTop">
          <div className="invKpiTileTitle">TOTAL PRODUCTOS</div>
          <div className="invKpiTileIcon"><TbPackage /></div>
        </div>
        <div className="invKpiTileValue">{totals.totalProducts}</div>
        <div className="invKpiTileSub">Catálogo activo</div>
      </div>

      <div className="invKpiTile toneB">
        <div className="invKpiTileTop">
          <div className="invKpiTileTitle">STOCK TOTAL</div>
          <div className="invKpiTileIcon"><TbChartBar /></div>
        </div>
        <div className="invKpiTileValue">{totals.totalStock}</div>
        <div className="invKpiTileSub">Existencias acumuladas</div>
      </div>

<div className="invKpiTile toneIn">
  <div className="invKpiTileTop">
    <div className="invKpiTileTitle">ENTRADAS ({rangeToDays(cardRange.io)} DÍAS)</div>
    <div className="invKpiTileIcon"><TbArrowBigUpLines /></div>
  </div>
  <div className="invKpiTileValue">{totals.sumIn}</div>
  <div className="invKpiTileSub">Movimientos IN</div>
</div>

<div className="invKpiTile toneOut">
  <div className="invKpiTileTop">
    <div className="invKpiTileTitle">SALIDAS (30 DÍAS)</div>
    <div className="invKpiTileIcon"><TbArrowBigDownLines /></div>
  </div>
  <div className="invKpiTileValue">{totals.sumOut}</div>
  <div className="invKpiTileSub">Movimientos OUT</div>
</div>

      <div className="invKpiTile toneOps">
        <div className="invKpiTileTop">
          <div className="invKpiTileTitle">PRODUCTOS CON STOCK BAJO</div>
          <div className="invKpiTileIcon"><TbAlertTriangle /></div>
        </div>
        <div className="invKpiTileValue">{stockStats.lowCount}</div>
        <div className="invKpiTileSub">Requieren atención</div>
      </div>
    </div>

{/* ===== Zona central PRO (aprovecha todo el espacio) ===== */}
<div className="invDashGridPro">
  {/* ========= IZQUIERDA: Top Stock ========= */}
  <div className="invCard invCol6">
    <div className="invCardTop invCardTopCompact">
      <div>
        <div className="invCardTitle"><TbChartBar /> Top Productos Inventario</div>
        <div className="invCardSub">Mayor stock actual · cambia vista con ⋮</div>
      </div>

      <CardTopActions
        id="topStock"
        openCardMenu={openCardMenu}
        setOpenCardMenu={setOpenCardMenu}
        setView={setView}
      />
    </div>

    <RenderCardView
      view={cardView.topStock}
      chartTone="blue"
      height={260}
      items={topStock.map((x) => ({ label: x.name || x.product_name || "-", value: Number(x.stock || 0) }))}
      tableRows={topStock}
      tableCols={[
        { key: "name", label: "Producto", render: (r) => <b>{r.name || r.product_name || "-"}</b> },
        { key: "sku", label: "SKU", align: "c", render: (r) => (r.sku || "-") },
        { key: "stock", label: "Stock", align: "r", render: (r) => <b>{Number(r.stock || 0)}</b> },
      ]}
    />
  </div>

  {/* ========= DERECHA ARRIBA: Entradas/Salidas ========= */}
  <div className="invCard invCol6">
    <div className="invCardTop invCardTopCompact">
      <div>
        <div className="invCardTitle"><TbArrowsUpDown /> Entradas / Salidas</div>
        <div className="invCardSub">Volumen ({rangeToDays(cardRange.io)} días) · cambia vista con ⋮</div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <CardRangeFilter
          value={cardRange.io}
          ariaLabel="periodo-io"
          onChange={async (e) => {
            const v = e.target.value;
            setCardRange((p) => ({ ...p, io: v }));
            await reloadDashboardDays(rangeToDays(v));
          }}
        />

        <CardTopActions
          id="io"
          openCardMenu={openCardMenu}
          setOpenCardMenu={setOpenCardMenu}
          setView={setView}
        />
      </div>
    </div>

    <RenderCardView
      view={cardView.io || "pie"}
      chartTone="teal"
      height={260}
      pieA={totals.sumIn}
      pieB={totals.sumOut}
      pieLabelA="Entradas"
      pieLabelB="Salidas"
      tableRows={[
        { id: "in", label: "Entradas", value: totals.sumIn },
        { id: "out", label: "Salidas", value: totals.sumOut },
      ]}
      tableCols={[
        { key: "label", label: "Tipo", render: (r) => <b>{r.label}</b> },
        { key: "value", label: "Cantidad", align: "r", render: (r) => <b>{Number(r.value || 0)}</b> },
      ]}
    />
  </div>

  {/* ========= FILA: Top Valorizados (izq) + Actividad (der) ========= */}
  <div className="invCard invCol6 invCard--sameHeightPair invCard--lowStock">
    <div className="invCardTop invCardTopCompact">
      <div>
        <div className="invCardTitle"><TbAlertTriangle /> Productos con stock bajo</div>
        <div className="invCardSub">Productos que requieren reabastecimiento</div>
      </div>

      <CardTopActions
        id="lowStock"
        openCardMenu={openCardMenu}
        setOpenCardMenu={setOpenCardMenu}
        setView={setView}
      />
    </div>

    <RenderCardView
      view={cardView.lowStock}
      chartTone="red"
      height={340}
      items={stockRows
        .filter((x) => Number(x.stock || 0) <= Number(x.stock_min || 0))
        .slice(0, 8)
        .map((x) => ({ label: x.name || "-", value: Number(x.stock || 0) }))}
      tableRows={stockRows
        .filter((x) => Number(x.stock || 0) <= Number(x.stock_min || 0))
        .slice(0, 8)}
      tableCols={[
        { key: "name", label: "Producto", render: (r) => <b>{r.name || "-"}</b> },
        { key: "sku", label: "SKU", align: "c", render: (r) => r.sku || "-" },
        { key: "stock", label: "Stock", align: "r", render: (r) => <b>{Number(r.stock || 0)}</b> },
      ]}
    />
  </div>

  <div className="invCard invCol6 invCard--sameHeightPair invCard--recentActivity">
    <div className="invCardTop invCardTopCompact">
      <div>
        <div className="invCardTitle"><TbClock /> Actividad reciente</div>
        <div className="invCardSub">Filtrado por periodo · actualizado en tiempo real</div>
      </div>

      <CardRangeFilter
        value={cardRange.movements}
        ariaLabel="periodo-actividad"
        onChange={async (e) => {
          const v = e.target.value;
          setCardRange((p) => ({ ...p, movements: v }));
          await reloadDashboardDays(rangeToDays(v));
        }}
      />
    </div>

<div className="invCardBody isScroll invCardBody--recentActivity">
  {activity.length === 0 ? (
    <InventoryEmptyState
      icon={<TbClock />}
      title="Sin actividad reciente"
      subtitle="Todavía no hay movimientos, altas o eventos registrados en este periodo."
    />
  ) : (
    <div className="invFeed">
      {activity.map((a) => {
        const ui = activityUI(a);
        const who = a.actor_full_name || a.actor_username || "Usuario";
        const when = a.created_at ? new Date(a.created_at).toLocaleString() : "";

        const details = [];
        if (a.actor_department) details.push(a.actor_department);
        if (a.meta?.type)
          details.push(
            a.meta.type === "IN"
              ? "Entrada"
              : a.meta.type === "OUT"
              ? "Salida"
              : String(a.meta.type)
          );
        if (a.meta?.reason) details.push(String(a.meta.reason));

        return (
          <div className={`invActRow tone-${ui.tone}`} key={a.id}>
            <div className="invActAvatar">
              {a.actor_profile_photo_url ? (
                <img src={a.actor_profile_photo_url} alt={who} />
              ) : (
                <div className="invActAvatarPh">
                  <TbUserCircle />
                </div>
              )}
            </div>

            <div className="invActBody">
              <div className="invActTopLine">
                <div className="invActIcon">{ui.icon}</div>
                <div className="invActTitle">{ui.title}</div>
                <div className="invActTime">{when}</div>
              </div>

              <div className="invActText">
                <b>{who}</b> {ui.verb}
              </div>

              {details.length ? (
                <div className="invActMeta">
                  {details.map((t, i) => (
                    <span className="invActChip" key={i}>
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  )}
</div>
  </div>

  {/* ========= Top Entradas / Salidas (DOBLE, ancho 2 cards) ========= */}
  <div className="invCard invCol12">
    <div className="invCardTop invCardTopCompact">
      <div>
        <div className="invCardTitle"><TbArrowsUpDown /> Top Entradas / Salidas</div>
        <div className="invCardSub">Por producto ({rangeToDays(cardRange.topIn)} días)</div>
      </div>

  <div className="invCardTools">
  <div className="invRange">
    <CardRangeFilter
      value={cardRange.topIn}
      ariaLabel="periodo-top-io"
      onChange={async (e) => {
        const v = e.target.value;
        setCardRange((p) => ({ ...p, topIn: v, topOut: v }));
        await reloadDashboardDays(rangeToDays(v));
      }}
    />
  </div>

  <div className="invSeg">
    <button
      type="button"
      className={`invTab ${topIOPane === "IN" ? "on" : ""}`}
      onClick={() => setTopIOPane("IN")}
    >
      <TbArrowBigUpLines /> Entradas
    </button>

    <button
      type="button"
      className={`invTab ${topIOPane === "OUT" ? "on" : ""}`}
      onClick={() => setTopIOPane("OUT")}
    >
      <TbArrowBigDownLines /> Salidas
    </button>
  </div>

  <div className="invDots">
    <CardTopActions
      id={topIOPane === "IN" ? "topIn" : "topOut"}
      openCardMenu={openCardMenu}
      setOpenCardMenu={setOpenCardMenu}
      setView={setView}
    />
  </div>
</div>
    </div>

    <RenderCardView
      view={cardView[topIOPane === "IN" ? "topIn" : "topOut"] || "bar"}
      chartTone={topIOPane === "IN" ? "green" : "red"}
      height={320}  // ✅ más grande “como 2 cards”
      items={(topIOPane === "IN" ? topIn : topOut).map((x) => ({
        label: x.name || x.product_name || "-",
        value: Number(x.qty || 0),
      }))}
      tableRows={topIOPane === "IN" ? topIn : topOut}
      tableCols={[
        { key: "name", label: "Producto", render: (r) => <b>{r.name || r.product_name || "-"}</b> },
        { key: "sku", label: "SKU", align: "c", render: (r) => (r.sku || "-") },
        { key: "qty", label: "Qty", align: "r", render: (r) => <b>{Number(r.qty || 0)}</b> },
      ]}
    />
  </div>
</div>
  </div>
)}
{tab === "products" && (
  <ProTableCard
    title="Productos"
    subtitle="Catálogo profesional de productos"
    leftIcon={<TbPackage />}
    right={
      <>
        <div className="invTableHeroStat">
          <span className="k">Registros</span>
          <span className="v">{productRows.length}</span>
        </div>

        <button
          className="invBtn invPrimary invCreateBtnPro"
          type="button"
          onClick={openCreateProduct}
        >
          <TbPlus /> Crear
        </button>
      </>
    }
    columns={productColumns}
    rows={paginatedProductRows}
    page={productPage}
    pageSize={productPageSize}
    total={productRows.length}
    onPageChange={setProductPage}
    onPageSizeChange={(size) => {
      setProductPageSize(size);
      setProductPage(1);
    }}
    emptyText="No hay productos. Crea uno con “Crear”."
  />
)}
    {/* =========================
        STOCK
    ========================= */}
{tab === "stock" && (
  <div className="invStockBlock">
    <div className="invStockSummaryHero">
      <div className="invStockStat modern">
        <div className="k">SKUs</div>
        <div className="v">{stockStats.totalSkus}</div>
      </div>

      <div className="invStockStat modern">
        <div className="k">Stock total</div>
        <div className="v">{stockStats.totalQty}</div>
      </div>

      <div className="invStockStat warn modern">
        <div className="k">Bajo stock</div>
        <div className="v">
          {stockStats.lowCount} <span className="p">({stockStats.lowPct.toFixed(0)}%)</span>
        </div>
      </div>
    </div>

    <ProTableCard
      title="Stock"
      subtitle="Inventario operativo · control visual de existencias"
      leftIcon={<TbPackage />}
      right={
        <>
          <button
            type="button"
            className={`invBtn invFilterBtnPro ${onlyLowStock ? "invPrimary" : "invGhost"}`}
            onClick={() => setOnlyLowStock((v) => !v)}
            title="Filtra productos con stock bajo"
          >
            {onlyLowStock ? "Mostrando bajos" : "Solo bajos"}
          </button>

          <button
            className="invBtn invRefreshBtnPro"
            type="button"
            onClick={() => loadAll()}
            title="Refrescar"
          >
            <TbRefresh /> Refrescar
          </button>
        </>
      }
      columns={stockColumns}
      rows={paginatedStockRows}
      page={stockPage}
      pageSize={stockPageSize}
      total={stockRows.length}
      onPageChange={setStockPage}
      onPageSizeChange={(size) => {
        setStockPageSize(size);
        setStockPage(1);
      }}
      emptyText="Sin stock (o no hay productos aún)."
    />
  </div>
)}
    {/* =========================
        ANALYTICS
    ========================= */}
{tab === "analytics" && (
  <div className="invAnalyticsCol">
    <div className="invKpiRow">
      <div className="invKpiTile toneOut">
        <div className="invKpiTileTop">
          <div className="invKpiTileTitle">PRODUCTOS CRÍTICOS</div>
          <div className="invKpiTileIcon"><TbAlertTriangle /></div>
        </div>
        <div className="invKpiTileValue">
          {Number(performanceSummary?.critical_count || 0)}
        </div>
        <div className="invKpiTileSub">Riesgo de desabasto</div>
      </div>

      <div className="invKpiTile toneA">
        <div className="invKpiTileTop">
          <div className="invKpiTileTitle">SALUDABLES</div>
          <div className="invKpiTileIcon"><TbPackage /></div>
        </div>
        <div className="invKpiTileValue">
          {Number(performanceSummary?.status_buckets?.healthy || 0)}
        </div>
        <div className="invKpiTileSub">Stock en buen estado</div>
      </div>

      <div className="invKpiTile toneOps">
        <div className="invKpiTileTop">
          <div className="invKpiTileTitle">SIN MOVIMIENTO</div>
          <div className="invKpiTileIcon"><TbClock /></div>
        </div>
        <div className="invKpiTileValue">
          {Number(performanceSummary?.status_buckets?.dead || 0)}
        </div>
        <div className="invKpiTileSub">Productos inmóviles</div>
      </div>

      <div className="invKpiTile toneB">
        <div className="invKpiTileTop">
          <div className="invKpiTileTitle">SOBRESTOCK</div>
          <div className="invKpiTileIcon"><TbChartBar /></div>
        </div>
        <div className="invKpiTileValue">
          {Number(performanceSummary?.status_buckets?.overstock || 0)}
        </div>
        <div className="invKpiTileSub">Cobertura alta</div>
      </div>
    </div>

    <div className="invDashGridPro">
      <div className="invCard invCol8">
        <div className="invCardTop invCardTopCompact">
          <div>
            <div className="invCardTitle"><TbChartBar /> Tendencia operativa</div>
            <div className="invCardSub">Entradas y salidas del periodo</div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <CardRangeFilter
              value={cardRange.perf30}
              ariaLabel="periodo-rendimiento"
              onChange={async (e) => {
                const v = e.target.value;
                setCardRange((p) => ({ ...p, perf30: v }));
                await reloadDashboardDays(rangeToDays(v));
              }}
            />

            <CardTopActions
              id="perf30"
              openCardMenu={openCardMenu}
              setOpenCardMenu={setOpenCardMenu}
              setView={setView}
            />
          </div>
        </div>

        {analytics.length === 0 ? (
          <div className="invCardBody">
            <InventoryEmptyState
              icon={<TbChartBar />}
              title="Sin tendencia operativa"
              subtitle="Registra entradas o salidas para generar comportamiento histórico en este periodo."
            />
          </div>
        ) : cardView.perf30 === "table" ? (
          <RenderCardView
            view="table"
            tableRows={analytics.map((x, i) => ({
              id: x.day || i,
              day: x.day || "-",
              qty_in: Number(x.qty_in || 0),
              qty_out: Number(x.qty_out || 0),
            }))}
            tableCols={[
              { key: "day", label: "Día", render: (r) => <b>{r.day}</b> },
              { key: "qty_in", label: "IN", align: "r", render: (r) => <b>{r.qty_in}</b> },
              { key: "qty_out", label: "OUT", align: "r", render: (r) => <b>{r.qty_out}</b> },
            ]}
          />
        ) : cardView.perf30 === "pie" ? (
          <RenderCardView
            view="pie"
            chartTone="teal"
            height={250}
            pieA={(analytics || []).reduce((a, x) => a + Number(x.qty_in || 0), 0)}
            pieB={(analytics || []).reduce((a, x) => a + Number(x.qty_out || 0), 0)}
            pieLabelA="Entradas"
            pieLabelB="Salidas"
            tableRows={[
              { id: "in", label: "Entradas", value: (analytics || []).reduce((a, x) => a + Number(x.qty_in || 0), 0) },
              { id: "out", label: "Salidas", value: (analytics || []).reduce((a, x) => a + Number(x.qty_out || 0), 0) },
            ]}
            tableCols={[
              { key: "label", label: "Tipo", render: (r) => <b>{r.label}</b> },
              { key: "value", label: "Cantidad", align: "r", render: (r) => <b>{Number(r.value || 0)}</b> },
            ]}
          />
        ) : (
          <div className="invCardBody">
            <div className="invEChartWrap" style={{ minHeight: 250, height: 250 }}>
              <ReactECharts
                notMerge
                style={{ height: "100%", width: "100%" }}
                option={{
                  animation: true,
                  tooltip: { trigger: "axis" },
                  grid: { left: 14, right: 14, top: 20, bottom: 28, containLabel: true },
                  legend: {
                    top: 0,
                    textStyle: { fontWeight: 900, color: "rgba(10,12,14,0.75)" },
                  },
                  xAxis: {
                    type: "category",
                    boundaryGap: cardView.perf30 === "bar",
                    data: (analytics || []).map((x) => String(x.day || "")),
                    axisLabel: {
                      hideOverlap: true,
                      color: "rgba(10,12,14,0.65)",
                      fontWeight: 900,
                      formatter: (v) => String(v).slice(5, 10),
                    },
                    axisLine: { lineStyle: { color: "rgba(10,12,14,0.14)" } },
                    axisTick: { show: false },
                  },
                  yAxis: {
                    type: "value",
                    axisLabel: { color: "rgba(10,12,14,0.65)", fontWeight: 900 },
                    splitLine: { lineStyle: { color: "rgba(10,12,14,0.10)" } },
                  },
                  series:
                    cardView.perf30 === "line"
                      ? [
                          {
                            name: "Entradas",
                            type: "line",
                            smooth: true,
                            symbol: "circle",
                            symbolSize: 6,
                            lineStyle: { width: 3, color: "#34d399" },
                            itemStyle: { color: "#34d399" },
                            areaStyle: { opacity: 0.08, color: "#34d399" },
                            data: (analytics || []).map((x) => Number(x.qty_in || 0)),
                          },
                          {
                            name: "Salidas",
                            type: "line",
                            smooth: true,
                            symbol: "circle",
                            symbolSize: 6,
                            lineStyle: { width: 3, color: "#fb7185" },
                            itemStyle: { color: "#fb7185" },
                            areaStyle: { opacity: 0.08, color: "#fb7185" },
                            data: (analytics || []).map((x) => Number(x.qty_out || 0)),
                          },
                        ]
                      : [
                          {
                            name: "Entradas",
                            type: "bar",
                            data: (analytics || []).map((x) => Number(x.qty_in || 0)),
                            barWidth: 16,
                            itemStyle: { color: "#34d399", borderRadius: [8, 8, 8, 8] },
                          },
                          {
                            name: "Salidas",
                            type: "bar",
                            data: (analytics || []).map((x) => Number(x.qty_out || 0)),
                            barWidth: 16,
                            itemStyle: { color: "#fb7185", borderRadius: [8, 8, 8, 8] },
                          },
                        ],
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="invCard invCol4">
        <div className="invCardTop invCardTopCompact">
          <div>
            <div className="invCardTitle"><TbArrowsUpDown /> Estado operativo</div>
            <div className="invCardSub">Distribución general del inventario</div>
          </div>

          <CardTopActions
            id="aRisk"
            openCardMenu={openCardMenu}
            setOpenCardMenu={setOpenCardMenu}
            setView={setView}
          />
        </div>

        <RenderCardView
          view={cardView.aRisk || "pie"}
          chartTone="red"
          height={250}
          items={[
            { label: "Saludable", value: Number(performanceSummary?.status_buckets?.healthy || 0) },
            { label: "Crítico", value: Number(performanceSummary?.status_buckets?.critical || 0) },
            { label: "Sin movimiento", value: Number(performanceSummary?.status_buckets?.dead || 0) },
            { label: "Sobrestock", value: Number(performanceSummary?.status_buckets?.overstock || 0) },
          ]}
          tableRows={[
            { id: "healthy", label: "Saludable", value: Number(performanceSummary?.status_buckets?.healthy || 0) },
            { id: "critical", label: "Crítico", value: Number(performanceSummary?.status_buckets?.critical || 0) },
            { id: "dead", label: "Sin movimiento", value: Number(performanceSummary?.status_buckets?.dead || 0) },
            { id: "overstock", label: "Sobrestock", value: Number(performanceSummary?.status_buckets?.overstock || 0) },
          ]}
          tableCols={[
            { key: "label", label: "Estado", render: (r) => <b>{r.label}</b> },
            { key: "value", label: "Cantidad", align: "r", render: (r) => <b>{r.value}</b> },
          ]}
          emptyTitle="Sin estado operativo"
          emptySubtitle="Aún no hay suficiente información para clasificar el inventario del periodo."
        />
      </div>

      <div className="invCard invCol4">
        <div className="invCardTop invCardTopCompact">
          <div>
            <div className="invCardTitle"><TbRefresh /> Top rotación</div>
            <div className="invCardSub">Productos que más giran</div>
          </div>

          <CardTopActions
            id="aRotation"
            openCardMenu={openCardMenu}
            setOpenCardMenu={setOpenCardMenu}
            setView={setView}
          />
        </div>

        <RenderCardView
          view={cardView.aRotation || "bar"}
          chartTone="blue"
          height={210}
          items={(performanceSummary?.top_rotation_products || []).slice(0, 5).map((x) => ({
            label: x.name || "-",
            value: Number(x.rotation_score || 0),
          }))}
          tableRows={(performanceSummary?.top_rotation_products || []).slice(0, 5)}
          tableCols={[
            { key: "name", label: "Producto", render: (r) => <b>{r.name || "-"}</b> },
            { key: "rotation_score", label: "Rot.", align: "r", render: (r) => <b>{Number(r.rotation_score || 0).toFixed(2)}</b> },
          ]}
          emptyTitle="Sin rotación relevante"
          emptySubtitle="Todavía no hay salidas suficientes en el periodo para destacar productos con giro."
        />
      </div>

      <div className="invCard invCol4">
        <div className="invCardTop invCardTopCompact">
          <div>
            <div className="invCardTitle"><TbClock /> Sin movimiento</div>
            <div className="invCardSub">Productos sin actividad reciente</div>
          </div>

          <CardTopActions
            id="aDead"
            openCardMenu={openCardMenu}
            setOpenCardMenu={setOpenCardMenu}
            setView={setView}
          />
        </div>

        <RenderCardView
          view={cardView.aDead || "bar"}
          chartTone="red"
          height={210}
          items={(performanceSummary?.dead_stock_products || []).slice(0, 5).map((x) => ({
            label: x.name || "-",
            value: Number(x.stock || 0),
          }))}
          tableRows={(performanceSummary?.dead_stock_products || []).slice(0, 5)}
          tableCols={[
            { key: "name", label: "Producto", render: (r) => <b>{r.name || "-"}</b> },
            { key: "stock", label: "Stock", align: "r", render: (r) => <b>{Number(r.stock || 0)}</b> },
          ]}
          emptyTitle="Sin inventario inmóvil"
          emptySubtitle="No hay productos sin movimiento en el periodo seleccionado."
        />
      </div>

      <div className="invCard invCol4">
        <div className="invCardTop invCardTopCompact">
          <div>
            <div className="invCardTitle"><TbAlertTriangle /> Cobertura baja</div>
            <div className="invCardSub">Productos que podrían agotarse pronto</div>
          </div>

          <CardTopActions
            id="aCoverage"
            openCardMenu={openCardMenu}
            setOpenCardMenu={setOpenCardMenu}
            setView={setView}
          />
        </div>

        <RenderCardView
          view={cardView.aCoverage || "bar"}
          chartTone="red"
          height={210}
          items={(performanceSummary?.low_coverage_products || []).slice(0, 5).map((x) => ({
            label: x.name || "-",
            value: Number(x.coverage_days || 0),
          }))}
          tableRows={(performanceSummary?.low_coverage_products || []).slice(0, 5)}
          tableCols={[
            { key: "name", label: "Producto", render: (r) => <b>{r.name || "-"}</b> },
            { key: "coverage_days", label: "Días", align: "r", render: (r) => <b>{Number(r.coverage_days || 0).toFixed(1)}</b> },
          ]}
          emptyTitle="Sin cobertura baja"
          emptySubtitle="No hay productos con riesgo inmediato de agotarse."
        />
      </div>
    </div>
  </div>
)}
    {/* =========================
        MOVEMENTS / HISTORIAL
    ========================= */}
    {tab === "movements" && (
      <div className="invCard">
<div className="invCardTop invCardTopCompact">
  <div>
    <div className="invCardTitle"><TbClock /> Historial</div>
    <div className="invCardSub">Filtrado por periodo (backend) · scroll interno</div>
  </div>

  <CardRangeFilter
    value={cardRange.movements}
    ariaLabel="periodo-historial"
    onChange={async (e) => {
      const v = e.target.value;
      setCardRange((p) => ({ ...p, movements: v }));
      await reloadDashboardDays(rangeToDays(v));
    }}
  />
</div>
        <div className="invCardBody isScroll">
          {activity.length === 0 ? (
            <InventoryEmptyState
              icon={<TbClock />}
              title="Sin historial disponible"
              subtitle="Todavía no existen eventos registrados para el rango de fechas seleccionado."
            />
          ) : (
            <div className="invFeed">
              {activity.map((a) => {
                
                const ui = activityUI(a);
                const who = a.actor_full_name || a.actor_username || "Usuario";
                const when = a.created_at ? new Date(a.created_at).toLocaleString() : "";

                const details = [];
                if (a.actor_department) details.push(a.actor_department);
                if (a.meta?.type) details.push(a.meta.type === "IN" ? "Entrada" : a.meta.type === "OUT" ? "Salida" : String(a.meta.type));
                if (a.meta?.reason) details.push(String(a.meta.reason));

                return (
                  <div className={`invActRow tone-${ui.tone}`} key={a.id}>
                    <div className="invActAvatar">
                      {a.actor_profile_photo_url ? (
                        <img src={a.actor_profile_photo_url} alt={who} />
                      ) : (
                        <div className="invActAvatarPh"><TbUserCircle /></div>
                      )}
                    </div>

                    <div className="invActBody">
                      <div className="invActTopLine">
                        <div className="invActIcon">{ui.icon}</div>
                        <div className="invActTitle">{ui.title}</div>
                        <div className="invActTime">{when}</div>
                      </div>

                      <div className="invActText">
                        <b>{who}</b> {ui.verb}
                      </div>

                      {details.length ? (
                        <div className="invActMeta">
                          {details.map((t, i) => (
                            <span className="invActChip" key={i}>{t}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    )}

          {/* =========================
              Product Modal (DENTRO del fragment)
          ========================= */}
<Modal
  open={productOpen}
  title={productMode === "edit" ? "Editar producto" : "Agregar producto"}
  onClose={() => setProductOpen(false)}
  onRequestClose={requestCloseProductModal}
  modalClassName="invModal--fit invModal--proForm"
  bodyClassName="invModalBody--proForm"
>
  <div className="invProModal">
    <div className="invProModal__main">
      <div className="invProModal__header">
        <div>
          <div className="invProModal__title">
            {productMode === "edit" ? "Editar producto" : "Agregar producto"}
          </div>
          <div className="invProModal__subtitle">
            {productMode === "edit"
              ? "Actualiza la información principal del artículo dentro del inventario."
              : "Crea un nuevo artículo dentro del inventario general."}
          </div>
        </div>

        <div className="invProModal__badge">
          {productMode === "edit" ? "Edición" : "Nuevo"}
        </div>
      </div>

      <div className="invProModal__grid">
        <div className="invProModal__left">
          <div className="invProCard">
            <div className="invProCard__title">
              <TbPackage /> Información del producto
            </div>

            <div className="invProFormGrid">
              <div className="invField invSpan2">
                <label>Nombre del producto *</label>
<input
  value={productDraft.name}
  onChange={(e) => {
    const nextName = toTitleCaseLive(e.target.value);

    setProductDirty(true);

    setProductDraft((p) => {
      const shouldAutofillSku =
        productMode === "create" &&
        !productSkuTouched;

      return {
        ...p,
        name: nextName,
        sku: shouldAutofillSku
          ? buildNextSkuPreview(nextName, products)
          : p.sku,
      };
    });
  }}
  placeholder="Ingresa el nombre del producto"
/>
              </div>

              <div className="invField">
                <label>SKU / Código</label>
<input
  value={productDraft.sku}
  onChange={(e) => {
    setProductDirty(true);
    setProductSkuTouched(true);
    setProductDraft((p) => ({ ...p, sku: toSkuUpperLive(e.target.value) }));
  }}
  placeholder="Se genera automáticamente"
/>
              </div>

              <div className="invField">
                <label>Unidad</label>
                <ProSelect
                  value={productDraft.unit}
                  onChange={(e) => {
                    setProductDirty(true);
                    setProductDraft((p) => ({ ...p, unit: e.target.value }));
                  }}
                  ariaLabel="unidad-producto"
                  placeholder="Selecciona unidad"
                >
                  <option value="pz">Pieza (pz)</option>
                  <option value="kg">Kilogramo (kg)</option>
                  <option value="g">Gramo (g)</option>
                  <option value="lt">Litro (lt)</option>
                  <option value="ml">Mililitro (ml)</option>
                  <option value="m">Metro (m)</option>
                  <option value="cm">Centímetro (cm)</option>
                  <option value="caja">Caja</option>
                  <option value="paq">Paquete</option>
                </ProSelect>
              </div>
            </div>
          </div>

<div className="invProCard">
  <div className="invProCard__title">
    <TbChartBar /> Control del producto
  </div>

  <div className="invProFormGrid invProFormGrid--2">
    <div className="invField">
      <label>Stock mínimo</label>
      <input
        inputMode="decimal"
        value={productDraft.stock_min}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "" || /^\d*\.?\d*$/.test(v)) {
            setProductDirty(true);
            setProductDraft((p) => ({ ...p, stock_min: v }));
          }
        }}
        placeholder="0"
      />
    </div>

    <div className="invField">
      <label>Tipo de captura</label>
      <ProSelect
        value={productMode}
        onChange={() => {}}
        ariaLabel="tipo-captura"
      >
        <option value={productMode}>
          {productMode === "edit" ? "Edición de producto" : "Alta de producto"}
        </option>
      </ProSelect>
    </div>
  </div>
</div>
        </div>

        <aside className="invProModal__right">
          <div className="invProSummary">
            <div className="invProSummary__title">Resumen del producto</div>

            <div className="invProSummary__media">
              <div className="invProSummary__mediaIcon">
                <TbPackage />
              </div>
            </div>
<div className="invProSummary__list">
  <div className="invProSummary__item">
    <span>Nombre</span>
    <b>{productModalSummary.name}</b>
  </div>

  <div className="invProSummary__item">
    <span>SKU</span>
    <b>{productModalSummary.sku}</b>
  </div>

  <div className="invProSummary__item">
    <span>Unidad</span>
    <b>{productModalSummary.unit}</b>
  </div>

  <div className="invProSummary__item">
    <span>Stock mínimo</span>
    <b>{Number(productModalSummary.stockMin || 0)}</b>
  </div>
</div>
          </div>
        </aside>
      </div>
    </div>

    <div className="invProModal__footer">
      <button className="invBtn invGhost" type="button" onClick={requestCloseProductModal}>
        Cancelar
      </button>

      <button className="invBtn invPrimary" type="button" onClick={saveProduct}>
        {productMode === "edit" ? "Guardar cambios" : "Crear producto"}
      </button>
    </div>
  </div>
</Modal>

          {/* =========================
              Movement Modal (DENTRO del fragment)
          ========================= */}
<Modal
  open={movementOpen}
  title={movementType === "IN" ? "Registrar Entrada" : "Registrar Salida"}
  onClose={() => setMovementOpen(false)}
  onRequestClose={requestCloseMovementModal}
  modalClassName="invModal--fit invModal--proForm"
  bodyClassName="invModalBody--proForm"
>
  <div className="invProModal">
    <div className="invProModal__main">
      <div className="invProModal__header">
        <div>
          <div className="invProModal__title">
            {movementType === "IN" ? "Registrar entrada" : "Registrar salida"}
          </div>
<div className="invProModal__subtitle">
  {movementType === "IN"
    ? "Captura ingresos de inventario con detalle por producto."
    : "Captura salidas de inventario con control por artículo y cantidad."}
</div>
        </div>

        <div className={`invProModal__badge ${movementType === "IN" ? "isIn" : "isOut"}`}>
          {movementType === "IN" ? "Entrada" : "Salida"}
        </div>
      </div>

      <div className="invProModal__grid">
        <div className="invProModal__left">
          <div className="invProCard">
            <div className="invProCard__title">
              <TbListDetails /> Datos generales
            </div>

            <div className="invProFormGrid">
              <div className="invField">
                <label>Tipo de movimiento</label>
                <ProSelect value={movementType} onChange={() => {}} ariaLabel="tipo-movimiento">
                  <option value={movementType}>
                    {movementType === "IN" ? "Entrada de inventario" : "Salida de inventario"}
                  </option>
                </ProSelect>
              </div>

              <div className="invField">
                <label>Responsable</label>
                <input
                  value={currentWorker?.full_name || currentWorker?.username || ""}
                  readOnly
                  placeholder="Usuario actual"
                />
              </div>

              <div className="invField invSpan2">
                <label>Motivo *</label>
                <input
                  value={movementReason}
                  onChange={(e) => {
                    setMovementDirty(true);
                    setMovementReason(toTitleCaseLive(e.target.value));
                  }}
                  placeholder={
                    movementType === "IN"
                      ? "Ej: Compra de material, ajuste positivo, devolución..."
                      : "Ej: Salida de material, merma, consumo interno..."
                  }
                />
              </div>
            </div>
          </div>

          <div className="invProCard">
            <div className="invProCard__title">
              <TbPackage /> Partidas del movimiento
            </div>

<div className="invProItems">
<div className="invProItems__head">
  <div>Producto</div>
  <div className="c">Cantidad</div>
  <div className="c">Estado</div>
  <div className="c">Quitar</div>
</div>

              {movementModalTotals.items.map((row, i) => {
                return (
                  <div className="invProItems__row" key={i}>
                    <div>
<ProSelect
  value={row.product_id || ""}
  onChange={(e) => updateMovementRow(i, "product_id", e.target.value)}
  ariaLabel={`producto-${i}`}
  placeholder="Selecciona producto…"
>
  <option value="">Selecciona…</option>
  {products.map((p) => (
    <option
      key={p.id}
      value={p.id}
      label={`${String(p.name || "").trim() || "Producto sin nombre"}${p.sku ? ` · ${p.sku}` : ""}`}
    >
      {String(p.name || "").trim() || "Producto sin nombre"}{p.sku ? ` · ${p.sku}` : ""}
    </option>
  ))}
</ProSelect>
                    </div>

                    <div>
                      <input
                        className="c"
                        type="number"
                        min="1"
                        value={row.qty}
                        onChange={(e) => updateMovementRow(i, "qty", e.target.value)}
                        placeholder="0"
                      />
                    </div>

                    <div className="invProLineTotal">
                      {row.product_id ? "Listo" : "—"}
                    </div>

                    <div className="c">
<button
  type="button"
  className="invIconTrashBtn"
  onClick={() => removeMovementRow(i)}
  title="Quitar partida"
  aria-label="Quitar partida"
>
  <TbTrash />
</button>
                    </div>
                  </div>
                );
              })}

              <button className="invBtn invGhost invAddRowBtn" type="button" onClick={addMovementRow}>
                <TbPlus /> Agregar producto
              </button>
            </div>
          </div>
        </div>

        <aside className="invProModal__right">
          <div className="invProSummary">
            <div className="invProSummary__title">Resumen del movimiento</div>

            <div className="invProSummary__media">
              <div className={`invProSummary__mediaIcon ${movementType === "IN" ? "isIn" : "isOut"}`}>
                {movementType === "IN" ? <TbArrowBigUpLines /> : <TbArrowBigDownLines />}
              </div>
            </div>

            <div className="invProSummary__list">
              <div className="invProSummary__item">
                <span>Tipo</span>
                <b>{movementType === "IN" ? "Entrada" : "Salida"}</b>
              </div>

              <div className="invProSummary__item">
                <span>Responsable</span>
                <b>{currentWorker?.full_name || currentWorker?.username || "Usuario actual"}</b>
              </div>

              <div className="invProSummary__item">
                <span>Partidas</span>
                <b>{movementModalTotals.totalLines}</b>
              </div>

              <div className="invProSummary__item">
                <span>Unidades</span>
                <b>{movementModalTotals.totalQty}</b>
              </div>

              <div className="invProSummary__item">
                <span>Motivo</span>
                <b>{movementReason?.trim() || "Sin capturar"}</b>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>

    <div className="invProModal__footer">
      <button className="invBtn invGhost" type="button" onClick={requestCloseMovementModal}>
        Cancelar
      </button>

      <button
        className={`invBtn ${movementType === "IN" ? "invIn" : "invOut"}`}
        type="button"
        onClick={saveMovement}
      >
        {movementType === "IN" ? "Guardar entrada" : "Guardar salida"}
      </button>
    </div>
  </div>
</Modal>
<Modal
  open={stockDetailOpen}
  title="Resumen de movimientos"
  onClose={() => setStockDetailOpen(false)}
  onRequestClose={() => setStockDetailOpen(false)}
>
  <div className="invModalSheet">
    <div className="invModalSection">
      <div className="invStockLedgerHead">
        <div className="invStockLedgerHead__main">
          <div className="invStockLedgerHead__title">
            {selectedStockProduct?.name || "Producto"}
          </div>

          <div className="invStockLedgerHead__meta">
            <span className="invSkuPill">{selectedStockProduct?.sku || "-"}</span>

            <span
              className={`invStockPill ${
                Number(selectedStockProduct?.stock || 0) <=
                Number(selectedStockProduct?.stock_min || 0)
                  ? "low"
                  : ""
              }`}
            >
              Stock actual: {Number(selectedStockProduct?.stock || 0)}
            </span>

            <span className="invMiniBadge">
              Mínimo: {Number(selectedStockProduct?.stock_min || 0)}
            </span>

            <span className="invMiniBadge">
              Movimientos: {stockMovementRows.length}
            </span>
          </div>
        </div>
      </div>

      <div className="invStockLedgerWrap">
        {stockDetailLoading ? (
          <div className="invEmpty">Cargando movimientos…</div>
        ) : stockMovementRows.length === 0 ? (
          <InventoryEmptyState
            icon={<TbListDetails />}
            title="Sin movimientos registrados"
            subtitle="Este producto todavía no tiene entradas ni salidas asociadas."
          />
        ) : (
<div className="invStockLedgerWrap">
  <div className="invStockLedger">
<div className="invStockLedger__head">
  <div className="c">Tipo</div>
  <div className="c">Fecha</div>
  <div className="c">Responsable</div>
  <div className="c">Motivo</div>
  <div className="c">Cantidad</div>
  <div className="c">Estado</div>
  <div className="c">Acciones</div>
</div>

<div className="invStockLedger__body">
  {stockMovementRows.map((m, index) => {
    const ui = stockMovementUI(m);
    const who = m.actor_full_name || m.actor_username || "Usuario";
    const when = formatActivityDate(m.movement_created_at || m.created_at);
    const reason = m.movement_reason || m.reason || "Sin motivo";
    const roleText = m.actor_department || m.actor_username || "—";

    return (
      <div
        key={m.item_id || m.movement_id || index}
        className={`invStockLedgerRow tone-${ui.tone}`}
      >
        <div className="invStockLedgerCell invStockLedgerCell--type c">
          <span className={`invStockLedgerTypeBadge ${ui.tone}`}>
            <span className="invStockLedgerTypeIcon">{ui.icon}</span>
            <span>{ui.title}</span>
          </span>
        </div>

        <div className="invStockLedgerCell c">
          <div className="invStockLedgerMain">{when}</div>
        </div>

        <div className="invStockLedgerCell c">
          <div className="invStockLedgerUser">
            {m.actor_profile_photo_url ? (
              <img
                src={m.actor_profile_photo_url}
                alt={who}
                className="invStockLedgerUser__avatar"
              />
            ) : (
              <div className="invStockLedgerUser__avatar ph">
                <TbUserCircle />
              </div>
            )}

            <div className="invStockLedgerUser__text">
              <div className="invStockLedgerMain">{who}</div>
              <div className="invStockLedgerSub">{roleText}</div>
            </div>
          </div>
        </div>

        <div className="invStockLedgerCell c">
          <div className="invStockLedgerReason" title={reason}>
            {reason}
          </div>
        </div>

        <div className="invStockLedgerCell c">
          <span className={`invStockImpact ${ui.tone}`}>{ui.impact}</span>
        </div>

        <div className="invStockLedgerCell c">
          <span className="invSoftMetric">Registrado</span>
        </div>

        <div className="invStockLedgerCell c">
          <div className="invRowActions invRowActionsPro invRowActionsLedger">
            <button
              type="button"
              className="invActBtn view"
              title="Ver detalle"
              onClick={() => openMovementPreview(m)}
            >
              <TbEye />
            </button>

            <button
              type="button"
              className="invActBtn edit"
              title="Editar movimiento"
              onClick={() => editStockMovementItem(m)}
            >
              <TbEdit />
            </button>

            <button
              type="button"
              className="invActBtn del"
              title="Eliminar movimiento"
              onClick={() => deleteStockMovementItem(m)}
            >
              <TbTrash />
            </button>
          </div>
        </div>
      </div>
    );
  })}
</div>
    </div>
          </div>
        )}
      </div>
    </div>
    
  </div>
</Modal>

<Modal
  open={movementEditOpen}
  title="Editar movimiento"
  onClose={closeMovementEditModal}
  onRequestClose={closeMovementEditModal}
  modalClassName="invModal--fit invModal--proForm invModal--movementEdit"
  bodyClassName="invModalBody--proForm"
>
  <div className="invProModal invProModal--editMovement">
    <div className="invProModal__main">
      <div className="invProModal__header">
        <div>
          <div className="invProModal__title">Editar movimiento</div>
          <div className="invProModal__subtitle">
            Ajusta la cantidad y el motivo del registro seleccionado.
          </div>
        </div>

        <div
          className={`invProModal__badge ${
            String(editingMovementItem?.movement_type || editingMovementItem?.type || "").toUpperCase() === "IN"
              ? "isIn"
              : "isOut"
          }`}
        >
          {String(editingMovementItem?.movement_type || editingMovementItem?.type || "").toUpperCase() === "IN"
            ? "Entrada"
            : "Salida"}
        </div>
      </div>

      <div className="invProModal__grid invProModal__grid--editMovement">
        <div className="invProModal__left">
          <div className="invProCard">
            <div className="invProCard__title">
              <TbEdit /> Ajustes del movimiento
            </div>

            <div className="invProFormGrid invProFormGrid--1">
              <div className="invField">
                <label>Cantidad</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={movementEditDraft.qty}
                  onChange={(e) =>
                    setMovementEditDraft((prev) => ({
                      ...prev,
                      qty: e.target.value,
                    }))
                  }
                  placeholder="Cantidad"
                />
              </div>

              <div className="invField invSpan2">
                <label>Motivo</label>
                <input
                  type="text"
                  value={movementEditDraft.reason}
                  onChange={(e) =>
                    setMovementEditDraft((prev) => ({
                      ...prev,
                      reason: e.target.value,
                    }))
                  }
                  placeholder="Describe el motivo del movimiento"
                />
              </div>
            </div>
          </div>
        </div>

        <aside className="invProModal__right">
          <div className="invProSummary">
            <div className="invProSummary__title">Resumen del ajuste</div>

            <div className="invProSummary__media">
              <div
                className={`invProSummary__mediaIcon ${
                  String(editingMovementItem?.movement_type || editingMovementItem?.type || "").toUpperCase() === "IN"
                    ? "isIn"
                    : "isOut"
                }`}
              >
                {String(editingMovementItem?.movement_type || editingMovementItem?.type || "").toUpperCase() === "IN" ? (
                  <TbArrowBigUpLines />
                ) : (
                  <TbArrowBigDownLines />
                )}
              </div>
            </div>

            <div className="invProSummary__list">
              <div className="invProSummary__item">
                <span>Producto</span>
                <b>{selectedStockProduct?.name || "Producto"}</b>
              </div>

              <div className="invProSummary__item">
                <span>SKU</span>
                <b>{selectedStockProduct?.sku || "Sin SKU"}</b>
              </div>

              <div className="invProSummary__item">
                <span>Tipo</span>
                <b>
                  {String(editingMovementItem?.movement_type || editingMovementItem?.type || "").toUpperCase() === "IN"
                    ? "Entrada"
                    : "Salida"}
                </b>
              </div>

              <div className="invProSummary__item">
                <span>Nueva cantidad</span>
                <b>{Number(movementEditDraft.qty || 0)}</b>
              </div>

              <div className="invProSummary__item">
                <span>Motivo</span>
                <b>{String(movementEditDraft.reason || "").trim() || "Sin motivo"}</b>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>

    <div className="invProModal__footer">
      <button className="invBtn invGhost" type="button" onClick={closeMovementEditModal}>
        Cancelar
      </button>

      <button className="invBtn invPrimary" type="button" onClick={saveEditedStockMovementItem}>
        Guardar cambios
      </button>
    </div>
  </div>
</Modal>

<Modal
  open={movementPreviewOpen}
  title="Detalle del movimiento"
  onClose={() => setMovementPreviewOpen(false)}
  onRequestClose={() => setMovementPreviewOpen(false)}
  modalClassName="invModal--fit invModal--movementPreview"
  bodyClassName="invModalBody--movementPreview"
>
  <div className="invModalSheet invModalSheet--movementPreview">
    <div className="invModalSection invModalSectionPreview invModalSectionPreview--movement">
      {!movementPreview ? (
        <InventoryEmptyState
          compact
          icon={<TbEye />}
          title="Sin movimiento seleccionado"
          subtitle="Selecciona un registro del historial para ver su detalle."
        />
      ) : (
        <>
          <div className="invMovePreviewBackRow">
            <button
              className="invBtn invGhost invMovePreviewBackBtn"
              type="button"
              onClick={() => setMovementPreviewOpen(false)}
            >
              <TbArrowLeft /> Volver al resumen
            </button>
          </div>

          <div className="invMovePreviewHero">
            <div className="invMovePreviewHero__left">
              <div className={`invMovePreviewHero__icon ${movementPreview.ui.tone}`}>
                {movementPreview.ui.icon}
              </div>

              <div className="invMovePreviewHero__copy">
                <div className="invMovePreviewHero__eyebrow">
                  {movementPreview.operationLabel}
                </div>
                <div className="invMovePreviewHero__title">
                  {selectedStockProduct?.name || "Producto"}
                </div>
                <div className="invMovePreviewHero__sub">
                  {movementPreview.when}
                </div>
              </div>
            </div>

            <div className="invMovePreviewHero__right">
              <span className="invSkuPill">{selectedStockProduct?.sku || "-"}</span>
              <span className={`invStockImpact ${movementPreview.ui.tone}`}>
                {movementPreview.ui.impact}
              </span>
            </div>
          </div>

<div className="invMovePreviewKpis">
  <div className="invMovePreviewKpi">
    <span className="k">Responsable</span>
    <span className="v">{movementPreview.who}</span>
    <span className="s">
      {movementPreview.username || "—"} {movementPreview.department ? `· ${movementPreview.department}` : ""}
    </span>
  </div>

  <div className="invMovePreviewKpi">
    <span className="k">Cantidad</span>
    <span className="v">{movementPreview.qty}</span>
    <span className="s">Unidades afectadas</span>
  </div>

  <div className="invMovePreviewKpi">
    <span className="k">Tipo</span>
    <span className="v">{movementPreview.operationLabel}</span>
    <span className="s">Clasificación del movimiento</span>
  </div>

  <div className="invMovePreviewKpi">
    <span className="k">Fecha</span>
    <span className="v">{movementPreview.when}</span>
    <span className="s">Momento del registro</span>
  </div>

  <div className="invMovePreviewKpi">
    <span className="k">Stock actual</span>
    <span className="v">{movementPreview.currentStock}</span>
    <span className="s">Existencia actual</span>
  </div>

  <div className="invMovePreviewKpi">
    <span className="k">Stock mínimo</span>
    <span className="v">{movementPreview.stockMin}</span>
    <span className="s">Umbral configurado</span>
  </div>
</div>

          <div className="invMovePreviewReasonBox">
            <div className="invMovePreviewReasonBox__label">Motivo del movimiento</div>
            <div className="invMovePreviewReasonBox__text">{movementPreview.reason}</div>
          </div>

          <div className="invMovePreviewCharts invMovePreviewCharts--compact">
            <div className="invMovePreviewChartCard">
              <div className="invMovePreviewChartTitle">
                <TbChartBar /> Relación del movimiento con stock actual
              </div>
              <div className="invMovePreviewChartWrap invMovePreviewChartWrap--compact">
                <ReactECharts
                  option={movementPreview.stockRelationOption}
                  style={{ height: "100%", width: "100%" }}
                  notMerge
                />
              </div>
            </div>

            <div className="invMovePreviewChartCard">
              <div className="invMovePreviewChartTitle">
                <TbArrowsUpDown /> Impacto relativo
              </div>
              <div className="invMovePreviewChartWrap invMovePreviewChartWrap--compact">
                <ReactECharts
                  option={movementPreview.impactDonutOption}
                  style={{ height: "100%", width: "100%" }}
                  notMerge
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  </div>
</Modal>
        </>
      )}

    </div>
  );
}