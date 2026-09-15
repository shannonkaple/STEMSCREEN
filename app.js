(() => {
"use strict";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const TABLES = [
  {key:"pink", color:"#F3237C", soft:"#FFD5E7"},
  {key:"orange", color:"#F47607", soft:"#FFE0C6"},
  {key:"yellow", color:"#FAB910", soft:"#FFF3AD"},
  {key:"green", color:"#56A328", soft:"#D9EFCF"},
  {key:"blue", color:"#22B8F4", soft:"#D5F0FE"},
  {key:"purple", color:"#7618CF", soft:"#E7DCF6"}
];

const STORAGE_PREFIX = "taskscreen.github.v12.";
let activeGrade = localStorage.getItem(STORAGE_PREFIX + "activeGrade") || "first";
let state = null;
let editMode = false;
let activeTable = null;
let calledTables = new Set();
let audioCtx = null;
let taskObjectUrl = "";

function defaultState() {
  return {
    titles:{
      objective:"OBJECTIVE",
      success:"SUCCESS CRITERIA",
      earlyFinisher:"EARLY FINISHER",
      voice:"VOICE LEVEL",
      countdown:"TIME LEFT",
      task:"TASK OF THE DAY",
      reminders:"STEPS",
      bathroom:"BATHROOM + WATER"
    },
    objective:"",
    taskSub:"",
    earlyFinisher:"",
    earlyFinisherFontAdjust:0,
    voiceLevel:2,
    voiceLabels:["SILENT","WHISPER","TABLE TALK","PARTNER TALK","PRESENTER"],
    countdown:{
      endTime:""
    },
    listMarkers:{
      success:"star",
      reminders:"star"
    },
    successCriteria:[
      {id:"s1",text:""},
      {id:"s2",text:""},
      {id:"s3",text:""}
    ],
    reminders:[
      {id:"r1",text:""},
      {id:"r2",text:""},
      {id:"r3",text:""}
    ],
    bathroom:{
      doorbellText:"RING THE DOORBELL TO RETURN",
      tableLabels:{
        pink:"PINK", orange:"ORANGE", yellow:"YELLOW",
        green:"GREEN", blue:"BLUE", purple:"PURPLE"
      }
    },
    task:{
      mode:"empty",
      text:"",
      url:"",
      urlKind:"",
      loop:false
    },
    fontAdjust:{
      learning:{title:0,text:0},
      voice:{title:0,text:0},
      countdown:{title:0,text:0},
      task:{title:0,text:0},
      reminders:{title:0,text:0},
      bathroom:{title:0,text:0}
    }
  };
}

function deepMerge(base, extra) {
  if (Array.isArray(base)) return Array.isArray(extra) ? extra : base;
  if (!base || typeof base !== "object") return extra === undefined ? base : extra;
  const out = {...base};
  if (extra && typeof extra === "object") {
    for (const [k,v] of Object.entries(extra)) {
      out[k] = (k in base && base[k] && typeof base[k] === "object" && !Array.isArray(base[k]))
        ? deepMerge(base[k], v)
        : v;
    }
  }
  return out;
}

function loadState(grade) {
  let parsed = {};
  try { parsed = JSON.parse(localStorage.getItem(STORAGE_PREFIX + grade) || "{}"); } catch(e) {}
  const merged = deepMerge(defaultState(), parsed);
  if(!Array.isArray(merged.successCriteria)) merged.successCriteria = defaultState().successCriteria;
  if(!merged.countdown || typeof merged.countdown !== "object") merged.countdown = {endTime:""};
  if(typeof merged.countdown.endTime !== "string") merged.countdown.endTime = "";
  if(!merged.listMarkers || typeof merged.listMarkers !== "object") merged.listMarkers = {success:"star",reminders:"star"};
  if(!["star","bullet"].includes(merged.listMarkers.success)) merged.listMarkers.success = "star";
  if(!["star","bullet"].includes(merged.listMarkers.reminders)) merged.listMarkers.reminders = "star";
  if(typeof merged.task?.loop !== "boolean") merged.task.loop = false;
  if(typeof merged.earlyFinisher !== "string") merged.earlyFinisher = "";
  if(typeof merged.earlyFinisherFontAdjust !== "number") merged.earlyFinisherFontAdjust = 0;
  if(!merged.fontAdjust.learning) merged.fontAdjust.learning = {title:0,text:0};
  if(!merged.fontAdjust.countdown) merged.fontAdjust.countdown = {title:0,text:0};
  return merged;
}

let saveTimer = null;
function saveState() {
  localStorage.setItem(STORAGE_PREFIX + activeGrade, JSON.stringify(state));
  const status = $("#saveStatus");
  status.textContent = "SAVING";
  status.classList.add("saving");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    status.textContent = "SAVED";
    status.classList.remove("saving");
  }, 350);
}

