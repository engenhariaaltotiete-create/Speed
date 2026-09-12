
async function generateEvaluationPDF(record){
  if(!window.jspdf?.jsPDF) throw new Error('Biblioteca de PDF indisponível. Conecte-se à internet ao menos uma vez para carregá-la.');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'mm',format:'a4'});
  const W=210,H=297,M=14;
  const navy=[23,21,61], yellow=[246,201,40], green=[22,128,60], red=[198,40,40], gray=[100,100,110];
  let y=26;

  const addHeader=()=>{
    doc.setFillColor(...navy); doc.rect(0,0,W,20,'F');
    try{ doc.addImage('assets/logo.jpg','JPEG',M,4,30,12); }catch(e){}
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(11);
    doc.text('RELATÓRIO DE AVALIAÇÃO DE VEÍCULO USADO', W-M, 11, {align:'right'});
    doc.setTextColor(0,0,0);
  };
  const addFooter=()=>{
    const page=doc.internal.getCurrentPageInfo().pageNumber;
    const total=doc.internal.getNumberOfPages();
    doc.setDrawColor(220); doc.line(M,H-14,W-M,H-14);
    doc.setFontSize(7.5); doc.setTextColor(...gray);
    doc.text('Speed Multimarcas • Av. Antonio Marques Figueira, 149 • Suzano/SP • (11) 4747-8724 • CNPJ 35.649.942/0001-80',M,H-9);
    doc.text(`Página ${page} de ${total}`,W-M,H-9,{align:'right'});
  };
  const need=(h=10)=>{
    if(y+h>H-20){ doc.addPage(); addHeader(); y=28; }
  };
  const section=(title)=>{
    need(12); doc.setFillColor(...navy); doc.roundedRect(M,y,W-2*M,8,2,2,'F');
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(9);
    doc.text(title,M+3,y+5.3); doc.setTextColor(0,0,0); y+=12;
  };
  const line=(label,value,kind='neutral')=>{
    need(7);
    doc.setFontSize(8.5); doc.setTextColor(40,40,45); doc.setFont('helvetica','normal');
    doc.text(`${label}:`,M,y);
    const x=M+45;
    if(kind==='good') doc.setTextColor(...green);
    else if(kind==='bad') doc.setTextColor(...red);
    else if(kind==='warn') doc.setTextColor(183,121,0);
    else doc.setTextColor(20,20,20);
    doc.setFont('helvetica', kind==='neutral'?'normal':'bold');
    const text=String(value||'-');
    doc.text(doc.splitTextToSize(text,W-M-x),x,y);
    y+=6;
  };
  const statusKind=(v)=>{
    const s=String(v||'').toLowerCase();
    if(['ok','normal','bom','excelente','presente','não','nao'].includes(s)) return 'good';
    if(['avaria','problema','anormal','ruim','sim','ausente','acesa'].includes(s)) return 'bad';
    if(['regular','atenção','atencao'].includes(s)) return 'warn';
    return 'neutral';
  };

  addHeader();

  const v=record.data||{};
  section('Resumo');
  line('Veículo',[v.brand,v.model,v.version].filter(Boolean).join(' '));
  line('Placa',v.plate);
  line('Ano',v.year);
  line('Quilometragem',v.mileage?`${Number(v.mileage).toLocaleString('pt-BR')} km`:'-');
  line('Classificação geral',v.overallRating,statusKind(v.overallRating));
  line('Valor sugerido',v.suggestedPurchaseValue||'-');

  section('Checklist');
  for(const group of ['bodywork','interior','mechanical']){
    const items=record.checklist?.[group]||{};
    Object.values(items).forEach(item=>{
      line(item.label,item.value,statusKind(item.value));
      if(item.note) line('Observação',item.note,'neutral');
    });
  }

  section('Avaliação comercial');
  ['referenceValue','requestedValue','bodyworkCost','mechanicalCost','tiresCost','otherCost','totalCost','suggestedPurchaseValue','finalNotes'].forEach(k=>{
    const labels={
      referenceValue:'Valor FIPE / referência',requestedValue:'Valor solicitado',bodyworkCost:'Funilaria / pintura',
      mechanicalCost:'Mecânica',tiresCost:'Pneus',otherCost:'Outros custos',totalCost:'Custo total de preparação',
      suggestedPurchaseValue:'Valor sugerido para compra',finalNotes:'Observações finais'
    };
    line(labels[k],v[k]||'-');
  });

  const photos=[...(record.photos||[]),...(record.extraPhotos||[])];
  if(photos.length){
    doc.addPage(); addHeader(); y=28; section('Registro fotográfico');
    let col=0;
    for(const p of photos){
      need(62);
      const x=M + col*91;
      try{ doc.addImage(p.dataUrl,'JPEG',x,y,86,48); }catch(e){}
      doc.setFontSize(7.5); doc.setTextColor(60);
      doc.text(doc.splitTextToSize(p.label||'Foto',86),x,y+53);
      col++;
      if(col===2){ col=0; y+=60; }
    }
    if(col===1) y+=60;
  }

  const pages=doc.internal.getNumberOfPages();
  for(let i=1;i<=pages;i++){ doc.setPage(i); addFooter(); }

  const safePlate=(v.plate||'sem-placa').replace(/[^a-z0-9]/gi,'-');
  doc.save(`avaliacao-${safePlate}.pdf`);
}
