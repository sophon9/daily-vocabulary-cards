const $ = selector => document.querySelector(selector);

let current = [];
let pickerWords = [];
let selected = new Set();
let generationRequest = 0;
let cardSource = "standard";
let children = [];

function activateTab(name) {
  document.querySelectorAll(".tab,.panel").forEach(element => element.classList.remove("active"));
  document.querySelector(`.tab[data-tab="${name}"]`)?.classList.add("active");
  $("#" + name)?.classList.add("active");
  if (name === "history") loadHistory();
  if (name === "custom") loadCustomLibrary();
  if (name === "profiles") loadProfiles();
}

document.querySelectorAll(".tab").forEach(button => {
  button.onclick = () => activateTab(button.dataset.tab);
});

function params(mode = "random", limit = 10) {
  return new URLSearchParams({
    grade: $("#grade").value,
    category: $("#category").value,
    no_repeat: $("#noRepeat").checked,
    child_id: activeChildId() || "",
    hide_remembered: $("#hideRemembered").checked,
    mode,
    limit,
  });
}

async function getWords(mode = "random", limit = 10) {
  const response = await fetch("/api/words?" + params(mode, limit));
  if (!response.ok) throw new Error("Unable to load words");
  return response.json();
}

function render() {
  const box = $("#cards");
  box.className = "cards " + $("#theme").value;
  box.replaceChildren();

  current.forEach((word, index) => {
    const card = document.createElement("div");
    card.className = "card";

    const remember = document.createElement("button");
    remember.className = "remember";
    remember.title = "ซ่อนคำนี้จากการ์ดใหม่ของผู้เรียนคนนี้";
    remember.textContent = "✓ จำได้แล้ว";
    remember.onclick = () => rememberWord(word, index);
    card.appendChild(remember);

    if (cardSource === "standard") {
      const replace = document.createElement("button");
      replace.className = "replace";
      replace.title = "เปลี่ยนคำนี้";
      replace.textContent = "↻ เปลี่ยน";
      replace.onclick = () => replaceOne(index);
      card.appendChild(replace);
    }

    const content = document.createElement("div");
    const english = document.createElement("div");
    english.className = "en";
    english.textContent = word.en;
    const pronunciation = document.createElement("div");
    pronunciation.className = "pronunciation";
    pronunciation.textContent = `/${word.pronunciation}/`;
    const thai = document.createElement("div");
    thai.className = "th";
    thai.textContent = word.th;
    content.append(english, pronunciation, thai);
    card.appendChild(content);
    box.appendChild(card);
  });
}

async function rememberWord(word, index) {
  const childId = activeChildId();
  if (!childId) return show("กรุณาเลือกผู้เรียนก่อน");
  const response = await fetch("/api/remembered", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({child_id: childId, word_en: word.en, word_th: word.th}),
  });
  if (!response.ok) return show("บันทึกคำที่จำได้ไม่สำเร็จ กรุณาลองอีกครั้ง");

  if ($("#hideRemembered").checked) {
    const data = await getWords("random", 80);
    const used = new Set(current.map(item => item.en.toLowerCase()));
    const next = data.words.find(item => !used.has(item.en.toLowerCase()));
    if (next) current[index] = next;
    else current.splice(index, 1);
    render();
  }
  await loadChildren(childId);
  show(`บันทึกว่า ${children.find(child => child.id === childId)?.name || "ผู้เรียน"} จำคำว่า ${word.en} ได้แล้ว`);
}

async function replaceOne(index) {
  const data = await getWords("random", 80);
  const used = new Set(current.map(word => word.en));
  const next = data.words.find(word => !used.has(word.en));
  if (!next) return show("ไม่พบคำใหม่ในเงื่อนไขนี้");
  current[index] = next;
  render();
}

function show(message) {
  $("#notice").textContent = message;
}

