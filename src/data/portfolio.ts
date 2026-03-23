// Portfolio context — which property is currently selected.
// Persisted to localStorage. All pages read this to decide what data to show.

const PORTFOLIO_KEY = "redhorn_active_property";
const PROPERTIES_KEY = "redhorn_properties";

export interface Property {
  id: string;
  name: string;
  location: string;
  sqft: string;
  hasData: boolean;
}

const seedProperties: Property[] = [
  { id: "hollister", name: "Hollister Business Park", location: "Houston, TX", sqft: "249K SF", hasData: true },
  { id: "beza-bell", name: "Beza Bell Gold Business Park", location: "Houston, TX", sqft: "15.7K SF", hasData: false },
  { id: "rv-ohio", name: "RV Park — Ohio", location: "Ohio", sqft: "~40 lots", hasData: false },
];

export function getProperties(): Property[] {
  if (typeof window === "undefined") return seedProperties;
  try {
    const raw = localStorage.getItem(PROPERTIES_KEY);
    return raw ? JSON.parse(raw) : seedProperties;
  } catch { return seedProperties; }
}

function saveProperties(props: Property[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROPERTIES_KEY, JSON.stringify(props));
  window.dispatchEvent(new Event("portfolio-list-changed"));
}

export function addProperty(name: string, location: string, sqft: string): Property {
  const props = getProperties();
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
  const prop: Property = { id: id || Date.now().toString(), name, location, sqft, hasData: false };
  saveProperties([...props, prop]);
  return prop;
}

export function editProperty(id: string, updates: Partial<Pick<Property, "name" | "location" | "sqft">>) {
  const props = getProperties().map(p => p.id === id ? { ...p, ...updates } : p);
  saveProperties(props);
}

export function deleteProperty(id: string) {
  const props = getProperties().filter(p => p.id !== id);
  saveProperties(props);
  // If deleted property was active, switch to first available
  if (getActiveProperty() === id && props.length > 0) {
    setActiveProperty(props[0].id);
  }
}

// Keep backward compat — export properties as getter
export const properties = seedProperties; // fallback for SSR

export function getActiveProperty(): string {
  if (typeof window === "undefined") return "hollister";
  return localStorage.getItem(PORTFOLIO_KEY) || "hollister";
}

export function setActiveProperty(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PORTFOLIO_KEY, id);
  window.dispatchEvent(new CustomEvent("portfolio-changed", { detail: { id } }));
}
