(function(){
  'use strict';
  const data=window.ATLAS_DATA,Core=window.AtlasCore,config=window.ATLAS_CONFIG||{};
  const index=Core.createIndex(data,config.relationshipMode||'working');
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const color=c=>({Development:'#8570ce',Assets:'#90bf9c',Risks:'#32b7c2'}[c]||'#8b969b');
  const cls=c=>String(c||'').toLowerCase();
  const NS='http://www.w3.org/2000/svg';
  const svgNode=(tag,attrs={})=>{const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));return e;};
  const state={group:data.meta.default_group,layers:new Set(Core.CATEGORIES),selection:{kind:'point',id:data.meta.default_map_id},activeNote:null,tab:'note',scope:'location',examples:false,query:''};
  let mapEngine;

  class ReferenceMap{
    constructor(onSelect){
      this.onSelect=onSelect;this.el=$('map');this.svg=$('map-markers');this.img=$('reference-basemap');
      this.points=[];this.highlight=new Set();this.selected=null;this.scale=0;this.cx=0;this.cy=0;
      this.nw=Core.world(data.georef.nw[1],data.georef.nw[0]);this.se=Core.world(data.georef.se[1],data.georef.se[0]);
      new ResizeObserver(()=>{if(this.disabled)return;if(!this.scale||!this.userAdjusted)this.fit();else this.draw();}).observe(this.el);
      this.el.addEventListener('pointerdown',e=>{
        if(this.disabled)return;
        if(e.button!==0||e.target.closest('[data-map-id]'))return;
        this.userAdjusted=true;this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,cx:this.cx,cy:this.cy};this.el.setPointerCapture(e.pointerId);this.el.classList.add('dragging');
      });
      this.el.addEventListener('pointermove',e=>{
        if(this.disabled)return;
        if(this.drag){this.cx=this.drag.cx-(e.clientX-this.drag.x)/this.scale;this.cy=this.drag.cy-(e.clientY-this.drag.y)/this.scale;this.draw();this.hideTooltip();return;}
        const g=e.target.closest('[data-map-id]');if(g)this.tooltip(index.points.get(g.dataset.mapId),e.clientX,e.clientY);else this.hideTooltip();
      });
      const end=()=>{this.drag=null;this.el.classList.remove('dragging');};
      this.el.addEventListener('pointerup',end);this.el.addEventListener('pointercancel',end);this.el.addEventListener('pointerleave',()=>this.hideTooltip());
      this.el.addEventListener('wheel',e=>{if(this.disabled)return;e.preventDefault();const r=this.el.getBoundingClientRect();this.zoom(Math.pow(2,-e.deltaY/550),e.clientX-r.left,e.clientY-r.top);},{passive:false});
      this.svg.addEventListener('click',e=>{const g=e.target.closest('[data-map-id]');if(g)this.onSelect(g.dataset.mapId,false);});
      this.svg.addEventListener('keydown',e=>{const g=e.target.closest('[data-map-id]');if(g&&(e.key==='Enter'||e.key===' ')){e.preventDefault();this.onSelect(g.dataset.mapId,false);}});
      this.svg.addEventListener('focusin',e=>{const g=e.target.closest('[data-map-id]');if(g){const p=index.points.get(g.dataset.mapId),xy=this.screen(p),r=this.el.getBoundingClientRect();this.tooltip(p,r.left+xy.x,r.top+xy.y);}});
      this.svg.addEventListener('focusout',()=>this.hideTooltip());
    }
    setPoints(points,fit=false){this.points=points;if(fit||!this.scale)this.fit();else this.draw();}
    setHighlighted(ids,selected){this.highlight=new Set(ids);this.selected=selected;this.draw();}
    screen(p){const w=Core.world(p.lon,p.lat);return {x:(w.x-this.cx)*this.scale+this.el.clientWidth/2,y:(w.y-this.cy)*this.scale+this.el.clientHeight/2};}
    fit(){
      this.userAdjusted=false;
      const ps=this.points.length?this.points.map(p=>Core.world(p.lon,p.lat)):[this.nw,this.se];
      const xs=ps.map(p=>p.x),ys=ps.map(p=>p.y),a=Math.min(...xs),b=Math.max(...xs),c=Math.min(...ys),d=Math.max(...ys);
      this.cx=(a+b)/2;this.cy=(c+d)/2;
      this.scale=Math.min(Math.max(120,this.el.clientWidth-96)/Math.max(b-a,.000003),Math.max(120,this.el.clientHeight-100)/Math.max(d-c,.000003));
      this.baseScale=this.scale;this.draw();
    }
    focusPoint(p){this.userAdjusted=true;const w=Core.world(p.lon,p.lat);this.cx=w.x;this.cy=w.y;this.draw();}
    zoom(factor,x=this.el.clientWidth/2,y=this.el.clientHeight/2){
      if(!this.scale)return;this.userAdjusted=true;const wx=this.cx+(x-this.el.clientWidth/2)/this.scale,wy=this.cy+(y-this.el.clientHeight/2)/this.scale;
      this.scale=Math.max(this.baseScale/4,Math.min(this.baseScale*40,this.scale*factor));this.cx=wx-(x-this.el.clientWidth/2)/this.scale;this.cy=wy-(y-this.el.clientHeight/2)/this.scale;this.draw();
    }
    draw(){
      const w=this.el.clientWidth,h=this.el.clientHeight;if(!w||!h||!this.scale)return;
      const left=(this.nw.x-this.cx)*this.scale+w/2,top=(this.nw.y-this.cy)*this.scale+h/2;
      Object.assign(this.img.style,{left:left+'px',top:top+'px',width:(this.se.x-this.nw.x)*this.scale+'px',height:(this.se.y-this.nw.y)*this.scale+'px'});
      this.svg.setAttribute('viewBox',`0 0 ${w} ${h}`);this.svg.replaceChildren();
      const ordered=this.points.slice().sort((a,b)=>Number(a.id===this.selected)-Number(b.id===this.selected));
      for(const p of ordered){const xy=this.screen(p);const active=p.id===this.selected,related=this.highlight.has(p.id);const g=svgNode('g',{transform:`translate(${xy.x},${xy.y})`,class:`map-marker${active?' is-active':''}${related?' is-related':''}`,tabindex:0,role:'button','aria-label':`${p.name}, Group ${p.group}, ${p.category}`,'data-map-id':p.id});
        const title=svgNode('title');title.textContent=`${p.name} · Group ${p.group} · ${p.category}`;g.append(title,svgNode('circle',{r:11,class:'halo'}),svgNode('circle',{r:active?6.7:related?5.8:4.7,fill:color(p.category),class:'point'}));this.svg.append(g);
      }
    }
    tooltip(p,x,y){if(!p)return;const r=this.el.getBoundingClientRect(),tip=$('map-tooltip');tip.innerHTML=`${esc(p.name)}<small>Group ${esc(p.group)} · ${esc(p.category)}</small>`;tip.hidden=false;const left=Math.max(12,Math.min(r.width-245,x-r.left+13));tip.style.left=left+'px';tip.style.top=Math.max(50,Math.min(r.height-85,y-r.top-55))+'px';}
    hideTooltip(){$('map-tooltip').hidden=true;}
    destroy(){this.disabled=true;this.svg.hidden=true;this.img.hidden=true;this.hideTooltip();}
  }

  function currentPoint(){return state.selection?.kind==='point'?index.points.get(state.selection.id):null;}
  function currentTime(){return state.activeNote?index.notes.get(state.activeNote):state.selection?.kind==='time'?index.notes.get(state.selection.id):null;}
  function groupLabel(group){return group===Core.ALL_GROUPS?'All groups':`Group ${group}`;}
  function timelineGroup(){
    if(state.group!==Core.ALL_GROUPS)return state.group;
    return currentPoint()?.group??currentTime()?.group??null;
  }
  function relationsAtPoint(){const p=currentPoint();return p?Core.pointNotes(index,p.id):[];}
  function visible(){return Core.visiblePoints(data,state.group,state.layers);}
  function selectPoint(id,focus=false){
    const p=index.points.get(id);if(!p||!Core.matchesGroup(state.group,p.group))return;
    state.layers.add(p.category);state.selection={kind:'point',id};state.tab='note';
    const related=Core.pointNotes(index,id);if(!related.some(x=>x.note.id===state.activeNote))state.activeNote=related[0]?.note.id||null;
    state.query='';$('place-search').value='';$('search-results').hidden=true;
    render();if(focus)mapEngine.focusPoint(p);
  }
  function selectTime(id){
    const n=index.notes.get(id);if(!n||n.group!==timelineGroup())return;
    state.activeNote=id;state.tab='note';
    if(!relationsAtPoint().some(x=>x.note.id===id)){state.selection={kind:'time',id};state.scope='group';}
    render();
    if(matchMedia('(max-width:760px)').matches)$('detail-heading').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});
  }
  function renderSearch(){
    const query=state.query.trim().toLowerCase(),box=$('search-results');
    if(!query&&!state.examples){box.hidden=true;return;}
    let ps=visible().filter(p=>!state.examples||p.sample);
    if(query)ps=ps.filter(p=>[p.name,p.name_original,p.point_id,p.description].join(' ').toLowerCase().includes(query));
    ps=ps.slice(0,30);box.innerHTML=ps.length?ps.map(p=>`<button type="button" class="search-result" data-choose-point="${esc(p.id)}"><span class="dot ${cls(p.category)}"></span><span class="result-text"><strong>${esc(p.name)}</strong><small>Group ${esc(p.group)} · ${esc(p.category)} · ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</small></span></button>`).join(''):'<div class="no-results">No matching place in the current map selection.</div>';box.hidden=false;
  }
  function renderMap(fit=false){
    const ps=visible();mapEngine.setPoints(ps,fit);
    const n=currentTime(),p=currentPoint();const highlights=n?Core.notePoints(index,n.id,n.group).map(x=>x.point.id):[];
    mapEngine.setHighlighted(highlights,p?.id||null);
    const label=groupLabel(state.group);
    $('map-empty').hidden=ps.length>0;
    $('map-status').textContent=`${ps.length} mapped location${ps.length===1?'':'s'} · ${label}`;
    $('map-group-label').textContent=label;
    for(const c of Core.CATEGORIES){
      $('count-'+c).textContent=data.points.filter(p=>Core.matchesGroup(state.group,p.group)&&p.category===c).length;
      document.querySelector(`[data-layer="${c}"]`).setAttribute('aria-pressed',String(state.layers.has(c)));
    }
    $('group').value=state.group;
    $('place-search').placeholder=state.group===Core.ALL_GROUPS?'Find a place across all groups…':`Find a place in ${label}…`;
    $('sample-toggle').hidden=!Core.matchesGroup(state.group,'A');
    $('sample-toggle').setAttribute('aria-pressed',String(state.examples));
  }
  function timelineCard(n,r){return `<button type="button" class="related-note${n.id===state.activeNote?' is-current':''}" data-note-id="${esc(n.id)}"><span class="related-note-top"><span>${esc(n.id)} · ${esc(Core.date(n))}</span><span>${n.future?'Future / aspiration':esc(n.category)}</span></span><span class="related-note-text">${esc(n.text)}</span><span class="relation-label ${r.kind==='theme'?'is-theme':''}">${r.kind==='theme'?'Thematic background':'Location link'}${r.reviewed?'':' · working'}</span></button>`;}
  function emptyMedia(kind){return `<div class="empty-media"><span class="empty-symbol" aria-hidden="true">${kind==='photo'?'▧':'“ ”'}</span><strong>${kind==='photo'?'No photograph linked yet':'No interview excerpt linked yet'}</strong><p>${kind==='photo'?'A location photograph or a labelled workshop record can appear here.':'The original excerpt and its source can appear here when they are linked.'}</p></div>`;}
  function mediaContent(kind){
    const p=currentPoint(),n=currentTime();const ms=data.media.filter(m=>m.group===(p?.group??n?.group)&&m.kind===kind&&(p?m.map_id===p.id:m.note_id===n?.id));
    if(!ms.length)return emptyMedia(kind);
    return ms.map(m=>kind==='photo'?`<figure><img class="media-photo" src="${esc(m.url)}" alt="${esc(m.caption||'Linked location photograph')}"><figcaption class="media-caption">${esc(m.caption||'')}${m.source?' · '+esc(m.source):''}</figcaption></figure>`:`<div class="field-block"><div class="field-label">${esc(m.title||'Interview excerpt')}</div><blockquote class="interview-quote">${esc(m.excerpt||'')}</blockquote><p class="media-caption">${esc(m.source||'')}</p>${m.url?`<audio controls src="${esc(m.url)}"></audio>`:''}</div>`).join('');
  }
  function relatedLocations(n,exclude=null){
    const xs=Core.notePoints(index,n.id,n.group).filter(x=>x.point.id!==exclude);
    if(!xs.length)return '';
    return `<div class="linked-heading"><span>${exclude?'Shared with same-group locations':'Related locations'}</span><span class="linked-count">${xs.length}</span></div>${xs.map(x=>`<button class="related-location" type="button" data-choose-point="${esc(x.point.id)}">${esc(x.point.name)}<small>${esc(x.point.category)} · ${x.point.lat.toFixed(5)}, ${x.point.lon.toFixed(5)} · ${x.relation.kind==='theme'?'thematic background':'location link'}</small></button>`).join('')}`;
  }
  function renderDetail(){
    const p=currentPoint(),n=currentTime(),host=$('detail');
    if(!p&&!n){$('detail-heading').textContent='Location Details';$('selection-type').textContent='MAP LOCATION';host.innerHTML='<div class="detail-empty">Choose a visible place on the map to see its notes and timeline.</div>';return;}
    $('detail-heading').textContent=p?'Location Details':'Timeline Details';$('selection-type').textContent=p?'MAP LOCATION':'COMMUNITY ACCOUNT';
    const title=p?p.name:(n.topic&&n.topic.length<50?n.topic:`Timeline note ${n.id}`),original=p?p.name_original:`${n.id} · ${n.category}`;
    const prefix=`<h3 class="detail-title">${esc(title)}</h3><p class="detail-original">${esc(original)}</p><div class="breadcrumb">${p?`<span class="dot ${cls(p.category)}"></span>`:''}<span>${esc(groupLabel(p?.group??n.group))} <span aria-hidden="true">›</span> ${p?esc(p.category):'Timeline'}</span></div><div class="detail-tabs" role="tablist" aria-label="Location materials">${['note','interview','photo'].map(tab=>`<button type="button" role="tab" id="tab-${tab}" aria-controls="material-panel" aria-selected="${state.tab===tab}" data-material-tab="${tab}">${tab==='note'?'Note':tab==='interview'?'Interview':'Photo'}</button>`).join('')}</div>`;
    let content='';
    if(state.tab==='photo'||state.tab==='interview')content=mediaContent(state.tab);
    else if(p){
      const related=relationsAtPoint();const relation=related.find(x=>x.note.id===n?.id)?.relation;
      content=`<div class="field-block"><div class="field-label">Timeline interval</div>${n?`<span class="date-pill">${esc(Core.date(n))}</span>${n.future?'<span class="date-pill">Future / aspiration</span>':''}`:'<span class="mapped-note">No timeline interval linked yet</span>'}</div><div class="field-block"><div class="field-label">Map note</div><p class="mapped-note">${esc(p.description||'No additional description recorded on the map.')}</p>${p.description_original?`<p class="original-note">${esc(p.description_original)}</p>`:''}</div><div class="linked-heading"><span>Linked timeline accounts</span><span class="linked-count">${related.length}</span></div>${related.length?related.map(x=>timelineCard(x.note,x.relation)).join(''):'<p class="mapped-note">No timeline account is linked to this location yet. You can still explore this group’s timeline.</p>'}`;
      if(n&&relation){content+=`<details class="source-details"><summary>Original workshop text</summary><p><strong>${esc(n.id)}</strong> · ${esc(n.text)}</p>${n.original&&n.original!=='NA'?`<p lang="id">${esc(n.original)}</p>`:''}<p>${esc(n.precision||'Original workshop interval')}</p><p>${relation.reviewed?'Confirmed location or theme link.':'This relationship follows the current matching for the working prototype.'}</p>${relation.kind==='theme'?'<p>The account is thematic background; it is not attributed to this exact location.</p>':''}<p>Map record: ${esc(p.id)}</p></details>`;}
      if(n)content+=relatedLocations(n,p.id);
    }else{
      const related=Core.notePoints(index,n.id,n.group);
      content=`<div class="field-block"><div class="field-label">Timeline interval</div><span class="date-pill">${esc(Core.date(n))}</span>${n.future?'<span class="date-pill">Future / aspiration</span>':''}</div><div class="field-block"><div class="field-label">Community account</div><p class="mapped-note">${esc(n.text)}</p>${n.original&&n.original!=='NA'?`<p class="original-note" lang="id">${esc(n.original)}</p>`:''}</div>${related.length?relatedLocations(n):'<div class="empty-media"><strong>No exact map location linked</strong><p>This account remains on the group timeline without being assigned to an arbitrary point.</p></div>'}<details class="source-details"><summary>Workshop record</summary><p>${esc(n.id)}</p></details>`;
    }
    host.innerHTML=prefix+`<div id="material-panel" role="tabpanel" aria-labelledby="tab-${state.tab}">${content}</div>`;
  }
  function renderTimeline(){
    const p=currentPoint(),related=relationsAtPoint();
    const group=timelineGroup();
    const label=group?groupLabel(group):'Group timeline';
    const showGroup=Boolean(group)&&state.scope==='group';
    const ns=showGroup?data.notes.filter(n=>n.group===group):related.map(x=>x.note);
    const relationByID=new Map(related.map(x=>[x.note.id,x.relation]));
    const svg=$('timeline'),width=Math.max(900,svg.parentElement.clientWidth),layout=Core.laneLayout(ns,width);
    svg.style.width=width+'px';
    $('location-view').disabled=!p;
    $('location-view').setAttribute('aria-pressed',String(!showGroup));
    $('group-view').disabled=!group;
    $('group-view').textContent=label;
    $('group-view').setAttribute('aria-pressed',String(showGroup));
    let subtitle=group?`${label} community accounts`:'Select a location to see its group’s timeline';
    if(showGroup)subtitle=`${label} · each account retains its own source and time interval`;
    else if(p)subtitle=`${p.name} · ${label}`;
    $('timeline-subtitle').textContent=subtitle;
    $('timeline-count').textContent=`${ns.length} timeline record${ns.length===1?'':'s'}`;
    $('timeline-empty').hidden=ns.length>0;
    $('timeline-empty').textContent=p?`No timeline records are linked to this location yet. Choose ${label} to explore its wider history.`:'Choose a visible location to see its timeline.';
    const dated=ns.filter(n=>n.earliest!==null);svg.parentElement.hidden=!dated.length;svg.setAttribute('viewBox',`0 0 ${width} ${layout.height}`);svg.replaceChildren();
    if(dated.length){
      const futureX=layout.x(2026);svg.append(svgNode('rect',{x:futureX,y:0,width:width-futureX,height:layout.height,fill:'#f5f1fa',rx:8}));
      for(const year of [1995,2000,2005,2010,2015,2020,2025,2030,2035,2040]){const x=layout.x(year);svg.append(svgNode('line',{x1:x,x2:x,y1:31,y2:layout.height-14,class:'timeline-grid'}));const label=svgNode('text',{x,y:22,'text-anchor':'middle',class:'timeline-tick-label'});label.textContent=year;svg.append(label);}
      for(const lane of layout.lanes){const label=svgNode('text',{x:0,y:lane.y+4,class:'timeline-lane-label'});label.textContent=lane.name;svg.append(label);}
      for(const event of layout.events){const n=event.note,r=relationByID.get(n.id),selected=n.id===state.activeNote,isContext=showGroup&&!r&&!selected;const fill=p?color(p.category):'#8570ce';const kind=r?.kind||'location';
        const g=svgNode('g',{class:`timeline-event${selected?' is-selected':''}${isContext?' is-context':''}`,'data-time-id':n.id,role:'button',tabindex:0,'aria-label':`${n.id}, ${Core.date(n)}, ${n.text}`});
        const title=svgNode('title');title.textContent=`${n.id} · Group ${n.group} · ${Core.date(n)}\n${n.text}${r?'\n'+(r.kind==='theme'?'Thematic background':'Location link'):''}`;g.append(title);
        const c=isContext?'#96a4a7':fill;
        if(event.x2>event.x1)g.append(svgNode('line',{x1:event.x1,x2:event.x2,y1:event.y,y2:event.y,stroke:c,'stroke-width':kind==='theme'?2:4,'stroke-opacity':.35,...(kind==='theme'?{'stroke-dasharray':'3 3'}:{})}));
        g.append(svgNode('circle',{cx:event.x,cy:event.y,r:10,class:'event-halo'}));
        if(n.future)g.append(svgNode('polygon',{points:`${event.x},${event.y-6} ${event.x+6},${event.y} ${event.x},${event.y+6} ${event.x-6},${event.y}`,fill:kind==='theme'?'#fff':c,stroke:c,'stroke-width':1.8}));
        else g.append(svgNode('circle',{cx:event.x,cy:event.y,r:isContext?4:5.2,fill:kind==='theme'?'#fff':c,stroke:c,'stroke-width':1.8}));
        svg.append(g);
      }
    }
    const undated=ns.filter(n=>n.earliest===null);$('undated-notes').hidden=!undated.length;$('undated-notes').innerHTML=undated.length?`<span>Undated accounts</span>${undated.map(n=>`<button type="button" data-note-id="${esc(n.id)}">${esc(n.id)} · ${esc(n.text.slice(0,70))}</button>`).join('')}`:'';
    // Keep linked records visible when the timeline extends beyond a phone.
    const sc=svg.parentElement,focus=layout.events.find(e=>e.note.id===state.activeNote)||(state.scope==='location'?layout.events[0]:null);
    if(focus&&sc.scrollWidth>sc.clientWidth)sc.scrollLeft=Math.max(0,Math.min(sc.scrollWidth-sc.clientWidth,focus.x-sc.clientWidth*.45));
  }
  function render(fit=false){renderMap(fit);renderDetail();renderTimeline();}

  $('group').addEventListener('change',e=>{
    const selectedGroup=currentPoint()?.group??currentTime()?.group;
    state.group=e.target.value;
    state.query='';state.examples=false;$('place-search').value='';$('search-results').hidden=true;
    if(!Core.matchesGroup(state.group,selectedGroup)){
      const ps=visible();
      const first=ps.find(p=>index.byPoint.has(p.id))||ps[0];
      state.selection=first?{kind:'point',id:first.id}:null;
      state.activeNote=first?Core.pointNotes(index,first.id)[0]?.note.id||null:null;
      state.tab='note';
    }
    render(true);
  });
  for(const chip of document.querySelectorAll('[data-layer]'))chip.addEventListener('click',()=>{const cat=chip.dataset.layer;if(state.layers.has(cat))state.layers.delete(cat);else state.layers.add(cat);const p=currentPoint();if(p&&!state.layers.has(p.category)){state.selection=null;state.activeNote=null;}render();renderSearch();});
  $('place-search').addEventListener('input',e=>{state.query=e.target.value;renderSearch();});
  $('place-search').addEventListener('focus',renderSearch);
  $('place-search').addEventListener('keydown',e=>{if(e.key==='Escape')$('search-results').hidden=true;if(e.key==='ArrowDown'){e.preventDefault();$('search-results').querySelector('button')?.focus();}});
  $('sample-toggle').addEventListener('click',()=>{state.examples=!state.examples;$('sample-toggle').setAttribute('aria-pressed',String(state.examples));renderSearch();});
  document.addEventListener('click',e=>{
    const place=e.target.closest('[data-choose-point]');if(place){selectPoint(place.dataset.choosePoint,true);return;}
    const note=e.target.closest('[data-note-id]');if(note){selectTime(note.dataset.noteId);return;}
    const tab=e.target.closest('[data-material-tab]');if(tab){state.tab=tab.dataset.materialTab;renderDetail();$('tab-'+state.tab)?.focus();return;}
    if(!e.target.closest('.place-search')&&!e.target.closest('#sample-toggle'))$('search-results').hidden=true;
  });
  $('location-view').addEventListener('click',()=>{if(currentPoint()){state.scope='location';renderTimeline();}});
  $('group-view').addEventListener('click',()=>{state.scope='group';renderTimeline();});
  $('timeline').addEventListener('click',e=>{const g=e.target.closest('[data-time-id]');if(g)selectTime(g.dataset.timeId);});
  $('timeline').addEventListener('keydown',e=>{const g=e.target.closest('[data-time-id]');if(g&&(e.key==='Enter'||e.key===' ')){e.preventDefault();selectTime(g.dataset.timeId);}});
  $('zoom-in').addEventListener('click',()=>mapEngine.zoom(1.5));$('zoom-out').addEventListener('click',()=>mapEngine.zoom(1/1.5));$('fit-map').addEventListener('click',()=>mapEngine.fit());
  window.addEventListener('resize',()=>requestAnimationFrame(renderTimeline));
  mapEngine=new ReferenceMap(selectPoint);
  state.activeNote=Core.pointNotes(index,state.selection.id)[0]?.note.id||null;
  render(true);

  // Optional Mapbox adapter. No third-party map requests occur without a token.
  let pendingMapbox=null;
  async function useMapbox(){
    const token=config.mapbox?.publicAccessToken;if(!token)return;
    const version=config.mapbox.version||'3.33.0';
    const css=document.createElement('link');css.rel='stylesheet';css.href=`https://api.mapbox.com/mapbox-gl-js/v${version}/mapbox-gl.css`;document.head.append(css);
    await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=`https://api.mapbox.com/mapbox-gl-js/v${version}/mapbox-gl.js`;s.onload=resolve;s.onerror=reject;document.head.append(s);});
    $('mapbox-container').hidden=false;
    const mb=new window.mapboxgl.Map({container:'mapbox-container',accessToken:token,style:config.mapbox.style||'mapbox://styles/mapbox/light-v11',center:[110.439,-6.9465],zoom:15.8,attributionControl:true});
    pendingMapbox=mb;
    await new Promise((resolve,reject)=>{mb.once('load',resolve);mb.once('error',reject);});
    const collection=ps=>({type:'FeatureCollection',features:ps.map(p=>({type:'Feature',id:p.id,geometry:{type:'Point',coordinates:[p.lon,p.lat]},properties:{map_id:p.id,name:p.name,category:p.category,group:p.group}}))});
    mb.addSource('places',{type:'geojson',data:collection(visible()),promoteId:'map_id'});
    mb.addLayer({id:'places',type:'circle',source:'places',paint:{'circle-color':['match',['get','category'],'Development','#8570ce','Assets','#90bf9c','Risks','#32b7c2','#879497'],'circle-radius':5,'circle-stroke-color':'#fff','circle-stroke-width':1.2}});
    mb.on('click','places',e=>selectPoint(e.features[0].properties.map_id,false));mb.on('mouseenter','places',()=>mb.getCanvas().style.cursor='pointer');mb.on('mouseleave','places',()=>mb.getCanvas().style.cursor='');
    const reference=mapEngine;reference.destroy();
    mapEngine={setPoints(ps,fit=false){this.ps=ps;mb.getSource('places').setData(collection(ps));if(fit)this.fit();},setHighlighted(ids,selected){const hs=selected?[selected,...ids]:ids;mb.setPaintProperty('places','circle-radius',['case',['in',['get','map_id'],['literal',hs]],7,5]);mb.setPaintProperty('places','circle-stroke-color',['case',['==',['get','map_id'],selected||''],'#edbe40','#fff']);mb.setPaintProperty('places','circle-stroke-width',['case',['==',['get','map_id'],selected||''],3,1.2]);},focusPoint(p){mb.easeTo({center:[p.lon,p.lat],duration:300});},fit(){const ps=this.ps||visible();if(ps.length){const b=new window.mapboxgl.LngLatBounds();ps.forEach(p=>b.extend([p.lon,p.lat]));mb.fitBounds(b,{padding:55,duration:300,maxZoom:18});}},zoom(factor){mb.zoomTo(mb.getZoom()+Math.log2(factor));}};
    $('map-source').textContent='Mapbox';render(true);
  }
  useMapbox().catch(error=>{pendingMapbox?.remove();$('mapbox-container').hidden=true;console.warn('Mapbox unavailable; using the local reference map.',error);});
})();
