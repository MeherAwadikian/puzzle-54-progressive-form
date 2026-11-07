import { STEPS, validateField, validateAll, labelFor } from "./shared/schema.js";

// Progressive-disclosure controller.
// One question is on screen at a time. Answers live in `state.data`, which
// is also mirrored to localStorage so a refresh mid-flow does not lose
// progress. `state.index` is the current step (0..STEPS.length-1); values
// -1 / -2 are the special review and done screens.
const DRAFT_KEY = "forge.intake.draft.v1";
const REVIEW = "review";
const DONE = "done";

const els = {
  form: document.getElementById("stepForm"),
  body: document.getElementById("stepBody"),
  fieldError: document.getElementById("fieldError"),
  back: document.getElementById("backBtn"),
  next: document.getElementById("nextBtn"),
  progressFill: document.getElementById("progressFill"),
  stepCount: document.getElementById("stepCount"),
  review: document.getElementById("reviewScreen"),
  reviewSummary: document.getElementById("reviewSummary"),
  reviewBack: document.getElementById("reviewBackBtn"),
  submit: document.getElementById("submitBtn"),
  submitError: document.getElementById("submitError"),
  done: document.getElementById("doneScreen"),
  doneMessage: document.getElementById("doneMessage"),
  doneSummary: document.getElementById("doneSummary"),
  restart: document.getElementById("restartBtn"),
};

const state = {
  index: 0,
  data: loadDraft(),
};

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state.data));
  } catch {
    /* storage unavailable (private mode) — flow still works in-memory */
  }
}
function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

// Read whatever the user has entered into the currently rendered control,
// without committing it to state yet.
function readCurrentInput() {
  const step = STEPS[state.index];
  if (!step) return undefined;
  if (step.type === "radio") {
    const checked = els.body.querySelector(`input[name="${step.id}"]:checked`);
    return checked ? checked.value : "";
  }
  const control = els.body.querySelector(`[name="${step.id}"]`);
  return control ? control.value : "";
}

function setFieldError(msg) {
  els.fieldError.textContent = msg || "";
}

function renderStep() {
  const step = STEPS[state.index];
  const stored = state.data[step.id] ?? "";
  setFieldError("");

  let controlHtml = "";
  if (step.type === "radio") {
    controlHtml = `<div class="options" role="radiogroup" aria-label="${escapeAttr(step.question)}">`;
    for (const opt of step.options) {
      const checked = stored === opt.value;
      controlHtml += `
        <label class="option${checked ? " checked" : ""}">
          <input type="radio" name="${step.id}" value="${escapeAttr(opt.value)}" ${checked ? "checked" : ""} />
          <span>${escapeHtml(opt.label)}</span>
        </label>`;
    }
    controlHtml += `</div>`;
  } else if (step.type === "select") {
    controlHtml = `<select class="select" name="${step.id}">`;
    for (const opt of step.options) {
      const selected = stored === opt.value;
      controlHtml += `<option value="${escapeAttr(opt.value)}" ${selected ? "selected" : ""}>${escapeHtml(opt.label)}</option>`;
    }
    controlHtml += `</select>`;
  } else if (step.type === "textarea") {
    controlHtml = `<textarea class="textarea" name="${step.id}" placeholder="${escapeAttr(step.placeholder || "")}">${escapeHtml(stored)}</textarea>`;
  } else {
    controlHtml = `<input class="input" type="${step.type}" name="${step.id}"
      placeholder="${escapeAttr(step.placeholder || "")}"
      autocomplete="${escapeAttr(step.autocomplete || "off")}"
      value="${escapeAttr(stored)}" />`;
  }

  els.body.innerHTML = `
    <h1 class="question">${escapeHtml(step.question)}</h1>
    <p class="help">${escapeHtml(step.help || "")}</p>
    ${controlHtml}
  `;

  // Progress + nav chrome.
  const pct = Math.round(((state.index) / STEPS.length) * 100);
  els.progressFill.style.width = `${pct}%`;
  els.stepCount.textContent = `Step ${state.index + 1} of ${STEPS.length}`;
  els.back.disabled = state.index === 0;
  els.next.textContent = state.index === STEPS.length - 1 ? "Review" : "Next";

  // Clear the inline error the moment the user changes the answer, and keep
  // radio cards visually in sync.
  els.body.addEventListener("input", onInputChange);
  els.body.addEventListener("change", onInputChange);

  focusFirstControl();
}

function onInputChange() {
  setFieldError("");
  const step = STEPS[state.index];
  if (step.type === "radio") {
    els.body.querySelectorAll(".option").forEach((label) => {
      const input = label.querySelector("input");
      label.classList.toggle("checked", input.checked);
    });
  }
}

function focusFirstControl() {
  const control = els.body.querySelector("input, textarea, select");
  if (control && control.type !== "radio") control.focus();
}