async function generateCards() {
  const requestId = ++generationRequest;
  const button = $("#randomBtn");
  button.disabled = true;
  show("กำลังสร้างการ์ด...");
  try {
    const data = await getWords("random", 10);
    if (requestId !== generationRequest) return;
    current = data.words;
    cardSource = "standard";
    render();
    show(current.length < 10 ? `เหลือคำที่ใช้ได้เพียง ${current.length} คำ ลองเปลี่ยนหมวดหรือปิดโหมดไม่ซ้ำ` : "");
  } catch (error) {
    if (requestId === generationRequest) show("สร้างการ์ดไม่สำเร็จ กรุณาลองอีกครั้ง");
    console.error(error);
  } finally {
    if (requestId === generationRequest) button.disabled = false;
  }
}

$("#randomBtn").onclick = generateCards;
[$("#grade"), $("#category"), $("#noRepeat"), $("#hideRemembered")].forEach(control => control.onchange = generateCards);
$("#theme").onchange = render;

async function openWordPicker() {
  const data = await getWords("all", 100);
  pickerWords = data.words;
  selected.clear();
  $("#search").value = "";
  drawPicker();
  $("#picker").showModal();
}

$("#manualBtn").onclick = openWordPicker;

function pickerWordId(word) {
  return `${word.source || "built_in"}:${word.id || ""}:${word.en}:${word.th}`;
}

function drawPicker() {
  const query = $("#search").value.toLowerCase().trim();
  const list = $("#wordList");
  list.replaceChildren();
  pickerWords
    .filter(word => !query || word.en.toLowerCase().includes(query) || word.th.includes(query))
    .forEach(word => {
      const id = pickerWordId(word);
      const item = document.createElement("label");
      item.className = "word-item";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selected.has(id);
      const text = document.createElement("span");
      const english = document.createElement("b");
      english.textContent = word.en;
      text.append(english, document.createElement("br"), document.createTextNode(word.th));
      if (word.source === "custom") {
        const badge = document.createElement("small");
        badge.className = "custom-word-badge";
        badge.textContent = "ผู้ปกครองเพิ่ม";
        text.append(document.createElement("br"), badge);
      }
      checkbox.onchange = event => {
        if (event.target.checked && selected.size < 10) selected.add(id);
        else if (!event.target.checked) selected.delete(id);
        else event.target.checked = false;
        updateCount();
      };
      item.append(checkbox, text);
      list.appendChild(item);
    });
  updateCount();
}

function updateCount() {
  $("#selectedCount").textContent = selected.size;
  $("#useSelected").disabled = selected.size !== 10;
}

$("#search").oninput = drawPicker;
$("#closePicker").onclick = () => $("#picker").close();
$("#useSelected").onclick = () => {
  current = [...selected].map(id => pickerWords.find(word => pickerWordId(word) === id));
  cardSource = "standard";
  $("#picker").close();
  render();
};

function customRow(word = {}) {
  const row = document.createElement("tr");
  const numberCell = document.createElement("td");
  numberCell.className = "row-number";

  const fields = [
    ["en", "เช่น butterfly"],
    ["th", "เช่น ผีเสื้อ"],
    ["pronunciation", "เช่น ˈbʌtərˌflaɪ หรือ บัท-เทอะ-ฟลาย"],
  ];
  const cells = fields.map(([name, placeholder]) => {
    const cell = document.createElement("td");
    const input = document.createElement("input");
    input.dataset.field = name;
    input.placeholder = placeholder;
    input.value = word[name] || "";
    input.autocomplete = "off";
    input.oninput = () => {
      input.classList.remove("invalid");
      updateCustomState();
    };
    cell.appendChild(input);
    return cell;
  });

  const actionCell = document.createElement("td");
  const remove = document.createElement("button");
  remove.className = "remove-custom-row";
  remove.type = "button";
  remove.title = "ลบคำนี้";
  remove.textContent = "✕";
  remove.onclick = () => {
    row.remove();
    renumberCustomRows();
    updateCustomState();
  };
  actionCell.appendChild(remove);
  row.append(numberCell, ...cells, actionCell);
  return row;
}

