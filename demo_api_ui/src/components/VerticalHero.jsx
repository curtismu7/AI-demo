import React from "react";
import { useTheme } from "../context/ThemeContext";

function formatValue(value, format) {
  if (value === null || value === undefined) return "—";
  switch (format) {
    case "money":
      return "$" + Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "count":
      return String(Math.round(Number(value)));
    case "date":
      return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    case "tier": {
      const tier = String(value).toLowerCase();
      const color = tier === "gold" ? "#b45309" : tier === "silver" ? "#6b7280" : "#92400e";
      return <span style={{ color, fontWeight: 700 }}>{value}</span>;
    }
    case "text":
    default:
      return String(value);
  }
}

function resolveValue(dataKey, heroStats) {
  if (!heroStats) return undefined;
  const key = dataKey.startsWith("heroStats.") ? dataKey.slice("heroStats.".length) : dataKey;
  return heroStats[key];
}

export default function VerticalHero() {
  const { dashboard } = useTheme();
  if (!dashboard?.hero?.cards) return null;

  const heroStats = dashboard.mockData?.heroStats || {};

  return (
    <div className="vertical-hero">
      {dashboard.hero.cards.map((card) => (
        <div key={card.dataKey} className="vertical-hero-card">
          <span className="vertical-hero-label">{card.label}</span>
          <span className="vertical-hero-value">
            {formatValue(resolveValue(card.dataKey, heroStats), card.format)}
          </span>
        </div>
      ))}
    </div>
  );
}
