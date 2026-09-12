
const COMPANY = {
  name:'Speed Multimarcas',
  address:'Av. Antonio Marques Figueira, 149 - Suzano/SP',
  phone:'(11) 4747-8724',
  cnpj:'35.649.942/0001-80'
};

const BODYWORK = [
  'Para-choque dianteiro','Capô','Lateral dianteira esquerda','Porta dianteira esquerda',
  'Porta traseira esquerda','Lateral traseira esquerda','Tampa do porta-malas','Para-choque traseiro',
  'Lateral traseira direita','Porta traseira direita','Porta dianteira direita','Lateral dianteira direita','Teto'
];
const INTERIOR = [
  'Bancos e revestimentos','Painel e acabamento','Forro do teto','Ar-condicionado',
  'Vidros e travas elétricas','Multimídia / rádio','Câmera / sensor de estacionamento','Luzes de advertência no painel'
];
const MECHANICAL = [
  'Motor em funcionamento','Ruído anormal do motor','Vazamento aparente','Câmbio / embreagem',
  'Direção','Suspensão / ruídos','Freios','Pneus dianteiros','Pneus traseiros','Rodas','Estepe','Macaco e chave de roda','Chave reserva','Manual'
];
const PHOTO_SLOTS = [
  'Dianteira 45° esquerda','Traseira 45° esquerda','Traseira 45° direita','Dianteira 45° direita',
  'Painel completo','Quilometragem com veículo ligado','Bancos dianteiros','Bancos traseiros','Porta-malas','Compartimento do motor'
];

let currentTab='active';
let currentRecord=null;
let deferredInstallPrompt=null;
let saveTimer=null;

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];

document.addEventListener('DOMContentLoaded', init);

async function init(){
  buildChecklist();
  buildPhotoSlots();
  bindUI();
  await renderList();
  updateStorageInfo();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(console.error);
}

function newRecord(){
  return {
    id: crypto.randomUUID(),
    formatVersion:'1.0',
    status:'active',
    createdAt:new Date().toISOString(),
    updatedAt:new Date().toISOString(),
    data:{},
    checklist:{bodywork:{},interior:{},mechanical:{}},
    photos:[],
    extraPhotos:[]
  };
}

function checklistOptions(group,label){
  if(group==='bodywork') return ['OK','Avaria'];
  if(group==='interior'){
    if(label==='Luzes de advertência no painel') return ['Normal','Acesa'];
    if(['Vidros e travas elétricas','Multimídia / rádio','Câmera / sensor de estacionamento'].includes(label)) return ['OK','Problema','N/A'];
    return ['OK','Avaria'];
  }
  if(['Pneus dianteiros','Pneus traseiros'].includes(label)) return ['Bom','Regular','Ruim'];
  if(label==='Rodas') return ['OK','Avaria'];
  if(label==='Estepe') return ['OK','Ruim','Ausente'];
  if(['Macaco e chave de roda','Chave reserva','Manual'].includes(label)) return ['Presente','Ausente'];
  if(['Ruído anormal do motor','Vazamento aparente'].includes(label)) return ['Não','Sim'];
  return ['Normal','Anormal'];
}

function buildChecklist(){
  const groups=[['bodywork',BODYWORK],['interior',INTERIOR],['mechanical',MECHANICAL]];
  for(const [group,items] of groups){
    const host=$(`#${group}Items`);
    host.innerHTML='';
    items.forEach((label,index)=>{
      const key=`${group}_${index}`;
      const item=document.createElement('div');
      item.className='check-item';
      item.dataset.group=group; item.dataset.key=key; item.dataset.label=label;
      item.innerHTML=`
        <div class="check-title">${label}</div>
        <div class="segmented">
          ${checklistOptions(group,label).map(o=>`<button type="button" data-value="${o}">${o}</button>`).join('')}
        </div>
        <div class="issue-fields">
          <input class="issue-note" placeholder="Observação (opcional)" />
        </div>`;
      host.appendChild(item);
    });
  }
}

