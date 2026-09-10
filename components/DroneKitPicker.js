"use client";

import { useMemo, useState } from "react";
import {
  CATALOG_CATEGORIES,
  MEDICINE_CATALOG,
  getCatalogItem,
} from "@/lib/droneDeliveryData";
import { formatGrams } from "@/lib/droneDeliveryEngine";
import { toBnDigits } from "@/lib/campsData";

// Catalogue browser + cart for the /drone compose phase.
//
// GUARDRAIL: only `otc: true` items are ever rendered here. Prescription-only
// medicines (antibiotics, inhalers) exist in the catalogue so that a scanned
// prescription can carry them, but they must never be orderable by someone
// browsing a list. This filter is the first of two defences — the second is in
// validateDroneOrder(), which the API route re-runs server-side.
const OTC_CATALOG = MEDICINE_CATALOG.filter((m) => m.otc);

export default function DroneKitPicker({ lang = "en", cart = [], onChange }) {
  const bn = lang === "bn";
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return OTC_CATALOG.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (!q) return true;
      return [item.name, item.nameBn, item.generic, ...item.brandExamples]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q));
    });
  }, [category, query]);

  const qtyOf = (id) => cart.find((line) => line.itemId === id)?.qty || 0;

  const setQty = (item, qty) => {
    const next = Math.max(0, Math.min(qty, item.maxQty));
    const without = cart.filter((line) => line.itemId !== item.id);
    if (next === 0) {
      onChange(without);
      return;
    }
    const existing = cart.find((line) => line.itemId === item.id);
    onChange([
      ...without,
      {
        itemId: item.id,
        name: item.name,
        nameBn: item.nameBn,
        qty: next,
        weightG: item.weightG,
        requiresRx: false,
        source: existing?.source || "manual",
        rxText: existing?.rxText || null,
        unavailable: false,
      },
    ]);
  };

  return (
    <div className="drn-catalog" id="drone-catalog">
      <input
        className="drn-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={bn ? "ওষুধ খুঁজুন..." : "Search medicines..."}
        aria-label={bn ? "ওষুধ খুঁজুন" : "Search medicines"}
      />

      <div className="drn-cat-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={category === "all"}
          className={`drn-cat-tab ${category === "all" ? "drn-cat-tab--active" : ""}`}
          onClick={() => setCategory("all")}
        >
          🧾 {bn ? "সব" : "All"}
        </button>
        {CATALOG_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={category === cat.id}
            className={`drn-cat-tab ${category === cat.id ? "drn-cat-tab--active" : ""}`}
            onClick={() => setCategory(cat.id)}
          >
            {cat.icon} {bn ? cat.labelBn : cat.label}
          </button>
        ))}
      </div>

      <div className="drn-item-list">
        {visible.map((item) => {
          const qty = qtyOf(item.id);
          return (
            <div
              key={item.id}
              className={`drn-item ${qty > 0 ? "drn-item--selected" : ""}`}
              id={`drone-item-${item.id}`}
            >
              <div>
                <div className="drn-item__name">{bn ? item.nameBn : item.name}</div>
                <div className="drn-item__bn">{bn ? item.name : item.nameBn}</div>
                <div className="drn-item__use">{bn ? item.useBn : item.useEn}</div>
                <div className="drn-item__caution">⚠️ {bn ? item.cautionBn : item.cautionEn}</div>
                <div className="drn-item__meta">
                  {bn ? item.unitLabelBn : item.unitLabel} · {formatGrams(item.weightG, lang)}
                </div>
              </div>

              <div className="drn-item__actions">
                {qty > 0 ? (
                  <div className="drn-qty">
                    <button
                      type="button"
                      className="drn-qty__btn"
                      onClick={() => setQty(item, qty - 1)}
                      aria-label={bn ? "কমান" : "Decrease quantity"}
                    >
                      −
                    </button>
                    <span className="drn-qty__value">{bn ? toBnDigits(qty) : qty}</span>
                    <button
                      type="button"
                      className="drn-qty__btn"
                      onClick={() => setQty(item, qty + 1)}
                      disabled={qty >= item.maxQty}
                      aria-label={bn ? "বাড়ান" : "Increase quantity"}
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <button type="button" className="drn-add-btn" onClick={() => setQty(item, 1)}>
                    + {bn ? "যোগ করুন" : "Add"}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {!visible.length && (
          <p className="drn-cart__empty">
            {bn ? "কোনো ওষুধ মেলেনি।" : "No medicines match that search."}
          </p>
        )}
      </div>
    </div>
  );
}

// Cart summary + payload meter. Split out so the compose and confirm phases can
// both render it without duplicating the weight arithmetic.
export function DroneCart({ lang = "en", cart = [], unmatched = [], maxPayloadG, onChange }) {
  const bn = lang === "bn";
  const payloadG = cart.reduce((sum, line) => sum + (line.weightG || 0) * (line.qty || 1), 0);
  const over = payloadG > maxPayloadG;
  const pct = Math.min(100, (payloadG / maxPayloadG) * 100);

  return (
    <div className="drn-cart" id="drone-cart">
      <h3 className="text-heading-sm" style={{ fontSize: "var(--text-body-lg)", marginBottom: "var(--spacing-12)" }}>
        {bn ? "ডেলিভারি ব্যাগ" : "Delivery bag"}
      </h3>

      {cart.length === 0 && (
        <p className="drn-cart__empty">
          {bn ? "এখনো কিছু যোগ করা হয়নি।" : "Nothing added yet."}
        </p>
      )}

      {cart.map((line) => {
        const cat = line.itemId ? getCatalogItem(line.itemId) : null;
        return (
          <div className="drn-cart__row" key={line.itemId || line.rxText}>
            <div>
              <div className="drn-item__name">{bn ? line.nameBn || line.name : line.name}</div>
              {line.requiresRx && (
                <span className="drn-item__rx">
                  🔒 {bn ? "প্রেসক্রিপশন যাচাই হয়েছে" : "Prescription verified from your scan"}
                </span>
              )}
              {cat && (
                <div className="drn-item__meta">{bn ? cat.unitLabelBn : cat.unitLabel}</div>
              )}
            </div>
            <div className="drn-qty__value">
              ×{bn ? toBnDigits(line.qty) : line.qty}
            </div>
            {onChange && (
              <button
                type="button"
                className="drn-remove"
                onClick={() => onChange(cart.filter((l) => l !== line))}
                aria-label={bn ? "সরান" : "Remove"}
              >
                ×
              </button>
            )}
          </div>
        );
      })}

      {/* OCR'd names with no catalogue match. Shown rather than dropped, so the
          user knows exactly what the drone is NOT bringing. */}
      {unmatched.length > 0 && (
        <div className="drn-cart__unmatched">
          <strong>{bn ? "ড্রোন হাবে নেই — স্থানীয়ভাবে সংগ্রহ করুন:" : "Not stocked at drone hubs — please collect locally:"}</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: "18px" }}>
            {unmatched.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={`drn-payload ${over ? "drn-payload--over" : ""}`}>
        <div className="drn-payload__head">
          <span>{bn ? "ওজন" : "Payload"}</span>
          <span>
            {formatGrams(payloadG, lang)} / {formatGrams(maxPayloadG, lang)}
          </span>
        </div>
        <div className="drn-payload__bar">
          <div className="drn-payload__fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