function renumberCustomRows() {
  [...$("#customRows").children].forEach((row, index) => {
    row.querySelector(".row-number").textContent = index + 1;
  });
}

function setCustomRows(words = []) {
  const body = $("#customRows");
  body.replaceChildren();
  words.forEach(word => body.appendChild(customRow(word)));
  while (body.children.length < 3) body.appendChild(customRow());
  renumberCustomRows();
  updateCustomState();
}

function customEntries() {
  return [...$("#customRows").children].map(row => ({
    en: row.querySelector('[data-field="en"]').value.trim(),
    pronunciation: row.querySelector('[data-field="pronunciation"]').value.trim().replace(/^\/+|\/+$/g, ""),
    th: row.querySelector('[data-field="th"]').value.trim(),
    row,
  }));
}

function updateCustomState() {
  const entries = customEntries();
  const complete = entries.filter(word => word.en && word.th).length;
  const partial = entries.some(word => (word.en || word.th || word.pronunciation) && !(word.en && word.th));
  $("#customCount").textContent = complete;
  $("#saveCustomWords").disabled = complete === 0 || partial;
  $("#addCustomRow").disabled = entries.length >= 500;
}

function customMessage(message, type = "") {
  const notice = $("#customNotice");
  notice.className = `custom-notice ${type}`.trim();
  notice.textContent = message;
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function wordsFromCSV(text) {
  const rows = parseCSV(text).filter(row => row.some(value => value.trim()));
  if (rows.length < 2) throw new Error("ไฟล์ CSV ไม่มีข้อมูลคำศัพท์");
  const headers = rows[0].map(value => value.trim().toLowerCase());
  const findHeader = names => headers.findIndex(header => names.includes(header));
  const english = findHeader(["english", "en", "word"]);
  const thai = findHeader(["thai", "th", "meaning"]);
  const pronunciation = findHeader(["pronunciation", "ipa", "reading"]);
  if (english < 0 || thai < 0) throw new Error("CSV ต้องมีคอลัมน์ english และ thai");
  return rows.slice(1).map(columns => ({
    en: (columns[english] || "").trim(),
    th: (columns[thai] || "").trim(),
    pronunciation: pronunciation >= 0 ? (columns[pronunciation] || "").trim() : "",
  })).filter(word => word.en || word.th || word.pronunciation);
}

function wordsFromPastedText(text) {
  const words = [];
  const invalidLines = [];
  text.replace(/^\uFEFF/, "").split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    const comma = line.indexOf(",");
    const en = comma >= 0 ? line.slice(0, comma).trim() : "";
    const th = comma >= 0 ? line.slice(comma + 1).trim() : "";
    if (!en || !th) invalidLines.push(index + 1);
    else words.push({en, th, pronunciation: ""});
  });
  if (invalidLines.length) {
    throw new Error(`รูปแบบไม่ถูกต้องที่บรรทัด ${invalidLines.join(", ")} กรุณาใช้ คำศัพท์, คำแปล`);
  }
  if (!words.length) throw new Error("กรุณาวางคำศัพท์อย่างน้อย 1 บรรทัด");
  return words;
}

$("#importPastedWords").onclick = () => {
  try {
    const imported = wordsFromPastedText($("#pastedWords").value);
    const existing = customEntries()
      .filter(word => word.en || word.th || word.pronunciation)
      .map(({en, th, pronunciation}) => ({en, th, pronunciation}));
    if (existing.length + imported.length > 500) {
      throw new Error("บันทึกได้สูงสุดครั้งละ 500 คำ");
    }
    setCustomRows([...existing, ...imported]);
    $("#pastedWords").value = "";
    customMessage(`เพิ่ม ${imported.length} คำจากข้อความลงตารางแล้ว ตรวจสอบก่อนบันทึก`, "success");
  } catch (error) {
    customMessage(error.message, "error");
  }
};

