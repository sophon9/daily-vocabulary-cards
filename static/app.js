const $ = s => document.querySelector(s);
let current = [], pickerWords = [], selected = new Set();

document.querySelectorAll(".tab").forEach(btn => btn.onclick = () => {
  document.querySelectorAll(".tab,.panel").forEach(x => x.classList.remove("active"));
  btn.classList.add("active");
  $("#" + btn.dataset.tab).classList.add("active");
  if (btn.dataset.tab === "history") loadHistory();
});

function params(mode="random", limit=10){
  return new URLSearchParams({grade:$("#grade").value,category:$("#category").value,no_repeat:$("#noRepeat").checked,mode,limit});
}
async function getWords(mode="random", limit=10){ const r=await fetch("/api/words?"+params(mode,limit)); return r.json(); }
function render(){
  const box=$("#cards"); box.className="cards "+$("#theme").value; box.innerHTML="";
  current.forEach((w,i)=>{ const el=document.createElement("div"); el.className="card"; el.innerHTML=`<button class="replace" title="เปลี่ยนคำนี้">↻ เปลี่ยน</button><div><div class="en">${w.en}</div><div class="th">${w.th}</div></div>`; el.querySelector(".replace").onclick=()=>replaceOne(i); box.appendChild(el); });
}
async function replaceOne(i){ const data=await getWords("random",80); const used=new Set(current.map(w=>w.en)); const next=data.words.find(w=>!used.has(w.en)); if(!next)return show("ไม่พบคำใหม่ในเงื่อนไขนี้"); current[i]=next; render(); }
function show(msg){ $("#notice").textContent=msg; }
$("#randomBtn").onclick=async()=>{ const data=await getWords("random",10); current=data.words; render(); show(current.length<10?`เหลือคำที่ใช้ได้เพียง ${current.length} คำ ลองเปลี่ยนหมวดหรือปิดโหมดไม่ซ้ำ`:""); };
$("#theme").onchange=render;
$("#manualBtn").onclick=async()=>{ const data=await getWords("all",100); pickerWords=data.words; selected.clear(); $("#search").value=""; drawPicker(); $("#picker").showModal(); };
function drawPicker(){
  const q=$("#search").value.toLowerCase().trim(),list=$("#wordList"); list.innerHTML="";
  pickerWords.filter(w=>!q||w.en.toLowerCase().includes(q)||w.th.includes(q)).forEach(w=>{ const id=`${w.en}|${w.th}`,item=document.createElement("label"); item.className="word-item"; item.innerHTML=`<input type="checkbox" ${selected.has(id)?"checked":""}><span><b>${w.en}</b><br>${w.th}</span>`; item.querySelector("input").onchange=e=>{ if(e.target.checked&&selected.size<10)selected.add(id); else if(!e.target.checked)selected.delete(id); else e.target.checked=false; updateCount(); }; list.appendChild(item); }); updateCount();
}
function updateCount(){ $("#selectedCount").textContent=selected.size; $("#useSelected").disabled=selected.size!==10; }
$("#search").oninput=drawPicker; $("#closePicker").onclick=()=>$("#picker").close();
$("#useSelected").onclick=()=>{ current=[...selected].map(id=>{ const [en,th]=id.split("|"); return pickerWords.find(w=>w.en===en&&w.th===th); }); $("#picker").close(); render(); };
$("#printBtn").onclick=async()=>{ if(current.length!==10)return show("กรุณาเตรียมคำศัพท์ให้ครบ 10 คำก่อนพิมพ์"); await fetch("/api/print",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({grade:$("#grade").value,category:$("#category").value,words:current})}); window.print(); };
async function loadHistory(){
  const rows=await(await fetch("/api/history")).json(),box=$("#historyList"); if(!rows.length){box.innerHTML="<p>ยังไม่มีประวัติการพิมพ์</p>";return;}
  box.innerHTML=rows.map(r=>`<div class="history-card"><b>ป.${r.grade} · ${r.category==="all"?"ทุกหมวด":r.category}</b><br><small>${new Date(r.printed_at).toLocaleString("th-TH")}</small><div class="chips">${r.words.map(w=>`<span class="chip">${w.en} — ${w.th}</span>`).join("")}</div><button class="reuse" data-grade="${r.grade}" data-words='${JSON.stringify(r.words.map(w=>w.en))}'>อนุญาตให้ใช้คำชุดนี้ซ้ำ</button></div>`).join("");
  document.querySelectorAll(".reuse").forEach(btn=>btn.onclick=async()=>{ await fetch("/api/reuse",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({grade:btn.dataset.grade,words:JSON.parse(btn.dataset.words)})}); btn.textContent="นำกลับมาใช้ได้แล้ว"; btn.disabled=true; });
}
$("#clearHistory").onclick=async()=>{ if(!confirm("ล้างประวัติและรายการคำที่เคยพิมพ์ทั้งหมดหรือไม่?"))return; await fetch("/api/history",{method:"DELETE"}); loadHistory(); };
$("#randomBtn").click();