function getPath(obj, path) {
  return path.split(".").reduce((a,k) => a?.[k], obj);
}
function setPath(obj, path, value) {
  const keys = path.split(".");
  let cur = obj;
  keys.slice(0,-1).forEach(k => { if(!cur[k] || typeof cur[k] !== "object") cur[k] = {}; cur = cur[k]; });
  cur[keys.at(-1)] = value;
}

function escapeHtmlAttr(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

/* IndexedDB for uploaded image/GIF/video */
const DB_NAME = "TaskscreenMediaV1";
const STORE = "media";
function openDb() {
  return new Promise((resolve,reject) => {
    const req = indexedDB.open(DB_NAME,1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function mediaPut(grade, record) {
  const db = await openDb();
  return new Promise((resolve,reject) => {
    const tx = db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).put(record, grade);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
async function mediaGet(grade) {
  const db = await openDb();
  return new Promise((resolve,reject) => {
    const req = db.transaction(STORE,"readonly").objectStore(STORE).get(grade);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
async function mediaDelete(grade) {
  const db = await openDb();
  return new Promise((resolve,reject) => {
    const tx = db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).delete(grade);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function listMediaKey(kind, grade, id) {
  return `${grade}:${kind}:${id}`;
}
async function listMediaPut(kind, grade, id, file) {
  const db = await openDb();
  const key = listMediaKey(kind, grade, id);
  return new Promise((resolve,reject) => {
    const tx = db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).put({blob:file, kind:`${kind}-image`, name:file.name, mime:file.type}, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
async function listMediaGet(kind, grade, id) {
  const db = await openDb();
  const key = listMediaKey(kind, grade, id);
  return new Promise((resolve,reject) => {
    const req = db.transaction(STORE,"readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
async function listMediaDelete(kind, grade, id) {
  const db = await openDb();
  const key = listMediaKey(kind, grade, id);
  return new Promise((resolve,reject) => {
    const tx = db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
function ensureListIds(listName, prefix) {
  let changed = false;
  (state[listName] || []).forEach((r,i) => {
    if(!r.id) {
      r.id = `${prefix}_${Date.now()}_${i}_${Math.random().toString(36).slice(2,7)}`;
      changed = true;
    }
  });
  if(changed) saveState();
}

/* Editable text */
function syncEditableText() {
  $$("[data-edit-key]").forEach(el => {
    const path = el.dataset.editKey;
    const value = getPath(state, path) ?? "";
    if (el.textContent !== String(value)) el.textContent = value;
  });
  $("#taskSub").dataset.placeholder = "Type what students need to do...";
}
$$("[data-edit-key]").forEach(el => {
  el.addEventListener("input", () => {
    if(!editMode) return;
    setPath(state, el.dataset.editKey, el.textContent.trim());
    saveState();
  });
});

/* Edit mode */
function setEditMode(on) {
  editMode = on;
  document.body.classList.toggle("edit-mode", on);
  $("#editToggle").textContent = on ? "DONE" : "EDIT";

  $$("[data-edit-key]").forEach(el => {
    el.contentEditable = on ? "true" : "false";
    el.spellcheck = false;
  });

  const voiceLabel = $("#voiceLabel");
  voiceLabel.contentEditable = on ? "true" : "false";
  voiceLabel.spellcheck = false;

  $$("[data-table-label]").forEach(span => {
    span.contentEditable = on ? "true" : "false";
    span.spellcheck = false;
  });

  $("#objectiveInput").readOnly = !on;
  renderSectionIcons().catch(()=>{});
  renderAllLists().catch(()=>{});

  if(on && navigator.storage?.persist) {
    navigator.storage.persist().catch(()=>{});
  }
}
$("#editToggle").addEventListener("click", () => setEditMode(!editMode));

/* Grade profiles */
async function switchGrade(grade) {
  if(!["first","second"].includes(grade)) return;
  activeGrade = grade;
  localStorage.setItem(STORAGE_PREFIX + "activeGrade", grade);
  state = loadState(grade);
  $$(".grade-btn").forEach(b => b.classList.toggle("active", b.dataset.grade === grade));
  resetBathroom();
  await renderAll();
}
$$(".grade-btn").forEach(btn => btn.addEventListener("click", () => switchGrade(btn.dataset.grade)));

/* Objective */
$("#objectiveInput").addEventListener("input", e => {
  state.objective = e.target.value;
  saveState();
});

/* Voice */
function renderVoice() {
  $$(".voice-btn").forEach(btn => btn.classList.toggle("active", Number(btn.dataset.level) === Number(state.voiceLevel)));
  const label = $("#voiceLabel");
  label.textContent = state.voiceLabels[state.voiceLevel] || "";
  label.classList.add("active-voice-label");
}
$$(".voice-btn").forEach(btn => btn.addEventListener("click", () => {
  state.voiceLevel = Number(btn.dataset.level);
  renderVoice();
  saveState();
}));
$("#voiceLabel").addEventListener("input", () => {
  if(!editMode) return;
  state.voiceLabels[state.voiceLevel] = $("#voiceLabel").textContent.trim();
  saveState();
});

/* End-time countdown: enter when class ends, show MM:SS remaining */
const endTimeInput = $("#endTimeInput");
const countdownDisplay = $("#countdownDisplay");
let classCountdownTimer = null;

function formatRemaining(seconds) {
  seconds = Math.max(0, Math.min(3599, Math.floor(seconds)));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
function secondsUntilEnd(endTime) {
  if(!endTime || !/^\d{2}:\d{2}$/.test(endTime)) return null;
  const [h,m] = endTime.split(":").map(Number);
  const now = new Date();
  const end = new Date(now);
  end.setHours(h,m,0,0);
  const diff = Math.ceil((end.getTime() - now.getTime()) / 1000);
  if(diff <= 0) return 0;
  // Class periods are always under an hour.
  return Math.min(3599,diff);
}
function updateClassCountdown() {
  const endTime = state.countdown?.endTime || "";
  const remaining = secondsUntilEnd(endTime);
  if(remaining === null) {
    countdownDisplay.textContent = "--:--";
    return;
  }
  if(remaining <= 0) {
    countdownDisplay.textContent = "--:--";
    return;
  }
  countdownDisplay.textContent = formatRemaining(remaining);
}
endTimeInput.addEventListener("input", () => {
  state.countdown.endTime = endTimeInput.value;
  saveState();
  updateClassCountdown();
});
function startClassCountdownClock() {
  clearInterval(classCountdownTimer);
  updateClassCountdown();
  classCountdownTimer = setInterval(updateClassCountdown,250);
}

/* Success Criteria + Reminders */
function markerChar(target) {
  return state.listMarkers?.[target] === "bullet" ? "•" : "★";
}
function updateMarkerButtons() {
  $$(".marker-choice").forEach(btn => {
    btn.classList.toggle("active", state.listMarkers?.[btn.dataset.markerTarget] === btn.dataset.marker);
  });
}
function updateListVisibility() {
  const anySuccess = (state.successCriteria || []).some(item => String(item.text || "").trim());
  $("#learningGrid").classList.toggle("all-success-empty", !anySuccess);
}
$$(".marker-choice").forEach(btn => btn.addEventListener("click", async () => {
  if(!editMode) return;
  state.listMarkers[btn.dataset.markerTarget] = btn.dataset.marker;
  saveState();
  updateMarkerButtons();
  await renderAllLists();
}));

async function renderSectionIcon(key) {
  const slot = document.querySelector(`[data-section-icon="${key}"]`);
  if(!slot) return;

  const rec = await listMediaGet("section-icon", activeGrade, key).catch(()=>null);
  const hasImage = !!rec?.blob;
  slot.classList.toggle("has-image", hasImage);

  slot.innerHTML = `
    ${hasImage ? "" : '<div class="section-icon-placeholder">+ ICON</div>'}
    <button class="section-icon-button" type="button" aria-label="Add or change section icon"></button>
    <button class="section-icon-remove ${hasImage ? "has-image" : ""}" type="button" aria-label="Remove section icon">×</button>
    <input class="section-icon-input" type="file" accept="image/*" hidden>
  `;

  if(hasImage) {
    const url = URL.createObjectURL(rec.blob);
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    img.addEventListener("load", ()=>URL.revokeObjectURL(url), {once:true});
    slot.prepend(img);
  }

  const button = slot.querySelector(".section-icon-button");
  const input = slot.querySelector(".section-icon-input");
  const remove = slot.querySelector(".section-icon-remove");

  button.addEventListener("click", () => {
    if(!editMode) return;
    input.click();
  });
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if(!file) return;
    await listMediaPut("section-icon", activeGrade, key, file);
    await renderSectionIcon(key);
  });
  remove.addEventListener("click", async e => {
    e.stopPropagation();
    await listMediaDelete("section-icon", activeGrade, key);
    await renderSectionIcon(key);
  });
}
async function renderSectionIcons() {
  await renderSectionIcon("objective");
}

async function renderChecklist({
  listName, containerId, mediaKind, rowClass, picClass, textClass,
  removeClass, placeholder, markerTarget, showPictures=true
}) {
  ensureListIds(listName, mediaKind === "success" ? "s" : "r");
  const list = state[listName];
  const container = $(containerId);
  container.innerHTML = "";

  for(let i=0;i<list.length;i++) {
    const item = list[i];
    const blank = !String(item.text || "").trim();
    if(!editMode && blank) continue;

    let savedPic = null;
    if(showPictures) {
      savedPic = await listMediaGet(mediaKind, activeGrade, item.id).catch(()=>null);
    }
    const hasImage = !!savedPic?.blob;

    const pictureHtml = showPictures ? `
      <div class="${picClass}-wrap">
        <div class="${picClass}-placeholder">${editMode ? '+ PIC' : ''}</div>
        <button class="${picClass}-button" type="button" aria-label="Add or change picture"></button>
        <button class="${picClass}-remove" type="button" aria-label="Remove picture">×</button>
        <input class="${picClass}-input" type="file" accept="image/*">
      </div>` : "";

    const row = document.createElement("div");
    row.className = `${rowClass}${blank ? " is-blank" : ""}${showPictures && !hasImage ? " no-image" : ""}`;
    row.innerHTML = `
      <div class="list-marker" aria-hidden="true">${markerChar(markerTarget)}</div>
      ${pictureHtml}
      <textarea class="${textClass}" rows="2" placeholder="${placeholder}" ${editMode ? "" : "readonly"}>${escapeHtml(item.text || "")}</textarea>
      <button class="${removeClass}" type="button" aria-label="Delete this item">×</button>`;

    const input = row.querySelector(`.${textClass}`);
    const remove = row.querySelector(`.${removeClass}`);

    if(showPictures) {
      const picWrap = row.querySelector(`.${picClass}-wrap`);
      const picButton = row.querySelector(`.${picClass}-button`);
      const picRemove = row.querySelector(`.${picClass}-remove`);
      const picInput = row.querySelector(`.${picClass}-input`);

      if(hasImage) {
        const url = URL.createObjectURL(savedPic.blob);
        const img = document.createElement("img");
        img.className = picClass;
        img.src = url;
        img.alt = "";
        img.addEventListener("load", () => URL.revokeObjectURL(url), {once:true});
        picWrap.querySelector(`.${picClass}-placeholder`).replaceWith(img);
        picRemove.classList.add("has-image");
      }

      picButton.addEventListener("click", () => { if(editMode) picInput.click(); });
      picInput.addEventListener("change", async () => {
        const file = picInput.files?.[0];
        if(!file) return;
        await listMediaPut(mediaKind, activeGrade, item.id, file);
        await renderAllLists();
      });
      picRemove.addEventListener("click", async e => {
        e.stopPropagation();
        await listMediaDelete(mediaKind, activeGrade, item.id);
        await renderAllLists();
      });
    }

    input.addEventListener("input", () => {
      state[listName][i].text = input.value;
      row.classList.toggle("is-blank", !input.value.trim());
      saveState();
      updateListVisibility();
    });

    remove.addEventListener("click", async () => {
      if(showPictures) await listMediaDelete(mediaKind, activeGrade, item.id).catch(()=>{});
      state[listName].splice(i,1);
      saveState();
      await renderAllLists();
    });

    container.appendChild(row);
  }
}
function focusNewestListRow(containerSelector, textSelector) {
  const container = $(containerSelector);
  if(!container) return;
  const rows = [...container.children];
  const row = rows[rows.length - 1];
  if(!row) return;
  row.classList.add("is-new-row");
  row.scrollIntoView({block:"nearest",behavior:"smooth"});
  const input = row.querySelector(textSelector);
  if(input) {
    input.removeAttribute("readonly");
    input.focus();
    input.setSelectionRange(input.value.length,input.value.length);
  }
  setTimeout(()=>row.classList.remove("is-new-row"),1400);
}

async function renderAllLists() {
  updateMarkerButtons();
  await renderChecklist({
    listName:"successCriteria",containerId:"#successList",mediaKind:"success",
    rowClass:"step-row",picClass:"step-pic",
    textClass:"step-text",removeClass:"step-remove",
    placeholder:"Type a success criterion...",markerTarget:"success",showPictures:false
  });
  await renderChecklist({
    listName:"reminders",containerId:"#reminderList",mediaKind:"reminder",
    rowClass:"reminder-row",picClass:"reminder-pic",
    textClass:"reminder-text",removeClass:"reminder-remove",
    placeholder:"Type a step...",markerTarget:"reminders",showPictures:true
  });
  updateListVisibility();
  applyPanelFont("learning");
  applyPanelFont("reminders");
}
$("#addSuccessBtn").addEventListener("click", async e => {
  e.preventDefault();
  e.stopPropagation();
  if(!editMode) setEditMode(true);
  if(!Array.isArray(state.successCriteria)) state.successCriteria = [];
  const id = `s_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  state.successCriteria.push({id,text:""});
  saveState();
  await renderAllLists();
  requestAnimationFrame(() => focusNewestListRow("#successList",".step-text"));
  updateListVisibility();
});
$("#addReminderBtn").addEventListener("click", async e => {
  e.preventDefault();
  e.stopPropagation();
  if(!editMode) setEditMode(true);
  if(!Array.isArray(state.reminders)) state.reminders = [];
  const id = `r_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  state.reminders.push({id,text:""});
  saveState();
  await renderAllLists();
  requestAnimationFrame(() => focusNewestListRow("#reminderList",".reminder-text"));
  updateListVisibility();
});

/* Early Finisher */
function renderEarlyFinisher() {
  const wrap = $("#earlyFinisherWrap");
  const text = $("#earlyFinisherText");
  text.textContent = state.earlyFinisher || "";
  wrap.classList.toggle("is-empty", !(state.earlyFinisher || "").trim());

  text.style.fontSize = "";
  const base = parseFloat(getComputedStyle(text).fontSize) || 16;
  text.style.fontSize = Math.max(9, base + Number(state.earlyFinisherFontAdjust || 0)) + "px";
}
$("#earlyFinisherText").addEventListener("input", () => {
  if(!editMode) return;
  state.earlyFinisher = $("#earlyFinisherText").textContent.trim();
  saveState();
  $("#earlyFinisherWrap").classList.toggle("is-empty", !state.earlyFinisher);
});
$("#earlyFinisherSmaller").addEventListener("click", e => {
  e.stopPropagation();
  state.earlyFinisherFontAdjust = Math.max(-12, Number(state.earlyFinisherFontAdjust || 0) - 2);
  saveState();
  renderEarlyFinisher();
});
$("#earlyFinisherBigger").addEventListener("click", e => {
  e.stopPropagation();
  state.earlyFinisherFontAdjust = Math.min(24, Number(state.earlyFinisherFontAdjust || 0) + 2);
  saveState();
  renderEarlyFinisher();
});

/* Task */
const taskPreview = $("#taskPreview");
const taskTextInput = $("#taskTextInput");
const imageUrlInput = $("#imageUrlInput");
const videoUrlInput = $("#videoUrlInput");
const taskLoopToggle = $("#taskLoopToggle");

function youtubeEmbed(url, loop=false) {
  try {
    const u = new URL(url);
    let id = "";
    if(u.hostname.includes("youtu.be")) id = u.pathname.slice(1).split("/")[0];
    if(u.hostname.includes("youtube.com")) {
      if(u.pathname === "/watch") id = u.searchParams.get("v") || "";
      else if(u.pathname.startsWith("/shorts/")) id = u.pathname.split("/")[2] || "";
      else if(u.pathname.startsWith("/embed/")) id = u.pathname.split("/")[2] || "";
    }
    if(!id) return "";
    const params = loop ? `?loop=1&playlist=${encodeURIComponent(id)}` : "";
    return `https://www.youtube.com/embed/${id}${params}`;
  } catch(e) { return ""; }
}
function setTaskEditorMode(mode) {
  $$(".mode-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
  $$(".task-control").forEach(c => c.classList.toggle("active", c.dataset.control === mode));
}
$$(".mode-btn").forEach(btn => btn.addEventListener("click", () => setTaskEditorMode(btn.dataset.mode)));

async function clearTaskMedia() {
  if(taskObjectUrl) { URL.revokeObjectURL(taskObjectUrl); taskObjectUrl = ""; }
  await mediaDelete(activeGrade).catch(()=>{});
}
async function renderTask() {
  if(taskObjectUrl) { URL.revokeObjectURL(taskObjectUrl); taskObjectUrl = ""; }
  taskPreview.innerHTML = "";
  taskTextInput.value = state.task.text || "";
  imageUrlInput.value = state.task.mode === "image-url" ? state.task.url || "" : "";
  videoUrlInput.value = state.task.mode === "video-url" ? state.task.url || "" : "";
  taskLoopToggle.checked = !!state.task.loop;

  if(state.task.mode === "text" && state.task.text) {
    const d = document.createElement("div");
    d.className = "task-text-preview";
    d.textContent = state.task.text;
    taskPreview.appendChild(d);
  } else if(state.task.mode === "image-url" && state.task.url) {
    const img = document.createElement("img");
    img.src = state.task.url;
    img.alt = "Task of the day";
    taskPreview.appendChild(img);
  } else if(state.task.mode === "video-url" && state.task.url) {
    const yt = youtubeEmbed(state.task.url, !!state.task.loop);
    if(yt) {
      const iframe = document.createElement("iframe");
      iframe.src = yt;
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.allowFullscreen = true;
      taskPreview.appendChild(iframe);
    } else {
      const v = document.createElement("video");
      v.src = state.task.url;
      v.controls = true;
      v.playsInline = true;
      v.loop = !!state.task.loop;
      taskPreview.appendChild(v);
    }
  } else if(state.task.mode === "upload-image" || state.task.mode === "upload-video") {
    const media = await mediaGet(activeGrade).catch(()=>null);
    if(media?.blob) {
      taskObjectUrl = URL.createObjectURL(media.blob);
      if(state.task.mode === "upload-image") {
        const img = document.createElement("img");
        img.src = taskObjectUrl;
        img.alt = "Task of the day";
        taskPreview.appendChild(img);
      } else {
        const v = document.createElement("video");
        v.src = taskObjectUrl;
        v.controls = true;
        v.playsInline = true;
        v.loop = !!state.task.loop;
        taskPreview.appendChild(v);
      }
    }
  }

  if(!taskPreview.children.length) {
    taskPreview.innerHTML = `<div class="task-empty">
      <svg class="empty-image-icon" viewBox="0 0 120 100" aria-hidden="true"><rect x="12" y="10" width="96" height="80" rx="10" fill="#fff" stroke="#2c91ce" stroke-width="6"/><circle cx="81" cy="34" r="10" fill="#FFD31B"/><path d="M24 77 48 51l17 17 12-12 21 21z" fill="#56A328"/><path d="M24 77 48 51l17 17" fill="none" stroke="#3e9bd6" stroke-width="4" stroke-linejoin="round"/></svg>
      Add a picture, video, GIF, or text here.</div>`;
  }
  setTaskEditorMode(state.task.mode.startsWith("image") || state.task.mode === "upload-image" ? "image" :
                    state.task.mode.startsWith("video") || state.task.mode === "upload-video" ? "video" : "text");
  applyPanelFont("task");
}
taskTextInput.addEventListener("input", async () => {
  await clearTaskMedia();
  state.task = {mode:"text", text:taskTextInput.value, url:"", urlKind:"", loop:false};
  saveState();
  renderTask();
});
$("#imageFileInput").addEventListener("change", async e => {
  const file = e.target.files?.[0];
  if(!file) return;
  await mediaPut(activeGrade, {blob:file, kind:"image", name:file.name, mime:file.type});
  state.task = {mode:"upload-image", text:"", url:"", urlKind:"", loop:false};
  saveState();
  renderTask();
});
$("#videoFileInput").addEventListener("change", async e => {
  const file = e.target.files?.[0];
  if(!file) return;
  await mediaPut(activeGrade, {blob:file, kind:"video", name:file.name, mime:file.type});
  state.task = {mode:"upload-video", text:"", url:"", urlKind:"", loop:!!taskLoopToggle.checked};
  saveState();
  renderTask();
});
$("#useImageUrlBtn").addEventListener("click", async () => {
  const url = imageUrlInput.value.trim();
  if(!url) return;
  await clearTaskMedia();
  state.task = {mode:"image-url", text:"", url, urlKind:"image", loop:false};
  saveState();
  renderTask();
});
$("#useVideoUrlBtn").addEventListener("click", async () => {
  const url = videoUrlInput.value.trim();
  if(!url) return;
  await clearTaskMedia();
  state.task = {mode:"video-url", text:"", url, urlKind:"video", loop:!!taskLoopToggle.checked};
  saveState();
  renderTask();
});
$("#clearTaskBtn").addEventListener("click", async () => {
  await clearTaskMedia();
  state.task = {mode:"empty", text:"", url:"", urlKind:"", loop:false};
  saveState();
  renderTask();
});


taskLoopToggle.addEventListener("change", () => {
  state.task.loop = !!taskLoopToggle.checked;
  saveState();
  if(state.task.mode === "upload-video" || state.task.mode === "video-url") {
    renderTask();
  }
});

/* Bathroom */
function tableLabel(key) {
  return state.bathroom.tableLabels[key] || key.toUpperCase();
}
function renderTableLabels() {
  $$("[data-table-label]").forEach(span => {
    span.textContent = tableLabel(span.dataset.tableLabel);
  });
}
function resetBathroom() {
  activeTable = null;
  calledTables = new Set();
  const panel = $("#bathroomPanel");
  panel.style.background = "var(--bath-neutral)";
  const current = $("#bathroomCurrent");
  current.textContent = "";
  current.style.background = "#fff";
  current.style.color = "transparent";
  current.style.borderColor = "#000";
  current.classList.add("is-empty");
  current.classList.remove("flash");
  $$(".table-btn").forEach(btn => btn.classList.remove("active","called"));
}
function audio() {
  if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if(audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}
function tone(ctx,freq,start,dur,gainLevel=.18) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq,start);
  gain.gain.setValueAtTime(.0001,start);
  gain.gain.exponentialRampToValueAtTime(gainLevel,start+.012);
  gain.gain.exponentialRampToValueAtTime(.0001,start+dur);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(start); osc.stop(start+dur);
}
function attention() {
  const ctx = audio();
  const base = ctx.currentTime + .02;
  for(let r=0;r<3;r++) {
    const t = base + r*.86;
    tone(ctx,1046.5,t,.21,.21);
    tone(ctx,784,t+.24,.38,.18);
  }
}
function renderBathroomButtons() {
  $$(".table-btn").forEach(btn => {
    const key = btn.dataset.key;
    btn.classList.toggle("active", key === activeTable);
    btn.classList.toggle("called", calledTables.has(key) && key !== activeTable);
  });
}
function activateTable(key, sound=true) {
  if(editMode) return;
  const t = TABLES.find(x => x.key === key);
  if(!t) return;
  const changed = activeTable !== key;
  if(changed && activeTable) calledTables.add(activeTable);
  activeTable = key;

  $("#bathroomPanel").style.background = t.color;
  const current = $("#bathroomCurrent");
  current.textContent = `${tableLabel(key)} TABLE`;
  current.style.background = t.soft;
  current.style.color = t.color;
  current.style.borderColor = t.color;
  current.classList.remove("is-empty");
  current.classList.add("flash");
  renderBathroomButtons();
  if(changed && sound) attention();
}
$$(".table-btn").forEach(btn => btn.addEventListener("click", e => {
  if(editMode) return;
  activateTable(btn.dataset.key,true);
}));
$$("[data-table-label]").forEach(span => span.addEventListener("input", e => {
  if(!editMode) return;
  const key = span.dataset.tableLabel;
  state.bathroom.tableLabels[key] = span.textContent.trim().replace(/\s+TABLE$/i,"") || key.toUpperCase();
  saveState();
}));
$("#bathNextBtn").addEventListener("click", () => {
  if(editMode) return;
  if(!activeTable) { activateTable(TABLES[0].key,true); return; }
  let i = TABLES.findIndex(t => t.key === activeTable);
  i = (i+1) % TABLES.length;
  activateTable(TABLES[i].key,true);
});
$("#bathResetBtn").addEventListener("click", resetBathroom);

/* Font controls */
const FONT_MAP = {
  learning:{title:[".learning-title"], text:["#objectiveInput",".step-text"]},
  countdown:{title:[".countdown-panel .panel-title"], text:["#countdownDisplay","#endTimeInput"]},
  voice:{title:[".voice .panel-title"], text:[".voice-btn","#voiceLabel"]},
  task:{title:[".task .panel-title",".early-finisher-label"], text:["#taskSub",".task-text-preview",".task-empty"]},
  reminders:{title:[".reminders .panel-title"], text:[".reminder-text"]},
  bathroom:{title:[".bathroom .panel-title"], text:["#bathroomCurrent",".table-btn"]}
};
function elementsFor(panel, part) {
  return (FONT_MAP[panel]?.[part] || []).flatMap(sel => $$(sel));
}
function applyPanelFont(panel) {
  ["title","text"].forEach(part => {
    const delta = Number(state.fontAdjust?.[panel]?.[part] || 0);
    elementsFor(panel,part).forEach(el => {
      el.style.fontSize = "";
      const base = parseFloat(getComputedStyle(el).fontSize) || 16;
      el.style.fontSize = Math.max(8, base + delta) + "px";
    });
  });
}
function applyAllFonts() {
  Object.keys(FONT_MAP).forEach(applyPanelFont);
}
$$(".panel-tools button").forEach(btn => btn.addEventListener("click", e => {
  e.stopPropagation();
  const panel = btn.closest(".panel").dataset.panel;
  const part = btn.dataset.fontPart;
  const delta = Number(btn.dataset.fontDelta);
  state.fontAdjust[panel][part] = Math.max(-18, Math.min(34, Number(state.fontAdjust[panel][part] || 0) + delta));
  saveState();
  applyPanelFont(panel);
}));


/* Page fullscreen */
function isPageFullscreen(){
  return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
}
async function enterPageFullscreen(){
  const el=document.documentElement;
  const request=el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  if(!request) return false;
  try{
    const result=request.call(el);
    if(result && typeof result.then === "function") await result;
    return true;
  }catch(e){ return false; }
}
async function exitPageFullscreen(){
  const exit=document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
  if(!exit) return false;
  try{
    const result=exit.call(document);
    if(result && typeof result.then === "function") await result;
    return true;
  }catch(e){ return false; }
}
function syncFullscreenButton(){
  const btn=$("#fullscreenToggle");
  if(!btn) return;
  btn.textContent=isPageFullscreen()?"EXIT FULL SCREEN":"FULL SCREEN";
}
const fullscreenToggle=$("#fullscreenToggle");
if(fullscreenToggle){
  fullscreenToggle.addEventListener("click",async e=>{
    e.preventDefault();e.stopPropagation();
    if(isPageFullscreen()){
      await exitPageFullscreen();
      document.body.classList.remove("presentation-mode");
    }else if(document.body.classList.contains("presentation-mode")){
      document.body.classList.remove("presentation-mode");
    }else{
      const ok=await enterPageFullscreen();
      if(!ok) document.body.classList.add("presentation-mode");
    }
    syncFullscreenButton();
    if(document.body.classList.contains("presentation-mode")) {
      fullscreenToggle.textContent = "EXIT FULL SCREEN";
    }
  });
  ["fullscreenchange","webkitfullscreenchange","MSFullscreenChange"].forEach(evt=>document.addEventListener(evt,syncFullscreenButton));
}

/* Full render */
async function renderAll() {
  syncEditableText();
  renderEarlyFinisher();
  $("#objectiveInput").value = state.objective || "";
  endTimeInput.value = state.countdown?.endTime || "";
  startClassCountdownClock();
  renderVoice();
  await renderSectionIcons();
  await renderAllLists();
  renderTableLabels();
  await renderTask();
  applyAllFonts();
}
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(applyAllFonts,120);
});

state = loadState(activeGrade);
setEditMode(false);
switchGrade(activeGrade);
})();