$("#csvFile").onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const imported = wordsFromCSV(await file.text());
    if (imported.length > 500) throw new Error("นำเข้าได้สูงสุดครั้งละ 500 คำ");
    setCustomRows(imported);
    customMessage(`นำเข้า ${imported.length} คำจาก ${file.name} แล้ว ตรวจสอบข้อมูลก่อนบันทึก`, "success");
  } catch (error) {
    customMessage(error.message, "error");
  } finally {
    event.target.value = "";
  }
};

$("#addCustomRow").onclick = () => {
  if ($("#customRows").children.length >= 500) return;
  $("#customRows").appendChild(customRow());
  renumberCustomRows();
  updateCustomState();
};

$("#clearCustomRows").onclick = () => {
  setCustomRows();
  customMessage("ล้างข้อมูลแล้ว พร้อมเริ่มชุดใหม่");
};

$("#saveCustomWords").onclick = async () => {
  const entries = customEntries().filter(word => word.en || word.th || word.pronunciation);
  let invalid = false;
  entries.forEach(word => {
    ["en", "th"].forEach(field => {
      const input = word.row.querySelector(`[data-field="${field}"]`);
      if (!word[field]) {
        input.classList.add("invalid");
        invalid = true;
      }
    });
  });
  if (!entries.length || invalid) return customMessage("กรุณากรอกคำศัพท์อังกฤษและคำแปลไทยในทุกแถวที่ใช้งาน", "error");

  const button = $("#saveCustomWords");
  button.disabled = true;
  customMessage("กำลังบันทึกคำศัพท์...", "");
  try {
    const response = await fetch("/api/custom-words", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({words: entries.map(({en, th, pronunciation}) => ({en, th, pronunciation}))}),
    });
    const result = await response.json();
    if (!response.ok) {
      if (result.row && entries[result.row - 1]) {
        entries[result.row - 1].row.querySelector('[data-field="pronunciation"]').classList.add("invalid");
      }
      throw new Error(result.error || "บันทึกคำศัพท์ไม่สำเร็จ");
    }
    setCustomRows();
    await loadCustomLibrary();
    customMessage(`บันทึกคำศัพท์จากผู้ปกครอง ${result.saved} คำแล้ว`, "success");
  } catch (error) {
    customMessage(error.message || "บันทึกคำศัพท์ไม่สำเร็จ กรุณาลองอีกครั้ง", "error");
    console.error(error);
  } finally {
    updateCustomState();
  }
};

async function loadCustomLibrary() {
  const box = $("#customLibrary");
  const response = await fetch("/api/custom-words");
  const words = await response.json();
  $("#savedCustomCount").textContent = words.length;
  box.replaceChildren();
  if (!words.length) {
    const empty = document.createElement("p");
    empty.className = "empty-library";
    empty.textContent = "ยังไม่มีคำศัพท์ที่เพิ่มเอง";
    box.appendChild(empty);
    return;
  }
  words.forEach(word => {
    const item = document.createElement("div");
    item.className = "custom-library-item";
    const text = document.createElement("div");
    const english = document.createElement("b");
    english.textContent = word.en;
    const details = document.createElement("span");
    details.textContent = `/${word.pronunciation}/ · ${word.th}`;
    text.append(english, details);
    const remove = document.createElement("button");
    remove.className = "remove-custom-row";
    remove.textContent = "ลบ";
    remove.onclick = async () => {
      if (!confirm(`ลบคำว่า ${word.en} ออกจากคลังหรือไม่?`)) return;
      const deleted = await fetch(`/api/custom-words/${word.id}`, {method: "DELETE"});
      if (deleted.ok) loadCustomLibrary();
    };
    item.append(text, remove);
    box.appendChild(item);
  });
}