function buildPhotoSlots(){
  const host=$('#photoGrid'); host.innerHTML='';
  PHOTO_SLOTS.forEach((label,index)=>{
    const card=document.createElement('div');
    card.className='photo-card'; card.dataset.index=index;
    card.innerHTML=`
      <label>
        <span>📷<br>${index+1}. ${label}</span>
        <input type="file" accept="image/*" capture="environment" hidden />
      </label>`;
    host.appendChild(card);
  });
}

function bindUI(){
  $('#newEvaluationBtn').addEventListener('click',()=>openRecord(newRecord()));
  $('#backBtn').addEventListener('click',async()=>{ await saveNow(); showHome(); });
  $('#searchInput').addEventListener('input',renderList);

  $$('.tab').forEach(btn=>btn.addEventListener('click',()=>{
    $$('.tab').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
    currentTab=btn.dataset.tab; renderList();
  }));

  $$('.accordion-head').forEach(h=>h.addEventListener('click',()=>h.parentElement.classList.toggle('open')));

  $('#evaluationForm').addEventListener('input',()=>scheduleSave());
  $('#evaluationForm').addEventListener('change',()=>scheduleSave());

  $$('.check-item .segmented button').forEach(btn=>btn.addEventListener('click',()=>{
    const item=btn.closest('.check-item');
    item.querySelectorAll('.segmented button').forEach(b=>b.className='');
    const kind=valueKind(btn.dataset.value);
    btn.classList.add('selected',kind);
    const bad=['bad','warn'].includes(kind);
    item.querySelector('.issue-fields').classList.toggle('visible',bad);
    scheduleSave();
  }));
  $$('.issue-note').forEach(i=>i.addEventListener('input',scheduleSave));

  $$('#photoGrid input[type=file]').forEach(input=>input.addEventListener('change',async e=>{
    if(!e.target.files[0]) return;
    const card=e.target.closest('.photo-card');
    const index=Number(card.dataset.index);
    const dataUrl=await compressImage(e.target.files[0]);
    const existing=(currentRecord.photos||[]).filter(p=>p.index!==index);
    existing.push({index,label:PHOTO_SLOTS[index],dataUrl});
    currentRecord.photos=existing;
    renderPhotos(); scheduleSave();
  }));

  $('#extraPhotoInput').addEventListener('change',async e=>{
    for(const file of [...e.target.files]){
      const dataUrl=await compressImage(file);
      currentRecord.extraPhotos.push({id:crypto.randomUUID(),label:'Avaria adicional',dataUrl});
    }
    e.target.value=''; renderPhotos(); scheduleSave();
  });

  $('#generatePdfBtn').addEventListener('click',()=>generateEvaluationPDF(collectRecord()));
  $('#archiveBtn').addEventListener('click',toggleArchive);

  $('#formMenuBtn').addEventListener('click',()=>$('#formMenu').classList.toggle('hidden'));
  $('#formMenu').addEventListener('click',async e=>{
    const action=e.target.dataset.action;if(!action)return;
    $('#formMenu').classList.add('hidden');
    if(action==='pdf') return generateEvaluationPDF(collectRecord());
    if(action==='json') return exportJson(collectRecord());
    if(action==='share') return shareJson(collectRecord());
    if(action==='archive') return toggleArchive();
    if(action==='delete') return deleteCurrent();
  });

  $('#importJsonInput').addEventListener('change',importJson);

  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault(); deferredInstallPrompt=e; $('#installBtn').classList.remove('hidden');
  });
  $('#installBtn').addEventListener('click',async()=>{
    if(!deferredInstallPrompt)return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt=null; $('#installBtn').classList.add('hidden');
  });
}

function valueKind(v){
  const s=String(v||'').toLowerCase();
  if(['ok','normal','bom','excelente','presente','não','nao'].includes(s)) return 'good';
  if(['avaria','problema','anormal','ruim','sim','ausente','acesa'].includes(s)) return 'bad';
  if(['regular','atenção','atencao'].includes(s)) return 'warn';
  return 'neutral';
}

