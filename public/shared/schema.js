// Single source of truth for the form definition + validation.
// Imported as an ES module by the browser (app.js), the local Node
// dev server (server.mjs) and the Cloudflare Worker (worker.js), so the
// exact same rules gate the UI *and* the real server-side submit — the
// client can never advance past, or submit, a value the server rejects.

export const STEPS = [
  {
    id: "name",
    type: "text",
    question: "What's your name?",
    help: "So we know who we're talking to.",
    placeholder: "e.g. Jordan Rivera",
    autocomplete: "name",
  },
  {
    id: "email",
    type: "email",
    question: "What's the best email to reach you?",
    help: "We'll send the project summary here. No spam.",
    placeholder: "you@company.com",
    autocomplete: "email",
  },
  {
    id: "projectType",
    type: "radio",
    question: "What kind of project is this?",
    help: "Pick the closest match.",
    options: [
      { value: "website", label: "Marketing website" },
      { value: "webapp", label: "Web application" },
      { value: "automation", label: "Workflow automation" },
      { value: "ai_agent", label: "AI agent / chatbot" },
      { value: "other", label: "Something else" },
    ],
  },
  {
    id: "budget",
    type: "radio",
    question: "What's your rough budget?",
    help: "A range is fine. It just helps us scope sensibly.",
    options: [
      { value: "lt_1k", label: "Under $1,000" },
      { value: "1k_5k", label: "$1,000 - $5,000" },
      { value: "5k_15k", label: "$5,000 - $15,000" },
      { value: "gt_15k", label: "$15,000+" },
    ],
  },
  {
    id: "timeline",
    type: "select",
    question: "When do you want to start?",
    help: "Choose the option that fits best.",
    options: [
      { value: "", label: "Select a timeline..." },
      { value: "asap", label: "As soon as possible" },
      { value: "1_month", label: "Within a month" },
      { value: "1_3_months", label: "In 1 to 3 months" },
      { value: "flexible", label: "I'm flexible" },
    ],
  },
  {
    id: "details",
    type: "textarea",
    question: "Tell us a bit about what you need.",
    help: "A few sentences is plenty. The more we know, the sharper the quote.",
    placeholder: "What are you trying to build, and what does success look like?",
  },
];

// Valid option values per choice field, derived from STEPS so they can
// never drift out of sync with what the UI actually offers.
const OPTION_VALUES = Object.fromEntries(
  STEPS.filter((s) => s.options).map((s) => [
    s.id,
    new Set(s.options.map((o) => o.value).filter((v) => v !== "")),
  ])
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validate a single field's value. Returns "" when valid, or a specific,
// plain-English error message when not. Used for inline per-step gating
// in the browser and re-run field-by-field on the server at submit time.
export function validateField(id, rawValue) {
  const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;

  switch (id) {
    case "name":
      if (!value) return "Please enter your name.";
      if (value.length < 2) return "That looks too short. Please enter your full name.";
      if (value.length > 80) return "That name is too long (80 characters max).";
      return "";

    case "email":
      if (!value) return "Please enter your email address.";
      if (!EMAIL_RE.test(value)) return "That doesn't look like a valid email address.";
      if (value.length > 120) return "That email is too long.";
      return "";

    case "projectType":
      if (!value) return "Please pick a project type.";
      if (!OPTION_VALUES.projectType.has(value)) return "Please pick one of the listed options.";
      return "";

    case "budget":
      if (!value) return "Please choose a budget range.";
      if (!OPTION_VALUES.budget.has(value)) return "Please pick one of the listed options.";
      return "";

    case "timeline":
      if (!value) return "Please choose when you'd like to start.";
      if (!OPTION_VALUES.timeline.has(value)) return "Please pick one of the listed options.";
      return "";

    case "details":
      if (!value) return "Please tell us a little about the project.";
      if (value.length < 20) return `Just a bit more, please (${value.length}/20 characters).`;
      if (value.length > 2000) return "That's very long (2000 characters max).";
      return "";

    default:
      return "Unknown field.";
  }
}

// Validate every field. Returns { ok, errors } where errors maps
// field id -> message for each invalid field. This is the gate the real
// submit endpoint runs before accepting anything.
export function validateAll(data) {
  const errors = {};
  for (const step of STEPS) {
    const msg = validateField(step.id, data ? data[step.id] : undefined);
    if (msg) errors[step.id] = msg;
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

// Human-readable label for a stored choice value (for the review screen
// and the confirmation summary).
export function labelFor(id, value) {
  const step = STEPS.find((s) => s.id === id);
  if (!step || !step.options) return value;
  const opt = step.options.find((o) => o.value === value);
  return opt ? opt.label : value;
}
