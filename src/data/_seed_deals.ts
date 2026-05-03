// Deal pipeline shared types + UI helpers.
// Live deal data lives in Convex (api.deals); this file only exports
// types and presentation helpers so the data layer can stay decoupled.

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