async function openRecord(record){
  currentRecord=record;
  $('#homeView').classList.remove('active'); $('#formView').classList.add('active');
  loadForm(record);
  window.scrollTo({top:0,behavior:'instant'});
}

function showHome(){
  $('#formView').classList.remove('active'); $('#homeView').classList.add('active');
  currentRecord=null; renderList(); updateStorageInfo();
}

function loadForm(record){
  const form=$('#evaluationForm'); form.reset();
  [...form.elements].forEach(el=>{
    if(el.name && record.data?.[el.name]!==undefined) el.value=record.data[el.name] ?? '';
  });

  $$('.check-item').forEach(item=>{
    const saved=record.checklist?.[item.dataset.group]?.[item.dataset.key];
    item.querySelectorAll('.segmented button').forEach(b=>{
      b.className='';
      if(saved?.value===b.dataset.value) b.classList.add('selected',valueKind(saved.value));
    });
    const note=item.querySelector('.issue-note');
    note.value=saved?.note||'';
    note.closest('.issue-fields').classList.toggle('visible',!!saved?.note || ['bad','warn'].includes(valueKind(saved?.value)));
  });
  renderPhotos();
  updateFormUI();
}

function collectRecord(){
  if(!currentRecord) return null;
  const fd=new FormData($('#evaluationForm'));
  const data=Object.fromEntries(fd.entries());
  data.totalCost=$('#totalCost').value;
  const checklist={bodywork:{},interior:{},mechanical:{}};
  $$('.check-item').forEach(item=>{
    const selected=item.querySelector('.segmented button.selected');
    checklist[item.dataset.group][item.dataset.key]={
      label:item.dataset.label,
      value:selected?.dataset.value||'',
      note:item.querySelector('.issue-note').value.trim()
    };
  });
  currentRecord.data=data;
  currentRecord.checklist=checklist;
  currentRecord.updatedAt=new Date().toISOString();
  return currentRecord;
}

function scheduleSave(){
  calculateCosts();
  updateFormUI();
  clearTimeout(saveTimer);
  $('#saveIndicator').textContent='Salvando…';
  saveTimer=setTimeout(saveNow,450);
}

async function saveNow(){
  if(!currentRecord)return;
  collectRecord();
  await dbPut(currentRecord);
  $('#saveIndicator').textContent='Salvo neste dispositivo';
}

function calculateCosts(){
  const get=n=>parseMoney($(`[name="${n}"]`)?.value||'');
  const total=get('bodyworkCost')+get('mechanicalCost')+get('tiresCost')+get('otherCost');
  $('#totalCost').value=total?formatMoney(total):'';
}
function parseMoney(v){
  const s=String(v||'').replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',','.');
  return Number(s)||0;
}
function formatMoney(v){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v)}

function updateFormUI(){
  if(!currentRecord)return;
  const d=currentRecord.data||{};
  const title=[d.brand,d.model].filter(Boolean).join(' ')||d.plate||'Nova avaliação';
  $('#formVehicleTitle').textContent=title;
  const archived=currentRecord.status==='archived';
  $('#formStatusBadge').textContent=archived?'Arquivada':'Em andamento';
  $('#formStatusBadge').classList.toggle('archived',archived);
  $('#archiveBtn').textContent=archived?'Desarquivar':'Arquivar';
  const menuArchive=$('#formMenu [data-action="archive"]'); if(menuArchive) menuArchive.textContent=archived?'Desarquivar':'Arquivar';

  const requiredNames=['plate','brand','model','mileage'];
  const requiredDone=requiredNames.filter(n=>$(`[name="${n}"]`)?.value.trim()).length;
  const checklistItems=$$('.check-item');
  const checkDone=checklistItems.filter(i=>i.querySelector('.segmented button.selected')).length;
  const photosDone=(currentRecord.photos||[]).length;
  const total=requiredNames.length+checklistItems.length+PHOTO_SLOTS.length;
  const done=requiredDone+checkDone+photosDone;
  const pct=Math.round(done/total*100);
  $('#progressText').textContent=`${pct}%`;
  $('#progressBar').style.width=`${pct}%`;

  setSectionStatus('vehicle',requiredDone,requiredNames.length);
  setSectionStatus('bodywork', $$('#bodyworkItems .check-item').filter(i=>i.querySelector('.selected')).length, BODYWORK.length);
  setSectionStatus('interior', $$('#interiorItems .check-item').filter(i=>i.querySelector('.selected')).length, INTERIOR.length);
  setSectionStatus('mechanical', $$('#mechanicalItems .check-item').filter(i=>i.querySelector('.selected')).length, MECHANICAL.length);
  setSectionStatus('photos', photosDone, PHOTO_SLOTS.length);
  const commercialDone=['referenceValue','requestedValue','suggestedPurchaseValue','overallRating'].filter(n=>$(`[name="${n}"]`)?.value).length;
  setSectionStatus('commercial',commercialDone,4);
}

