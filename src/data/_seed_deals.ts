// Deal pipeline — acquisitions tracking to replace Monday.com
// Ori & Max requested this on the demo call (03/19/2026)

export type DealStage = "lead" | "outreach" | "underwriting" | "loi" | "due_diligence" | "closing" | "closed" | "dead";

export interface DealContact {
  name: string;
  role: string;
  email: string;
  phone?: string;
}

export interface DealNote {
  id: string;
  text: string;
  author: string;
  createdAt: string;
}

export interface EmailRecord {
  id: string;
  to: string;
  subject: string;
  body: string;
  sentAt: string;
  sentBy: string;
}

export interface Deal {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  propertyType: string;
  sqft: number;
  units: number;
  askingPrice: number;
  pricePerSF?: number;
  capRate?: number;
  stage: DealStage;
  source: string;
  assignedTo: string;
  contacts: DealContact[];
  notes: DealNote[];
  emails: EmailRecord[];
  createdAt: string;
  updatedAt: string;
  closingDate?: string;
}

const DEALS_KEY = "redhorn_deals";

const seedDeals: Deal[] = [
  {
    id: "deal-1",
    name: "Westheimer Office Complex",
    address: "4500 Westheimer Rd",
    city: "Houston",
    state: "TX",
    propertyType: "Office/Warehouse",
    sqft: 48000,
    units: 12,
    askingPrice: 3200000,
    pricePerSF: 67,
    capRate: 7.8,
    stage: "underwriting",
    source: "Broker — CBRE Houston",
    assignedTo: "Max",
    contacts: [
      { name: "James Rodriguez", role: "Listing Broker", email: "jrodriguez@cbre.com", phone: "713-555-0142" },
      { name: "Karen Mitchell", role: "Seller (Owner)", email: "kmitchell@westheimer-holdings.com" },
    ],
    notes: [
      { id: "n1", text: "Drove by the property — good condition, occupancy looks ~75%. Need to verify utility costs.", author: "Ori", createdAt: "2026-03-15T10:30:00Z" },
      { id: "n2", text: "Called James — seller is motivated, divorce situation. Might take below ask.", author: "Max", createdAt: "2026-03-12T14:20:00Z" },
    ],
    emails: [
      { id: "e1", to: "jrodriguez@cbre.com", subject: "Westheimer Office Complex — Request for T12 & Rent Roll", body: "James,\n\nThank you for sending over the OM on the Westheimer Office Complex. We'd like to move forward with underwriting. Could you please send:\n\n1. Trailing 12-month P&L\n2. Current rent roll\n3. Utility expense breakdown\n\nBest,\nMax Fishman\nRedhorn Capital Partners", sentAt: "2026-03-13T09:00:00Z", sentBy: "Max" },
    ],
    createdAt: "2026-03-10T08:00:00Z",
    updatedAt: "2026-03-15T10:30:00Z",
  },
  {
    id: "deal-2",
    name: "Beltway Industrial Park",
    address: "12200 Beltway 8 S",
    city: "Houston",
    state: "TX",
    propertyType: "Industrial",
    sqft: 85000,
    units: 8,
    askingPrice: 5800000,
    pricePerSF: 68,
    capRate: 7.2,
    stage: "outreach",
    source: "MailChimp Campaign",
    assignedTo: "Max",
    contacts: [
      { name: "David Chen", role: "Owner", email: "dchen@beltway-industrial.com", phone: "281-555-0198" },
    ],
    notes: [
      { id: "n3", text: "Owner responded to MailChimp email — interested in selling in next 6 months. Wants to meet.", author: "Max", createdAt: "2026-03-18T11:00:00Z" },
    ],
    emails: [],
    createdAt: "2026-03-17T08:00:00Z",
    updatedAt: "2026-03-18T11:00:00Z",
  },
  {
    id: "deal-3",
    name: "Cypress Creek Flex Space",
    address: "9800 Cypress Creek Pkwy",
    city: "Houston",
    state: "TX",
    propertyType: "Flex/Office",
    sqft: 32000,
    units: 16,
    askingPrice: 2100000,
    pricePerSF: 66,
    capRate: 8.1,
    stage: "loi",
    source: "Cold Call",
    assignedTo: "Ori",
    contacts: [
      { name: "Patricia Nguyen", role: "Owner", email: "pnguyen@cypressproperties.com", phone: "832-555-0267" },
      { name: "Steve Watson", role: "Property Manager", email: "swatson@landparkpm.com" },
    ],
    notes: [
      { id: "n4", text: "LOI submitted at $1.95M. Waiting for response.", author: "Ori", createdAt: "2026-03-17T15:00:00Z" },
      { id: "n5", text: "Good cap rate, but roof needs attention. Factor $150K for roof replacement.", author: "Ori", createdAt: "2026-03-14T09:30:00Z" },
      { id: "n6", text: "Called Patricia — she's open to seller financing on 20% of purchase price.", author: "Max", createdAt: "2026-03-11T16:00:00Z" },
    ],
    emails: [
      { id: "e2", to: "pnguyen@cypressproperties.com", subject: "LOI — Cypress Creek Flex Space, 9800 Cypress Creek Pkwy", body: "Patricia,\n\nPlease find attached our Letter of Intent for the Cypress Creek Flex Space property at $1,950,000 with the terms discussed.\n\nWe look forward to your response.\n\nBest,\nOri\nRedhorn Capital Partners", sentAt: "2026-03-17T15:00:00Z", sentBy: "Ori" },
    ],
    createdAt: "2026-03-08T08:00:00Z",
    updatedAt: "2026-03-17T15:00:00Z",
  },
  {
    id: "deal-4",
    name: "FM 1960 Retail Strip",
    address: "15400 FM 1960 Rd W",
    city: "Houston",
    state: "TX",
    propertyType: "Retail",
    sqft: 18000,
    units: 6,
    askingPrice: 1400000,
    pricePerSF: 78,
    capRate: 6.5,
    stage: "dead",
    source: "Broker — Marcus & Millichap",
    assignedTo: "Max",
    contacts: [
      { name: "Tom Bradley", role: "Listing Broker", email: "tbradley@marcusmillichap.com" },
    ],
    notes: [
      { id: "n7", text: "Passed — cap rate too low for retail in this corridor. Seller won't budge on price.", author: "Max", createdAt: "2026-03-05T10:00:00Z" },
    ],
    emails: [],
    createdAt: "2026-02-20T08:00:00Z",
    updatedAt: "2026-03-05T10:00:00Z",
  },
  {
    id: "deal-5",
    name: "Tomball Warehouse",
    address: "28100 Tomball Pkwy",
    city: "Tomball",
    state: "TX",
    propertyType: "Warehouse",
    sqft: 22000,
    units: 4,
    askingPrice: 1650000,
    pricePerSF: 75,
    capRate: 7.5,
    stage: "lead",
    source: "Phone Call",
    assignedTo: "Ori",
    contacts: [
      { name: "Rick Hernandez", role: "Owner", email: "rhernandez@tomballprops.com", phone: "936-555-0134" },
    ],
    notes: [
      { id: "n8", text: "Rick mentioned he's thinking about selling. Not listed yet. Follow up next week.", author: "Ori", createdAt: "2026-03-19T08:30:00Z" },
    ],
    emails: [],
    createdAt: "2026-03-19T08:30:00Z",
    updatedAt: "2026-03-19T08:30:00Z",
  },
];