// Advance one step (or to the review screen), gated by validation.
function goNext() {
  const step = STEPS[state.index];
  const value = readCurrentInput();
  const err = validateField(step.id, value);
  if (err) {
    setFieldError(err);
    return;
  }
  state.data[step.id] = typeof value === "string" ? value.trim() : value;
  saveDraft();

  if (state.index < STEPS.length - 1) {
    state.index += 1;
    renderStep();
  } else {
    showReview();
  }
}

// Go back one step. No validation — but we still persist whatever is
// currently typed so nothing is lost moving backward.
function goBack() {
  if (state.index === 0) return;
  const step = STEPS[state.index];
  const value = readCurrentInput();
  state.data[step.id] = typeof value === "string" ? value.trim() : value;
  saveDraft();
  state.index -= 1;
  renderStep();
}

function showScreen(which) {
  els.form.hidden = which !== null;
  els.review.hidden = which !== REVIEW;
  els.done.hidden = which !== DONE;
}

function showReview() {
  els.progressFill.style.width = "100%";
  els.stepCount.textContent = `Step ${STEPS.length} of ${STEPS.length}`;
  els.reviewSummary.innerHTML = STEPS.map(
    (s) => `
      <div class="row">
        <dt>${escapeHtml(s.question)}</dt>
        <dd>${escapeHtml(labelFor(s.id, state.data[s.id] ?? ""))}</dd>
      </div>`
  ).join("");
  els.submitError.textContent = "";
  showScreen(REVIEW);
}

async function submit() {
  // Re-validate the whole payload client-side before touching the network.
  const { ok, errors } = validateAll(state.data);
  if (!ok) {
    const firstBad = STEPS.findIndex((s) => errors[s.id]);
    els.submitError.textContent = "Some answers need fixing. Taking you back to the first one.";
    state.index = firstBad < 0 ? 0 : firstBad;
    showScreen(null);
    renderStep();
    setFieldError(errors[STEPS[state.index].id] || "");
    return;
  }

  els.submit.disabled = true;
  els.submit.textContent = "Sending...";
  els.submitError.textContent = "";

  let result;
  try {
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.data),
    });
    result = await res.json();
    if (!res.ok || !result.ok) {
      throw new Error(result && result.error ? result.error : `Server returned ${res.status}`);
    }
  } catch (err) {
    // Fallback: if no backend is reachable (e.g. opened as a static file),
    // still complete the submit locally so the flow is never a dead end —
    // and say honestly that it was recorded locally.
    result = {
      ok: true,
      reference: localReference(),
      storage: "local",
      message: err && err.message ? `(saved locally: ${err.message})` : "(saved locally)",
    };
    try {
      const log = JSON.parse(localStorage.getItem("forge.intake.submissions.v1") || "[]");
      log.push({ ...state.data, reference: result.reference, at: new Date().toISOString() });
      localStorage.setItem("forge.intake.submissions.v1", JSON.stringify(log));
    } catch {
      /* ignore */
    }
  }

  showDone(result);
}

function localReference() {
  const n = Math.floor(Math.random() * 0x10000).toString(16).toUpperCase().padStart(4, "0");
  return `FS-LOCAL-${n}`;
}

function showDone(result) {
  clearDraft();
  const where =
    result.storage === "kv"
      ? "It's saved to our intake store and the team has it."
      : result.storage === "file"
      ? "It's been recorded on the server and the team has it."
      : "It was recorded in this browser (no backend was reachable).";
  els.doneMessage.innerHTML = `Thanks, ${escapeHtml(state.data.name)}. Your reference is <code class="ref">${escapeHtml(result.reference)}</code>. ${escapeHtml(where)}`;
  els.doneSummary.innerHTML = STEPS.map(
    (s) => `
      <div class="row">
        <dt>${escapeHtml(s.question)}</dt>
        <dd>${escapeHtml(labelFor(s.id, state.data[s.id] ?? ""))}</dd>
      </div>`
  ).join("");
  showScreen(DONE);
}

function restart() {
  state.index = 0;
  state.data = {};
  clearDraft();
  els.submit.disabled = false;
  els.submit.textContent = "Submit request";
  showScreen(null);
  renderStep();
}

// ---- escaping helpers (all dynamic text goes through these) ----
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeAttr(s) {
  return escapeHtml(s);
}

// ---- wiring ----
els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  goNext();
});
els.back.addEventListener("click", goBack);
els.reviewBack.addEventListener("click", () => {
  state.index = STEPS.length - 1;
  showScreen(null);
  renderStep();
});
els.submit.addEventListener("click", submit);
els.restart.addEventListener("click", restart);

// If a prior draft had answers, resume at the first unanswered step so the
// user isn't re-typing what they already entered.
(function init() {
  const firstUnanswered = STEPS.findIndex((s) => !state.data[s.id]);
  state.index = firstUnanswered < 0 ? 0 : firstUnanswered;
  showScreen(null);
  renderStep();
})();