function setSectionStatus(section,done,total){
  const node=$(`.accordion[data-section="${section}"] .section-status`);
  node.textContent=done>=total?'Concluído':`${done}/${total} preenchidos`;
}

function renderPhotos(){
  const byIndex=new Map((currentRecord?.photos||[]).map(p=>[p.index,p]));
  $$('#photoGrid .photo-card').forEach(card=>{
    const i=Number(card.dataset.index); const p=byIndex.get(i);
    if(p){
      card.innerHTML=`<img src="${p.dataUrl}" alt="${p.label}"><button class="photo-remove" type="button">×</button><div class="photo-overlay">${i+1}. ${p.label}</div>`;
      card.querySelector('.photo-remove').addEventListener('click',()=>{
        currentRecord.photos=currentRecord.photos.filter(x=>x.index!==i);
        buildPhotoSlots(); bindPhotoInputsOnly(); renderPhotos(); scheduleSave();
      });
    }
  });
  const extra=$('#extraPhotoGrid'); extra.innerHTML='';
  (currentRecord?.extraPhotos||[]).forEach(p=>{
    const card=document.createElement('div');card.className='photo-card';
    card.innerHTML=`<img src="${p.dataUrl}" alt="${p.label}"><button class="photo-remove" type="button">×</button><div class="photo-overlay">${p.label}</div>`;
    card.querySelector('.photo-remove').addEventListener('click',()=>{currentRecord.extraPhotos=currentRecord.extraPhotos.filter(x=>x.id!==p.id);renderPhotos();scheduleSave();});
    extra.appendChild(card);
  });
  updateFormUI();
}

function bindPhotoInputsOnly(){
  $$('#photoGrid input[type=file]').forEach(input=>input.addEventListener('change',async e=>{
    if(!e.target.files[0])return;
    const card=e.target.closest('.photo-card'); const index=Number(card.dataset.index);
    const dataUrl=await compressImage(e.target.files[0]);
    currentRecord.photos=(currentRecord.photos||[]).filter(p=>p.index!==index);
    currentRecord.photos.push({index,label:PHOTO_SLOTS[index],dataUrl});
    renderPhotos(); scheduleSave();
  }));
}

async function compressImage(file){
  const dataUrl=await fileToDataUrl(file);
  const img=await loadImage(dataUrl);
  const max=1600, scale=Math.min(1,max/Math.max(img.width,img.height));
  const c=document.createElement('canvas'); c.width=Math.round(img.width*scale); c.height=Math.round(img.height*scale);
  c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  return c.toDataURL('image/jpeg',.78);
}
function fileToDataUrl(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(file)})}
function loadImage(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src})}