export function loadDeals(): Deal[] {
  if (typeof window === "undefined") return seedDeals;
  try {
    const raw = localStorage.getItem(DEALS_KEY);
    return raw ? JSON.parse(raw) : seedDeals;
  } catch { return seedDeals; }
}

export function saveDeals(deals: Deal[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(DEALS_KEY, JSON.stringify(deals));
}

export function addDeal(deal: Omit<Deal, "id" | "createdAt" | "updatedAt" | "notes" | "emails">): Deal {
  const deals = loadDeals();
  const newDeal: Deal = {
    ...deal,
    id: `deal-${Date.now()}`,
    notes: [],
    emails: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveDeals([newDeal, ...deals]);
  return newDeal;
}

export function updateDealStage(id: string, stage: DealStage) {
  const deals = loadDeals();
  saveDeals(deals.map(d => d.id === id ? { ...d, stage, updatedAt: new Date().toISOString() } : d));
}

export function addDealNote(dealId: string, text: string, author: string) {
  const deals = loadDeals();
  saveDeals(deals.map(d => d.id === dealId ? {
    ...d,
    notes: [{ id: `n-${Date.now()}`, text, author, createdAt: new Date().toISOString() }, ...d.notes],
    updatedAt: new Date().toISOString(),
  } : d));
}

export function addDealEmail(dealId: string, email: Omit<EmailRecord, "id">) {
  const deals = loadDeals();
  saveDeals(deals.map(d => d.id === dealId ? {
    ...d,
    emails: [{ ...email, id: `e-${Date.now()}` }, ...d.emails],
    updatedAt: new Date().toISOString(),
  } : d));
}

export function deleteDeal(id: string) {
  saveDeals(loadDeals().filter(d => d.id !== id));
}

export function getStageLabel(stage: DealStage): string {
  const map: Record<DealStage, string> = {
    lead: "Lead",
    outreach: "Outreach",
    underwriting: "Underwriting",
    loi: "LOI",
    due_diligence: "Due Diligence",
    closing: "Closing",
    closed: "Closed",
    dead: "Dead",
  };
  return map[stage];
}

export function getStageColor(stage: DealStage): string {
  const map: Record<DealStage, string> = {
    lead: "bg-[#71717a]",
    outreach: "bg-[#2563eb]",
    underwriting: "bg-[#7c3aed]",
    loi: "bg-[#d97706]",
    due_diligence: "bg-[#0891b2]",
    closing: "bg-[#16a34a]",
    closed: "bg-[#18181b]",
    dead: "bg-[#dc2626]",
  };
  return map[stage];
}

// Email templates for common deal outreach
export const emailTemplates: { name: string; subject: string; body: string }[] = [
  {
    name: "Initial Outreach",
    subject: "Interest in {{property_name}} — {{address}}",
    body: `Dear {{contact_name}},

I hope this message finds you well. My name is {{sender_name}} with Redhorn Capital Partners, a Houston-based commercial real estate investment firm.

We are actively acquiring {{property_type}} properties in the Houston metro area and came across your property at {{address}}. We would love to learn more about the property and discuss a potential acquisition.

Would you be available for a brief call this week?

Best regards,
{{sender_name}}
Redhorn Capital Partners`,
  },
  {
    name: "Request for T12 & Rent Roll",
    subject: "{{property_name}} — Request for Financial Documents",
    body: `{{contact_name}},

Thank you for the conversation regarding {{property_name}} at {{address}}. To move forward with our underwriting, could you please provide:

1. Trailing 12-month P&L (Income & Expense Statement)
2. Current rent roll
3. Utility expense breakdown
4. Any recent capital expenditure history

We are prepared to move quickly once we have the financials.

Best,
{{sender_name}}
Redhorn Capital Partners`,
  },
  {
    name: "Follow-Up",
    subject: "Re: {{property_name}} — Following Up",
    body: `{{contact_name}},

I wanted to follow up on our previous conversation regarding {{property_name}}. We remain very interested in the property and would love to discuss next steps.

Please let me know if you have any questions or if there's a good time to connect.

Best,
{{sender_name}}
Redhorn Capital Partners`,
  },
  {
    name: "LOI Submission",
    subject: "Letter of Intent — {{property_name}}, {{address}}",
    body: `{{contact_name}},

Please find attached our Letter of Intent for {{property_name}} at {{address}}.

Key terms:
- Purchase Price: {{asking_price}}
- Closing Timeline: 45 days from execution
- Due Diligence Period: 30 days
- Earnest Money: 1% of purchase price

We look forward to your review and response.

Best regards,
{{sender_name}}
Redhorn Capital Partners`,
  },
];
