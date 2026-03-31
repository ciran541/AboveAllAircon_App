"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type InventoryItem = {
  id: string;
  name: string;
  unit: string;
  stock_quantity: number;
  description?: string;
  unit_cost?: number;
  unit_price?: number;
  min_stock_level?: number;
  category?: string;
};

// ─── SVG Icons ─────────────────────────────────────────────────────────────
function IconBox() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
      <line x1="12" y1="22.08" x2="12" y2="12"></line>
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
    </svg>
  );
}

function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ─── Modal Component ───────────────────────────────────────────────────────
function ItemModal({
  item,
  onClose,
  onSaved,
}: {
  item: InventoryItem | null;
  onClose: () => void;
  onSaved: (item: InventoryItem) => void;
}) {
  const isNew = !item;
  const [name, setName] = useState(item?.name || "");
  const [unit, setUnit] = useState(item?.unit || "pcs");
  const [description, setDescription] = useState(item?.description || "");
  const [category, setCategory] = useState(item?.category || "General");
  const [unitCost, setUnitCost] = useState(item?.unit_cost?.toString() || "0");
  const [unitPrice, setUnitPrice] = useState(item?.unit_price?.toString() || "0");
  const [minStock, setMinStock] = useState(item?.min_stock_level?.toString() || "5");
  const [stockQuantity, setStockQuantity] = useState(
    item?.stock_quantity?.toString() || "0"
  );
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const diff = parseInt(stockQuantity || "0") - (item?.stock_quantity || 0);
  const showReason = !isNew;

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const qty = parseInt(stockQuantity);
    const cost = parseFloat(unitCost);
    const price = parseFloat(unitPrice);
    const minLev = parseInt(minStock);

    if (isNaN(qty) || qty < 0) {
      setError("Quantity must be a valid number >= 0");
      setLoading(false);
      return;
    }

    if (showReason && diff !== 0 && !reason) {
      setError("Please provide a reason for the stock adjustment.");
      setLoading(false);
      return;
    }

    const payload = { 
      name, 
      unit, 
      stock_quantity: qty, 
      description, 
      category, 
      unit_cost: cost, 
      unit_price: price, 
      min_stock_level: minLev 
    };

    if (isNew) {
      const { data, error } = await supabase
        .from("inventory_items")
        .insert([payload])
        .select()
        .single();

      if (error) {
        setError(error.message);
      } else {
        await supabase.from("inventory_logs").insert([{
          item_id: data.id,
          change_amount: qty,
          reason: "Initial Stock / New Item",
        }]);
        onSaved({ ...data });
      }
    } else {
      const { data, error } = await supabase
        .from("inventory_items")
        .update(payload)
        .eq("id", item.id)
        .select()
        .single();

      if (error) {
        setError(error.message);
      } else {
        if (diff !== 0) {
          await supabase.from("inventory_logs").insert([{
            item_id: item.id,
            change_amount: diff,
            reason: reason,
          }]);
        }
        onSaved({ ...data });
      }
    }

    setLoading(false);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17,24,39,0.45)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "100%",
          maxWidth: 420,
          boxShadow:
            "0 20px 25px -5px rgba(0,0,0,0.12), 0 10px 10px -5px rgba(0,0,0,0.05)",
          padding: 28,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 22,
          }}
        >
          <div>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#111827",
                letterSpacing: "-0.3px",
              }}
            >
              {isNew ? "Add New Item" : "Edit Item"}
            </h2>
            <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 3 }}>
              Manage inventory details tracking.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              background: "none",
              border: "1px solid #e4e9f0",
              borderRadius: 8,
              color: "#9ca3af",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <IconX />
          </button>
        </div>

        {error && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              marginBottom: 16,
              background: "#fef2f2",
              border: "1px solid rgba(220,38,38,0.25)",
              borderRadius: 8,
              color: "#dc2626",
              fontSize: 13,
            }}
          >
            <span>⚠</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: "block",
                fontSize: 12.5,
                fontWeight: 600,
                color: "#4b5563",
                marginBottom: 6,
              }}
            >
              Item Name
            </label>
            <input
              className="form-input"
              required
              placeholder="e.g. Copper Pipe (3/8&#34;)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#4b5563", marginBottom: 6 }}>
              Item Category
            </label>
            <select
              className="form-input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="General">General</option>
              <option value="Spare Parts">Spare Parts</option>
              <option value="Consumables">Consumables</option>
              <option value="Tools">Tools</option>
              <option value="Gas / Refrigerant">Gas / Refrigerant</option>
            </select>
          </div>

          <div style={{ marginBottom: 14 }}>
             <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#4b5563", marginBottom: 6 }}>Description</label>
             <textarea 
               className="form-input" 
               rows={2} 
               placeholder="Optional details..." 
               value={description}
               onChange={(e) => setDescription(e.target.value)}
             />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#4b5563", marginBottom: 6 }}>Unit Cost ($)</label>
              <input type="number" step="0.01" className="form-input" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#4b5563", marginBottom: 6 }}>Unit Price ($)</label>
              <input type="number" step="0.01" className="form-input" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "#4b5563",
                  marginBottom: 6,
                }}
              >
                Unit
              </label>
              <input
                className="form-input"
                required
                placeholder="pcs, meters, rolls..."
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#4b5563", marginBottom: 6 }}>
                Stock / Min Threshold
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="number"
                  min="0"
                  className="form-input"
                  required
                  value={stockQuantity}
                  onChange={(e) => setStockQuantity(e.target.value)}
                />
                <input
                  type="number"
                  min="0"
                  className="form-input"
                  title="Minimum Stock Level for alerts"
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value)}
                  style={{ width: "70px" }}
                />
              </div>
            </div>
          </div>

          {showReason && (
             <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#4b5563", marginBottom: 6 }}>
                  Reason for Adjustment <span style={{ color: "#ef4444" }}>*</span>
                  {diff === 0 && <span style={{ color: "#9ca3af", fontWeight: 400, marginLeft: 6 }}>(Change quantity to unlock)</span>}
                </label>
                <select
                  className="form-input"
                  required={diff !== 0}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={diff === 0}
                >
                   <option value="">Select reason...</option>
                   {diff > 0 ? (
                      <>
                         <option value="Restock / Purchase">Restock / Purchase</option>
                         <option value="Inventory Correction (Found)">Inventory Correction (Found)</option>
                         <option value="Returned Item">Returned Item</option>
                      </>
                   ) : (
                      <>
                         <option value="Damaged Item">Damaged Item</option>
                         <option value="Inventory Correction (Lost)">Inventory Correction (Lost)</option>
                         <option value="Used Internally">Used Internally</option>
                      </>
                   )}
                   <option value="Other Adjustment">Other / Manual Adjustment</option>
                </select>
             </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              paddingTop: 18,
              borderTop: "1px solid #e4e9f0",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: "9px 18px",
                background: "#fff",
                border: "1.5px solid #e4e9f0",
                borderRadius: 8,
                fontSize: 13.5,
                fontWeight: 500,
                color: "#374151",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "9px 20px",
                background: loading ? "#93c5fd" : "#2563eb",
                border: "none",
                borderRadius: 8,
                fontSize: 13.5,
                fontWeight: 600,
                color: "#fff",
                cursor: loading ? "not-allowed" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {loading ? "Saving..." : isNew ? "Add Item" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Client Page ──────────────────────────────────────────────────────
export default function InventoryClient({
  initialItems,
  initialLogs,
}: {
  initialItems: InventoryItem[];
  initialLogs: any[];
}) {
  const [items, setItems] = useState<InventoryItem[]>(initialItems);
  const [logs] = useState<any[]>(initialLogs);
  const [modalItem, setModalItem] = useState<InventoryItem | null | undefined>(
    undefined
  );
  const [filterCategory, setFilterCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const handleSaved = (savedItem: InventoryItem) => {
    setItems((prev) => {
      const exists = prev.find((i) => i.id === savedItem.id);
      if (exists) {
        return prev.map((i) => (i.id === savedItem.id ? savedItem : i));
      } else {
        return [...prev, savedItem].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
      }
    });
    setModalItem(undefined);
  };

  const filteredItems = items.filter(item => {
    const matchesCategory = filterCategory === "All" || item.category === filterCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const lowStockItems = items.filter((i) => i.stock_quantity <= (i.min_stock_level || 5));
  const totalValue = items.reduce((sum, i) => sum + (Number(i.stock_quantity) * Number(i.unit_cost || 0)), 0);
  const potentialRevenue = items.reduce((sum, i) => sum + (Number(i.stock_quantity) * Number(i.unit_price || 0)), 0);

  return (
    <>
      <div
        style={{
          padding: "20px 28px",
          borderBottom: "1px solid #e4e9f0",
          background: "#fff",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 40,
                height: 40,
                background: "#eff6ff",
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#2563eb",
                flexShrink: 0,
              }}
            >
              <IconBox />
            </div>
            <div>
              <h1
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: "#0f172a",
                  letterSpacing: "-0.5px",
                  margin: 0,
                }}
              >
                Inventory Intelligence
              </h1>
              <p style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
                Real-time stock management and financial oversight
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
             <div style={{ position: "relative" }}>
                <input 
                  placeholder="Search items..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ padding: "9px 12px 9px 36px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13.5, width: 220, outline: "none" }}
                />
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}>🔍</span>
             </div>
             <select 
               value={filterCategory}
               onChange={(e) => setFilterCategory(e.target.value)}
               style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13.5, background: "#fff", outline: "none" }}
             >
                <option value="All">All Categories</option>
                <option value="General">General</option>
                <option value="Spare Parts">Spare Parts</option>
                <option value="Consumables">Consumables</option>
                <option value="Tools">Tools</option>
                <option value="Gas / Refrigerant">Gas / Refrigerant</option>
             </select>
             <button
              onClick={() => setModalItem(null)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "9px 18px",
                background: "#0f172a",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 13.5,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)",
              }}
            >
              <IconPlus />
              New Item
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
           <div style={{ background: "#fff", padding: "16px", borderRadius: 12, border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Inventory Value</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
           </div>
           <div style={{ background: "#fff", padding: "16px", borderRadius: 12, border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Potential Revenue</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: "#10b981" }}>${potentialRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
           </div>
           <div style={{ background: "#fff", padding: "16px", borderRadius: 12, border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Unique Items</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{items.length}</span>
           </div>
           <div style={{ background: lowStockItems.length > 0 ? "#fff7ed" : "#f0fdf4", padding: "16px", borderRadius: 12, border: lowStockItems.length > 0 ? "1px solid #fdba74" : "1px solid #bbf7d0", display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: lowStockItems.length > 0 ? "#ea580c" : "#16a34a", textTransform: "uppercase", letterSpacing: "0.5px" }}>Low Stock Alerts</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                 <span style={{ fontSize: 20, fontWeight: 800, color: lowStockItems.length > 0 ? "#ea580c" : "#16a34a" }}>{lowStockItems.length}</span>
                 {lowStockItems.length === 0 && <IconCheck />}
              </div>
           </div>
        </div>
      </div>

      <div style={{ padding: "24px 28px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }}>
          {/* Table */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #e4e9f0",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.5fr 1fr 0.8fr 0.8fr 0.8fr 80px",
                gap: 12,
                padding: "12px 20px",
                background: "#f8fafc",
                borderBottom: "1px solid #e4e9f0",
              }}
            >
              {["Item Name", "Category", "Unit", "Price", "Stock", "Action"].map((h) => (
                <div
                  key={h}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#94a3b8",
                    textTransform: "uppercase",
                    letterSpacing: "0.8px",
                    textAlign: h === "Stock" || h === "Action" || h === "Price" ? "right" : "left",
                  }}
                >
                  {h}
                </div>
              ))}
            </div>

            {filteredItems.length === 0 && (
              <div style={{ padding: "48px 24px", textAlign: "center", color: "#9ca3af" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
                <div style={{ fontSize: 13 }}>No items match your current filters.</div>
              </div>
            )}

            {filteredItems.map((item, i) => {
              const isLow = item.stock_quantity <= (item.min_stock_level || 5);
              return (
                <div
                  key={item.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.5fr 1fr 0.8fr 0.8fr 0.8fr 80px",
                    gap: 12,
                    padding: "14px 20px",
                    borderBottom: i < filteredItems.length - 1 ? "1px solid #f1f5f9" : "none",
                    alignItems: "center",
                    background: i % 2 === 1 ? "#fafbfc" : "#fff",
                    transition: "background 0.12s",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1e293b" }}>{item.name}</div>
                    {item.description && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.description}</div>}
                  </div>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, background: "#f1f5f9", color: "#64748b", padding: "2px 8px", borderRadius: 6, textTransform: "uppercase" }}>{item.category || "General"}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "#64748b" }}>{item.unit}</div>
                  <div style={{ textAlign: "right", fontSize: 13, fontWeight: 600, color: "#0f172a" }}>${Number(item.unit_price || 0).toFixed(2)}</div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ 
                      display: "inline-block", padding: "2px 8px", borderRadius: 99, fontSize: 12, fontWeight: 800, 
                      background: isLow ? "#fff7ed" : "#f0fdf4", 
                      color: isLow ? "#ea580c" : "#16a34a", 
                      border: isLow ? "1px solid #fdba74" : "1px solid #bbf7d0" 
                    }}>
                      {item.stock_quantity}
                    </span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <button onClick={() => setModalItem(item)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 4 }} title="Edit Item"><IconEdit /></button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Activity Log */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", maxHeight: "600px" }}>
            <div style={{ padding: "16px 20px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.5px" }}>Audit Ledger</span>
              <span style={{ fontSize: 10, background: "#10b981", color: "#fff", padding: "2px 6px", borderRadius: 4, fontWeight: 800 }}>SYNCED</span>
            </div>
            <div style={{ padding: "0", display: "flex", flexDirection: "column", overflowY: "auto" }}>
              {logs.length === 0 ? (
                 <div style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: "40px 20px" }}>No recent movements</div>
              ) : (
                logs.map((log, idx) => (
                  <div key={log.id} style={{ 
                    display: "flex", gap: 14, padding: "16px 20px", 
                    borderBottom: idx < logs.length - 1 ? "1px solid #f1f5f9" : "none",
                    background: idx % 2 === 0 ? "#fff" : "#fafbfc"
                  }}>
                    <div style={{ 
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: log.change_amount > 0 ? "#ecfdf5" : "#fef2f2",
                      color: log.change_amount > 0 ? "#10b981" : "#ef4444",
                      fontSize: 14, fontWeight: 800
                    }}>
                      {log.change_amount > 0 ? "+" : ""}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1e293b" }}>
                          {log.inventory_items?.name}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: log.change_amount > 0 ? "#059669" : "#dc2626" }}>
                          {Math.abs(log.change_amount)} {log.inventory_items?.unit}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2, lineHeight: 1.4 }}>
                        {log.reason} {log.jobs?.customers?.name ? <span style={{ color: "#3b82f6", fontWeight: 600 }}>• {log.jobs.customers.name}</span> : ""}
                      </div>
                      <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 6, fontWeight: 500 }}>
                        {new Date(log.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div style={{ padding: "12px", textAlign: "center", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
               <button style={{ background: "none", border: "none", color: "#64748b", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>View Full History</button>
            </div>
          </div>
        </div>
      </div>

      {modalItem !== undefined && (
        <ItemModal
          item={modalItem}
          onClose={() => setModalItem(undefined)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
