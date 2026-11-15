(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.AtlasCore=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const CATEGORIES=['Development','Assets','Risks'];
  const LANES=['Government','Community','Climate','Aspiration','Unclassified'];
  const ALL_GROUPS='all';
  function createIndex(data,mode='working'){
    const points=new Map(data.points.map(p=>[p.id,p]));
    const notes=new Map(data.notes.map(n=>[n.id,n]));
    const relations=data.relations.filter(r=>{
      const p=points.get(r.map_id),n=notes.get(r.note_id);
      return p&&n&&p.group===n.group&&p.group===r.group&&(mode==='reviewed'?r.reviewed:r.included_in_working_prototype);
    });
    const byPoint=new Map(),byNote=new Map();
    for(const r of relations){if(!byPoint.has(r.map_id))byPoint.set(r.map_id,[]);byPoint.get(r.map_id).push(r);if(!byNote.has(r.note_id))byNote.set(r.note_id,[]);byNote.get(r.note_id).push(r);}
    return {points,notes,relations,byPoint,byNote};
  }
  function pointNotes(index,id){return (index.byPoint.get(id)||[]).map(r=>({note:index.notes.get(r.note_id),relation:r})).sort((a,b)=>(a.note.earliest??9999)-(b.note.earliest??9999)||a.note.id.localeCompare(b.note.id));}
  function notePoints(index,id,group){return (index.byNote.get(id)||[]).filter(r=>r.group===group).map(r=>({point:index.points.get(r.map_id),relation:r}));}
  function matchesGroup(scope,group){return scope===ALL_GROUPS||scope===group;}
  function visiblePoints(data,group,layers){return data.points.filter(p=>matchesGroup(group,p.group)&&layers.has(p.category));}
  function date(n){if(n.earliest===null||n.latest===null)return 'Undated';return n.earliest===n.latest?String(n.earliest):`${n.earliest}–${n.latest}`;}
  function world(lon,lat){const r=lat*Math.PI/180;return {x:(lon+180)/360,y:(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2};}
  function laneLayout(notes,width=1040){
    const start=1995,end=2040,left=112,right=26,plot=width-left-right;
    const x=y=>left+(y-start)/(end-start)*plot;
    let y=43;const lanes=[],events=[];
    for(const name of LANES){
      const ns=notes.filter(n=>n.category===name&&n.earliest!==null).sort((a,b)=>a.earliest-b.earliest||a.id.localeCompare(b.id));
      if(!ns.length&&!LANES.slice(0,3).includes(name))continue;
      const slots=[];const top=y;
      for(const n of ns){const a=x(n.earliest),b=x(n.latest),min=Math.min(a,b)-10,max=Math.max(a,b)+11;let slot=slots.findIndex(last=>last<min);if(slot<0){slot=slots.length;slots.push(max);}else slots[slot]=max;events.push({note:n,x:(a+b)/2,x1:a,x2:b,y:top+slot*24});}
      const count=Math.max(1,slots.length);lanes.push({name,y:top+((count-1)*24)/2,top,bottom:top+(count-1)*24});y+=count*24+17;
    }
    return {width,height:y+24,start,end,left,right,lanes,events,x};
  }
  return {CATEGORIES,LANES,ALL_GROUPS,createIndex,pointNotes,notePoints,matchesGroup,visiblePoints,date,world,laneLayout};
});
