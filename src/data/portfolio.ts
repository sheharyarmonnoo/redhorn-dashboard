// Portfolio context — which property is currently selected.
// Persisted to localStorage. All pages read this to decide what data to show.

const PORTFOLIO_KEY = "redhorn_active_property";

export interface Property {
  id: string;
  name: string;
  location: string;
  sqft: string;
  hasData: boolean;
}

export const properties: Property[] = [
  { id: "hollister", name: "Hollister Business Park", location: "Houston, TX", sqft: "~325K SF", hasData: true },
  { id: "rv-ohio", name: "RV Park — Ohio", location: "Ohio", sqft: "~40 lots", hasData: false },
];

export function getActiveProperty(): string {
  if (typeof window === "undefined") return "hollister";
  return localStorage.getItem(PORTFOLIO_KEY) || "hollister";
}

export function setActiveProperty(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PORTFOLIO_KEY, id);
  window.dispatchEvent(new CustomEvent("portfolio-changed", { detail: { id } }));
}