function activeChildId() {
  const value = Number($("#childSelect")?.value);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function storedChildId() {
  try {
    return Number(localStorage.getItem("activeChildId")) || null;
  } catch {
    return null;
  }
}

function storeChildId(childId) {
  try {
    localStorage.setItem("activeChildId", String(childId));
  } catch {
    // The selector still works when private browsing blocks local storage.
  }
}

async function loadChildren(preferredId = null) {
  const response = await fetch("/api/children");
  children = await response.json();
  const select = $("#childSelect");
  const requested = preferredId || activeChildId() || storedChildId();
  const active = children.find(child => child.id === requested) || children[0];
  select.replaceChildren();
  children.forEach(child => {
    const option = document.createElement("option");
    option.value = child.id;
    option.textContent = `${child.name} · จำได้ ${child.remembered_count} คำ`;
    select.appendChild(option);
  });
  if (active) {
    select.value = active.id;
    storeChildId(active.id);
  }
  renderChildrenList();
  return active;
}

function profileMessage(message, type = "") {
  const notice = $("#profileNotice");
  notice.className = `custom-notice ${type}`.trim();
  notice.textContent = message;
}

function renderChildrenList() {
  const box = $("#childrenList");
  if (!box) return;
  box.replaceChildren();
  children.forEach(child => {
    const item = document.createElement("div");
    item.className = `child-item${child.id === activeChildId() ? " active" : ""}`;
    const name = document.createElement("input");
    name.value = child.name;
    name.maxLength = 80;
    name.setAttribute("aria-label", `ชื่อผู้เรียน ${child.name}`);
    name.onchange = async () => {
      const value = name.value.trim();
      if (!value) {
        name.value = child.name;
        return;
      }
      const response = await fetch(`/api/children/${child.id}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({name: value}),
      });
      if (response.ok) {
        await loadChildren(child.id === activeChildId() ? child.id : activeChildId());
        profileMessage("แก้ไขชื่อผู้เรียนแล้ว", "success");
      }
    };
    const choose = document.createElement("button");
    choose.className = "select-child";
    choose.textContent = child.id === activeChildId() ? "กำลังใช้" : "เลือก";
    choose.disabled = child.id === activeChildId();
    choose.onclick = () => switchChild(child.id);
    const remove = document.createElement("button");
    remove.className = "delete-child";
    remove.textContent = "ลบ";
    remove.onclick = async () => {
      if (!confirm(`ลบผู้เรียน ${child.name} และรายการคำที่จำได้ทั้งหมดหรือไม่?`)) return;
      const response = await fetch(`/api/children/${child.id}`, {method: "DELETE"});
      const result = await response.json();
      if (!response.ok) return profileMessage(result.error, "error");
      const active = await loadChildren();
      await loadRemembered();
      await generateCards();
      profileMessage(`ลบ ${child.name} แล้ว เปลี่ยนเป็น ${active.name}`, "success");
    };
    item.append(name, choose, remove);
    box.appendChild(item);
  });
}

async function switchChild(childId) {
  $("#childSelect").value = childId;
  storeChildId(childId);
  renderChildrenList();
  await loadRemembered();
  await generateCards();
  const child = children.find(item => item.id === childId);
  profileMessage(`กำลังใช้รายการคำของ ${child?.name || "ผู้เรียน"}`, "success");
}

async function loadRemembered() {
  const childId = activeChildId();
  const child = children.find(item => item.id === childId);
  $("#rememberedChildName").textContent = child?.name || "ผู้เรียน";
  const box = $("#rememberedList");
  box.replaceChildren();
  if (!childId) return;
  const response = await fetch(`/api/remembered?child_id=${childId}`);
  const words = await response.json();
  $("#rememberedCount").textContent = words.length;
  if (!words.length) {
    const empty = document.createElement("p");
    empty.className = "empty-library";
    empty.textContent = "ยังไม่มีคำที่บันทึกว่าจำได้";
    box.appendChild(empty);
    return;
  }
  words.forEach(word => {
    const item = document.createElement("div");
    item.className = "remembered-item";
    const text = document.createElement("div");
    const english = document.createElement("b");
    english.textContent = word.word_en;
    const thai = document.createElement("span");
    thai.textContent = word.word_th;
    text.append(english, thai);
    const restore = document.createElement("button");
    restore.className = "restore-word";
    restore.textContent = "นำกลับมาใช้";
    restore.onclick = async () => {
      const response = await fetch("/api/remembered", {
        method: "DELETE",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({child_id: childId, word_en: word.word_en}),
      });
      if (response.ok) {
        await loadChildren(childId);
        await loadRemembered();
        await generateCards();
        profileMessage(`นำคำว่า ${word.word_en} กลับมาใช้แล้ว`, "success");
      }
    };
    item.append(text, restore);
    box.appendChild(item);
  });
}

async function loadProfiles() {
  await loadChildren(activeChildId());
  await loadRemembered();
}

$("#childSelect").onchange = () => switchChild(activeChildId());
$("#manageChildren").onclick = () => activateTab("profiles");
$("#addChildForm").onsubmit = async event => {
  event.preventDefault();
  const input = $("#newChildName");
  const response = await fetch("/api/children", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({name: input.value.trim()}),
  });
  const result = await response.json();
  if (!response.ok) return profileMessage(result.error, "error");
  input.value = "";
  await loadChildren(result.id);
  await loadRemembered();
  await generateCards();
  profileMessage(`เพิ่มผู้เรียน ${result.name} แล้ว`, "success");
};

$("#printBtn").onclick = async () => {
  if (current.length !== 10) return show("กรุณาเตรียมคำศัพท์ให้ครบ 10 คำก่อนพิมพ์");
  await fetch("/api/print", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      grade: $("#grade").value,
      category: cardSource === "custom" ? "custom" : $("#category").value,
      child_id: activeChildId(),
      words: current,
    }),
  });
  window.print();
};

async function loadHistory() {
  const rows = await (await fetch("/api/history")).json();
  const box = $("#historyList");
  box.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.textContent = "ยังไม่มีประวัติการพิมพ์";
    box.appendChild(empty);
    return;
  }

  rows.forEach(record => {
    const card = document.createElement("div");
    card.className = "history-card";
    const title = document.createElement("b");
    const setLabel = record.category === "custom" ? "คำศัพท์จากผู้ปกครอง" : `ป.${record.grade} · ${record.category === "all" ? "ทุกหมวด" : record.category}`;
    title.textContent = record.child_name ? `${record.child_name} · ${setLabel}` : setLabel;
    const date = document.createElement("small");
    date.textContent = new Date(record.printed_at).toLocaleString("th-TH");
    const chips = document.createElement("div");
    chips.className = "chips";
    record.words.forEach(word => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = `${word.en} — ${word.th}`;
      chips.appendChild(chip);
    });
    card.append(title, document.createElement("br"), date, chips);

    if (record.category !== "custom") {
      const reuse = document.createElement("button");
      reuse.className = "reuse";
      reuse.textContent = "อนุญาตให้ใช้คำชุดนี้ซ้ำ";
      reuse.onclick = async () => {
        await fetch("/api/reuse", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({grade: record.grade, words: record.words.map(word => word.en)}),
        });
        reuse.textContent = "นำกลับมาใช้ได้แล้ว";
        reuse.disabled = true;
      };
      card.appendChild(reuse);
    }
    box.appendChild(card);
  });
}

$("#clearHistory").onclick = async () => {
  if (!confirm("ล้างประวัติและรายการคำที่เคยพิมพ์ทั้งหมดหรือไม่?")) return;
  await fetch("/api/history", {method: "DELETE"});
  loadHistory();
};

async function initialize() {
  setCustomRows();
  await loadChildren();
  await generateCards();
}

initialize().catch(error => {
  console.error(error);
  show("เริ่มต้นแอปไม่สำเร็จ กรุณารีเฟรชหน้าอีกครั้ง");
});