async function renderList(){
  const records=(await dbGetAll())
    .filter(r=>currentTab==='archived'?r.status==='archived':r.status!=='archived')
    .sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
  const q=$('#searchInput').value.trim().toLowerCase();
  const filtered=records.filter(r=>{
    const d=r.data||{};
    return [d.plate,d.brand,d.model,d.version,d.owner].join(' ').toLowerCase().includes(q);
  });
  const host=$('#evaluationList');host.innerHTML='';
  $('#emptyState').classList.toggle('hidden',filtered.length>0);
  filtered.forEach(r=>{
    const d=r.data||{};
    const title=[d.brand,d.model,d.version].filter(Boolean).join(' ')||'Avaliação sem identificação';
    const card=document.createElement('article');card.className='eval-card';
    card.innerHTML=`
      <div class="eval-card-top">
        <div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(d.plate||'Sem placa')} • ${formatDate(r.updatedAt)}</p></div>
        <span class="badge ${r.status==='archived'?'archived':''}">${r.status==='archived'?'Arquivada':'Em andamento'}</span>
      </div>
      <div class="eval-card-actions">
        <button class="btn btn-primary" data-open> Abrir </button>
        <button class="btn btn-secondary" data-pdf>PDF</button>
        <button class="btn btn-secondary" data-json>JSON</button>
        <button class="btn btn-secondary" data-archive>${r.status==='archived'?'Desarquivar':'Arquivar'}</button>
      </div>`;
    card.querySelector('[data-open]').onclick=()=>openRecord(r);
    card.querySelector('[data-pdf]').onclick=()=>generateEvaluationPDF(r);
    card.querySelector('[data-json]').onclick=()=>exportJson(r);
    card.querySelector('[data-archive]').onclick=async()=>{r.status=r.status==='archived'?'active':'archived';r.updatedAt=new Date().toISOString();await dbPut(r);renderList();};
    host.appendChild(card);
  });
}

async function toggleArchive(){
  if(!currentRecord)return;
  currentRecord.status=currentRecord.status==='archived'?'active':'archived';
  await saveNow(); updateFormUI(); toast(currentRecord.status==='archived'?'Avaliação arquivada.':'Avaliação desarquivada.');
}

async function deleteCurrent(){
  if(!currentRecord)return;
  if(!confirm('Excluir definitivamente esta avaliação? Esta ação não pode ser desfeita.'))return;
  await dbDelete(currentRecord.id); showHome(); toast('Avaliação excluída.');
}

function exportJson(record){
  const blob=new Blob([JSON.stringify(record,null,2)],{type:'application/json'});
  downloadBlob(blob,`avaliacao-${(record.data?.plate||'sem-placa').replace(/\W/g,'-')}.json`);
}

async function shareJson(record){
  const blob=new Blob([JSON.stringify(record,null,2)],{type:'application/json'});
  const file=new File([blob],`avaliacao-${record.data?.plate||'sem-placa'}.json`,{type:'application/json'});
  if(navigator.canShare?.({files:[file]})){
    await navigator.share({title:'Avaliação de veículo',text:'Arquivo JSON da avaliação.',files:[file]});
  }else{
    exportJson(record); toast('Compartilhamento direto indisponível. O JSON foi baixado.');
  }
}

async function importJson(e){
  const file=e.target.files[0]; if(!file)return;
  try{
    const obj=JSON.parse(await file.text());
    if(!obj.formatVersion || !obj.id) throw new Error('Arquivo incompatível');
    const imported={...obj,id:crypto.randomUUID(),updatedAt:new Date().toISOString(),createdAt:obj.createdAt||new Date().toISOString()};
    await dbPut(imported); toast('Avaliação importada com sucesso.'); renderList(); updateStorageInfo();
  }catch(err){alert('Não foi possível importar este arquivo JSON. Verifique se ele foi gerado pelo Speed Avaliação.')}
  e.target.value='';
}

function downloadBlob(blob,name){
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1200);
}

function formatDate(iso){
  try{return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(iso))}catch{return ''}
}
function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

function toast(msg){
  const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),2200);
}

async function updateStorageInfo(){
  if(!navigator.storage?.estimate){$('#storageInfo').textContent='Armazenamento local ativo';return;}
  const {usage=0,quota=0}=await navigator.storage.estimate();
  const fmt=n=>n>1024**3?`${(n/1024**3).toFixed(1)} GB`:`${(n/1024**2).toFixed(0)} MB`;
  const count=(await dbGetAll()).length;
  $('#storageInfo').textContent=`${count} avaliações • ${fmt(usage)} usados de ${fmt(quota)}`;
}
