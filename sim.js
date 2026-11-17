/* Moon Base 2.0. Deterministic world and simulation, independent of the UI. */
(function(root){
'use strict';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),lerp=(a,b,t)=>a+(b-a)*t;
const WORLD=3600,G=16.2; // WORLD is the surveyed construction sector, not a terrain edge.
const TYPES=[
 {id:'hub',name:'Airlock hub',tag:'CORE',w:80,h:43,pressure:true,power:6,mass:1,build:7,tip:'Choose sheltered crater floor. This hub anchors every corridor and utility line.'},
 {id:'solar',name:'Solar array',tag:'POWER',w:96,h:56,power:0,mass:.86,build:8,tip:'Ridge sunlight increases output. Face panels left toward the sun. Cable length reduces efficiency.'},
 {id:'habitat',name:'Crew habitat',tag:'SHELTER',w:100,h:45,pressure:true,power:8,mass:1.2,build:9,tip:'Stay within corridor range of the hub or another pressurized room. Sheltered ground protects your crew.'},
 {id:'water',name:'Ice extractor',tag:'WATER',w:58,h:68,power:10,mass:1.12,build:9,tip:'Scan for rich ice. A short water pipe preserves more production.'},
 {id:'storage',name:'Logistics bay',tag:'SUPPLIES',w:85,h:42,pressure:true,power:3,mass:1.05,build:8,tip:'Connect to the habitat network. Adds 15 seconds of suit oxygen and 12% lander fuel.'},
 {id:'greenhouse',name:'Greenhouse',tag:'FOOD',w:105,h:58,pressure:true,power:12,mass:1.1,build:10,tip:'Connect to the habitat network, in shelter. Needs power and water to grow food.'},
 {id:'pad',name:'Landing platform',tag:'ACCESS',w:156,h:15,power:2,mass:1.25,build:10,tip:'Build clear of other structures, within 55 m of the hub. Earn a level, reinforced landing surface.'},
 {id:'comms',name:'Comms array',tag:'SIGNAL',w:56,h:78,power:5,mass:.9,build:8,tip:'High terrain sees home more clearly. Face the dish right for the strongest signal.'}
];
const TYPE=Object.fromEntries(TYPES.map(t=>[t.id,t]));
const ANCHORS=[[0,610],[180,568],[360,510],[560,480],[710,515],[830,493],[940,566],[1040,610],[1160,674],[1280,735],[1420,775],[1580,787],[1740,790],[1900,802],[2070,790],[2220,786],[2360,752],[2490,690],[2620,614],[2770,535],[2920,488],[3070,468],[3230,493],[3410,548],[3600,590]];
const FLATS=[{x:555,w:27},{x:818,w:25},{x:1430,w:27},{x:1715,w:29},{x:2140,w:26},{x:2500,w:25},{x:3020,w:28}];
const ROCKS=[{x:392,r:13,h:16},{x:700,r:10,h:12},{x:987,r:16,h:20},{x:1250,r:14,h:18},{x:1534,r:12,h:13},{x:1842,r:17,h:18},{x:2268,r:12,h:15},{x:2415,r:14,h:18},{x:2725,r:16,h:20},{x:3180,r:13,h:13}];
function baseGround(x){
 if(x<0||x>WORLD){const edge=x<0?0:WORLD,dir=x<0?-1:1,d=Math.abs(x-edge),y=baseGround(edge),slope=(y-baseGround(edge-dir*.1))/.1;
  return y+slope*180*(1-Math.exp(-d/180))+38*(1-Math.cos(d*.0028))+10*(1-Math.cos(d*.009));}
let i=0;while(i<ANCHORS.length-2&&ANCHORS[i+1][0]<x)i++;const a=ANCHORS[i],b=ANCHORS[i+1],t=(x-a[0])/(b[0]-a[0]);return lerp(a[1],b[1],t)+Math.sin(x*.021)*3.5+Math.sin(x*.071)*1.8;}
function ground(x){for(const f of FLATS){const d=Math.abs(x-f.x);if(d<f.w)return baseGround(f.x);if(d<f.w+24)return lerp(baseGround(f.x),baseGround(x),(d-f.w)/24);}return baseGround(x);}
function groundAngle(x,r=12){return Math.atan2(ground(x+r)-ground(x-r),r*2);}
function environment(x,flip=0){const y=ground(x),sun=clamp((790-y)/310*85+14+(flip?-10:8),10,100);return{sun,ice:clamp(13+84*Math.exp(-(((x-2070)/240)**2))+25*Math.exp(-(((x-2350)/125)**2)),8,100),shelter:clamp(100-(800-y)*.17,30,100),signal:clamp((790-y)/310*70+25+(flip?10:-10),10,100)};}
function terrainSpread(x,w){const a=[];for(let i=-w/2;i<=w/2;i+=8)a.push(ground(x+i));return Math.max(...a)-Math.min(...a);}
function fresh(){return{version:2,modules:[],crashes:0,time:0,landings:[],repairs:0,crew:false,bestScore:0};}
class Simulation{
 constructor(saved){this.campaign=saved&&saved.version===2?JSON.parse(JSON.stringify(saved)):fresh();this.campaign.modules=this.campaign.modules.filter(m=>TYPE[m.id]&&Number.isFinite(m.x)&&m.x>70&&m.x<WORLD-70);this.state='title';this.job=null;this.ship=null;this.astro=null;this.events=[];this.particles=[];this.clock=0;this.paused=false;this.testTime=0;this.testPassed=false;this.crew=[];this.saveNeeded=false;this.flightClock=0;this.resetWork();this.landingTarget=0;this.transition=0;this.lastWarning=0;}
 get modules(){return this.campaign.modules;}
 module(id){return this.modules.find(m=>m.id===id);}
 logisticsActive(){const m=this.module('storage');return !!(m&&m.hp>=50&&this.connections().connected.has('storage'));}
 event(text,kind='info'){this.events.push({text,kind});}
 checkpoint(){this.saveNeeded=true;}
 snapshot(){const data=JSON.parse(JSON.stringify(this.campaign));if(this.job?.relocate&&!this.job.complete&&this.job.origin){data.modules=data.modules.filter(m=>m.id!==this.job.id);data.modules.push({...this.job.origin});}return data;}
 resetWork(){this.work=null;this.workKey=null;this.buildProgress=0;this.workFraction=0;this.workActive=false;this.workElapsed=0;this.workFeedback='';this.workFeedbackUntil=0;this.lastWorkTap=-Infinity;}
 get timingPosition(){const t=(this.workElapsed/1.45)%2;return t<=1?t:2-t;}
 reset(){this.resetWork();this.campaign=fresh();this.job=null;this.ship=null;this.astro=null;this.state='orbit';this.checkpoint();}
 resume(){this.state=this.campaign.crew?'complete':'orbit';}
 surface(x){const pad=this.module('pad');if(pad&&Math.abs(x-pad.x)<TYPE.pad.w/2-5)return this.moduleY(pad);let y=ground(x);for(const r of ROCKS){const d=Math.abs(x-r.x);if(d<r.r)y=Math.min(y,ground(x)-r.h*Math.cos(groundAngle(r.x,r.r))*(1-d/r.r));}return y;}
 moduleY(m){const t=TYPE[m.id];if(m.id==='pad')return Math.min(ground(m.x-t.w/2),ground(m.x),ground(m.x+t.w/2))-5;return Math.min(ground(m.x-t.w/2),ground(m.x),ground(m.x+t.w/2));}
 connections(mods=this.modules){
  const links=[],connected=new Set(),hub=mods.find(m=>m.id==='hub'),pressure=mods.filter(m=>TYPE[m.id].pressure);if(!hub)return{links,connected};connected.add('hub');
  let changed=true;while(changed){changed=false;for(const m of pressure){if(connected.has(m.id))continue;const options=pressure.filter(n=>connected.has(n.id)).map(n=>({n,d:Math.abs(n.x-m.x)-(TYPE[n.id].w+TYPE[m.id].w)/2})).filter(o=>o.d<=460&&Math.abs(ground(o.n.x)-ground(m.x))<115).sort((a,b)=>a.d-b.d);if(options.length){links.push({a:options[0].n.id,b:m.id,kind:'corridor',length:Math.max(0,options[0].d)});connected.add(m.id);changed=true;}}}
  for(const m of mods.filter(m=>!TYPE[m.id].pressure)){const options=pressure.filter(n=>connected.has(n.id)).sort((a,b)=>Math.abs(a.x-m.x)-Math.abs(b.x-m.x));if(options.length){const n=options[0];links.push({a:n.id,b:m.id,kind:m.id==='water'?'pipe':'cable',length:Math.abs(n.x-m.x)});connected.add(m.id);}}
  return{links,connected};
 }
 assess(id,x,flip=0,mods=this.modules){
  const t=TYPE[id],env=environment(x,flip),others=mods.filter(m=>m.id!==id),candidate={id,x,flip,hp:100},all=[...others,candidate],net=this.connections(all);let valid=true,reason='Foundation clear';
  if(x<t.w/2+25||x>WORLD-t.w/2-25){valid=false;reason='Too close to sector boundary';}
  if(id==='hub'&&(x<1350||x>2360)){valid=false;reason='The hub needs sheltered crater floor';}
  if(terrainSpread(x,t.w)>42){valid=false;reason='Terrain too steep for foundations';}
  const overlap=others.find(m=>Math.abs(m.x-x)<(t.w+TYPE[m.id].w)/2+12);if(overlap){valid=false;reason='Footprint overlaps '+TYPE[overlap.id].name.toLowerCase();}
  if(ROCKS.some(r=>Math.abs(r.x-x)<t.w/2+r.r+3)){valid=false;reason='Boulder inside construction footprint';}
  if(id!=='hub'&&!others.some(m=>m.id==='hub')){valid=false;reason='Build the airlock hub first';}
  const connected=net.connected.has(id),link=net.links.find(l=>l.b===id),distance=link?.length||0;
  let quality=id==='solar'?env.sun:id==='water'?env.ice:id==='comms'?env.signal:id==='pad'?clamp(100-Math.abs((others.find(m=>m.id==='hub')?.x||x)-x)/12,30,100):env.shelter;
  if(!connected&&id!=='hub')quality*=.25;if(t.pressure&&id!=='hub')quality*=clamp(1-distance/1200,.6,1);if(id==='solar')quality*=clamp(1-distance/6000,.65,1);if(id==='water')quality*=clamp(1-distance/2000,.45,1);if(id==='comms')quality*=clamp(1-distance/8000,.65,1);
  if(id==='pad'){const clearance=Math.min(...others.map(m=>Math.abs(m.x-x)-TYPE[m.id].w/2));quality*=clamp(clearance/150,.25,1);}
  return{valid,reason,quality:Math.round(quality),env,connected,distance,link:link?.kind||'anchor',production:id==='solar'?Math.round(112*env.sun/100*clamp(1-distance/6000,.65,1)):id==='water'?Math.round(36*env.ice/100*clamp(1-distance/2000,.45,1)):null};
 }
 stats(mods=this.modules){
  const net=this.connections(mods),health=m=>clamp(m.hp/100,0,1),solar=mods.find(m=>m.id==='solar'),water=mods.find(m=>m.id==='water'),hab=mods.find(m=>m.id==='habitat'),green=mods.find(m=>m.id==='greenhouse'),comms=mods.find(m=>m.id==='comms');
  const output=(m,id)=>m&&net.connected.has(id)?this.assess(id,m.x,m.flip,mods).production*health(m):0;
  const power=output(solar,'solar'),demand=mods.reduce((s,m)=>s+TYPE[m.id].power,0),waterRate=output(water,'water'),powerRatio=power?clamp(power/Math.max(1,demand),0,1):0;
  const supply=waterRate*powerRatio,shelter=hab&&net.connected.has('habitat')?environment(hab.x).shelter*health(hab):0,food=green&&net.connected.has('greenhouse')?12*powerRatio*clamp(supply/12,0,1)*health(green):0,signal=comms&&net.connected.has('comms')?environment(comms.x,comms.flip).signal*health(comms)*powerRatio:0;
  const integrity=mods.length?mods.reduce((s,m)=>s+m.hp,0)/mods.length:100,quality=mods.length?mods.reduce((s,m)=>s+this.assess(m.id,m.x,m.flip,mods).quality*health(m),0)/mods.length:0;
  const flight=this.campaign.landings.length?this.campaign.landings.reduce((s,l)=>s+l.score,0)/this.campaign.landings.length:100;
  const utility=(powerRatio+clamp(supply/12,0,1)+clamp(shelter/65,0,1)+clamp(food/8,0,1)+clamp(signal/45,0,1))/5*100;
  const materials=net.links.reduce((n,l)=>n+l.length*(l.kind==='corridor'?.35:l.kind==='pipe'?.1:.025),0),materialBudget=260;
  const connectivity=mods.length?net.connected.size/mods.length*100:0,score=mods.length?Math.round(clamp(quality*.4+utility*.25+connectivity*.15+flight*.2-this.campaign.crashes*1.5,0,100)):0;
  const missing=TYPES.filter(t=>!mods.some(m=>m.id===t.id)).map(t=>t.name);
  const checks=[{name:'Power',ok:power>=demand,value:`${Math.round(power)} / ${demand} kW`,fix:'Relocate solar panels to a sunnier ridge, face them left, or repair them.'},{name:'Water',ok:supply>=12,value:`${supply.toFixed(1)} / 12 L/h`,fix:'Move the extractor over richer ice or shorten its pipe.'},{name:'Shelter',ok:shelter>=50,value:`${Math.round(shelter)} / 50`,fix:'Connect the habitat to the hub, or repair its hull.'},{name:'Food',ok:food>=8,value:`${food.toFixed(1)} / 8 units`,fix:'Connect and repair the greenhouse. It also needs sufficient power and water.'},{name:'Signal',ok:signal>=40,value:`${Math.round(signal)} / 40`,fix:'Move comms to high ground and face the dish right.'},{name:'Network',ok:net.connected.size===mods.length&&integrity>=65&&materials<=materialBudget,value:`${net.connected.size}/${mods.length} linked · ${Math.round(integrity)}% hull · ${Math.round(materials)}/${materialBudget} stock`,fix:'Connect isolated rooms, repair damaged hulls, and shorten long corridors to fit your conduit stock.'}];
  return{power,demand,water:supply,shelter,food,signal,integrity,quality,flight,utility,connectivity,materials,materialBudget,score,links:net.links,connected:net.connected,missing,checks,ready:!missing.length&&checks.every(c=>c.ok)};
 }
 recommended(id){const options=[];for(let x=120;x<WORLD-120;x+=12){const a=this.assess(id,x,id==='comms'?1:0);if(a.valid)options.push({x,q:a.quality});}return options.sort((a,b)=>b.q-a.q)[0]?.x||1750;}
 safeLanding(x,allowPad=true){
  if(!Number.isFinite(x))return false;const pad=this.module('pad');if(allowPad&&pad&&Math.abs(x-pad.x)<46)return true;
  if(ROCKS.some(r=>Math.abs(x-r.x)<r.r+30))return false;if(this.modules.some(m=>m.id!=='pad'&&Math.abs(x-m.x)<TYPE[m.id].w/2+40))return false;
  return terrainSpread(x,46)<5.8&&Math.abs(ground(x+22)-ground(x-22))/44<.16;
 }
 landingNear(x,avoid=null){const reserved=avoid||(this.job&&!this.job.complete?this.job:null);let best=null;for(let p=50;p<WORLD-50;p+=3){if(!this.safeLanding(p))continue;if(reserved&&Math.abs(p-reserved.x)<TYPE[reserved.id].w/2+48)continue;let d=Math.abs(p-x);const pad=this.module('pad');if(pad&&Math.abs(p-pad.x)<40)d-=50;if(!best||d<best.d)best={x:p,d};}return best?.x||x-150;}
 plan(id,x,flip=0,relocate=false){const a=this.assess(id,x,flip);if(!a.valid)return false;if(this.module(id)&&!relocate)return false;const origin=this.module(id);this.job={id,x,flip,relocate,origin:origin?{...origin}:null,stage:relocate?'retrieve':'build',complete:false};this.landingTarget=this.landingNear(relocate?origin.x:x);return true;}
 launch(side=-1){if(!this.job)return false;const t=TYPE[this.job.id],lz=this.landingNear(this.job.relocate?this.job.origin.x:this.job.x);this.landingTarget=lz;this.ship={x:clamp(lz+side*220,60,WORLD-60),y:ground(lz)-440,vx:-side*25,vy:7,angle:0,omega:0,fuel:this.logisticsActive()?90:78,thrust:false,cargo:!this.job.relocate};this.astro=null;this.state='flying';this.flightClock=0;this.resetWork();this.lastWarning=0;this.event(`${t.name} inbound. Natural terrain: stay under 1.7 m/s down and 1.0 m/s sideways.`);return true;}
 fail(title,text){if(this.job?.relocate&&!this.job.complete&&this.job.origin){const old=this.modules.findIndex(m=>m.id===this.job.id);if(old<0)this.modules.push({...this.job.origin});else this.modules[old]={...this.job.origin};}this.state='failed';this.failure={title,text};this.campaign.crashes++;this.ship&&(this.ship.thrust=false);this.checkpoint();this.event(title,'danger');}
 retry(){if(this.job?.complete){this.state='orbit';this.job=null;this.astro=null;this.event('Rescue complete. Installed modules remain in place.');}else if(this.job){if(this.job.relocate&&this.job.origin){this.campaign.modules=this.modules.filter(m=>m.id!==this.job.id);this.modules.push({...this.job.origin});}this.job.stage=this.job.relocate?'retrieve':'build';this.launch();}}
 interact(){
  if(this.state==='landed'){this.astro={x:this.ship.x+30,y:this.surface(this.ship.x+30),oxygen:this.logisticsActive()?110:95,carrying:false,dir:1,walk:0};this.state='eva';this.event(this.job?.complete?'Return to the lander when ready to depart.':this.job?.relocate?'Retrieve the old module: hold E beside it to dismantle.':'Press E again beside the lander to collect your cargo.');return;}
  if(this.state!=='eva')return;const a=this.astro,nearShip=Math.abs(a.x-this.ship.x)<47;
  if(nearShip){if(this.ship.cargo&&!a.carrying&&!this.job.complete){a.carrying=true;this.ship.cargo=false;this.event('Cargo collected. Carry it to the outline. Press E or click the timing meter to assemble.');return;}if(a.carrying){a.carrying=false;this.ship.cargo=true;}this.state='landed';a.oxygen=this.logisticsActive()?110:95;this.event(this.job?.complete?'Cargo installed. Hold thrust to lift off for orbital resupply.':'Back inside. Press E to exit; your oxygen is replenished.');return;}
  const hub=this.module('hub');if(hub&&Math.abs(a.x-hub.x)<52&&this.stats().power>=this.stats().demand){a.oxygen=this.logisticsActive()?110:95;this.event('Airlock connected. Suit oxygen replenished.');}
 }
 build(dt,input){
  const a=this.astro,j=this.job;if(!j)return;let mode=null,target=j.x;
  if(j.relocate&&j.stage==='retrieve'){target=j.origin.x;if(Math.abs(a.x-target)<TYPE[j.id].w/2+32&&!a.carrying)mode='dismantle';}
  else if(!j.complete&&a.carrying&&Math.abs(a.x-j.x)<35){if(Math.abs(this.ship.x-j.x)>TYPE[j.id].w/2+35)mode='build';else if(input.action&&this.clock-this.lastWarning>4){this.event('Construction overlaps the lander. Use B to move the outline clear.','danger');this.lastWarning=this.clock;}}
  if(!mode&&!a.carrying){const damaged=this.modules.filter(m=>m.hp<99.9&&Math.abs(a.x-m.x)<TYPE[m.id].w/2+30).sort((u,v)=>Math.abs(u.x-a.x)-Math.abs(v.x-a.x))[0];if(damaged&&Math.abs(a.x-this.ship.x)>47){mode='repair';target=damaged.x;}}
  if(!mode){this.resetWork();return;}
  const workKey=mode+':'+target;
  if(this.workKey!==workKey){this.resetWork();this.workKey=workKey;}
  this.work=mode;
  const total=mode==='build'?TYPE[j.id].build*.6:2;
  if(mode==='build'){
   const tap=!!(input.workTap||input.interact);
   if(tap&&!this.workActive){this.workActive=true;this.workFeedback='ASSEMBLY STARTED';this.workFeedbackUntil=this.clock+.6;}
   else if(tap&&this.clock-this.lastWorkTap>=.35){
    this.lastWorkTap=this.clock;const p=this.timingPosition,perfect=p>=.68&&p<=.76,hit=p>=.62&&p<=.82;
    this.buildProgress+=perfect?1.8:hit?1.2:0;
    this.workFeedback=perfect?'PERFECT! +1.8s':hit?'GOOD! +1.2s':'MISSED · TRY AGAIN';this.workFeedbackUntil=this.clock+.65;
   }
   if(this.workActive){this.buildProgress+=dt;this.workElapsed+=dt;}
  }else if(input.action)this.buildProgress+=dt;
  this.workFraction=clamp(this.buildProgress/total,0,1);
  if(this.buildProgress<total)return;this.resetWork();
  if(mode==='dismantle'){this.campaign.modules=this.modules.filter(m=>m.id!==j.id);a.carrying=true;j.stage='build';this.event('Module packed. Carry it to the new construction outline.');}
  else if(mode==='repair'){const m=this.modules.find(m=>m.x===target);m.hp=100;this.campaign.repairs++;this.checkpoint();this.event(TYPE[m.id].name+' repaired.');}
  else{const m={id:j.id,x:j.x,flip:j.flip,hp:100,born:this.campaign.time};this.campaign.modules=this.modules.filter(n=>n.id!==j.id);this.modules.push(m);a.carrying=false;j.complete=true;j.stage='done';this.checkpoint();this.event(TYPE[j.id].name+' assembled. '+(this.stats().connected.has(j.id)?'Connection established.':'No corridor connection. Reposition it from orbit.'),'success');}
 }
 beginAscent(){if(this.state!=='landed'||!this.job?.complete)return false;this.state='ascent';this.ship.thrust=true;this.ship.vx=0;this.ship.vy=-12;this.ship.angle=0;this.transition=0;this.event('Lifting off. Orbital tender will replenish fuel and load your next cargo.');return true;}
 startTest(){if(this.stats().missing.length)return false;this.state='test';this.testTime=0;this.testPassed=false;this.testFailed=false;this.job=null;this.astro=null;this.event('Beginning a 30-second autonomous life support test.');return true;}
 beginCrew(){const p=this.module('pad');this.state='crew';this.transition=0;this.ship={x:p.x,y:-100,vx:0,vy:0,angle:0,omega:0,fuel:100,thrust:true,cargo:false};this.crew=[];this.event('Readiness test passed. Crew transport on final approach.','success');}
 step(dt,input={}){
  this.clock+=dt;if(this.paused)return;this.campaign.time+=['flying','landed','eva','ascent','test','crew'].includes(this.state)?dt:0;
  if(input.interact)this.interact();
  if(this.state==='flying'){
   const s=this.ship,t=TYPE[this.job.id];this.flightClock+=dt;const turn=(input.right?1:0)-(input.left?1:0);s.omega+=turn*2.6*dt;s.omega*=Math.exp(-2.4*dt);s.angle+=s.omega*dt;
   if(input.level){s.omega-=s.angle*5*dt;s.omega*=Math.exp(-2*dt);s.fuel=Math.max(0,s.fuel-dt*.15);}
   s.angle=clamp(s.angle,-Math.PI,Math.PI);s.thrust=!!input.thrust&&s.fuel>0;
   if(s.thrust){const force=57/t.mass;s.vx+=Math.sin(s.angle)*force*dt;s.vy-=Math.cos(s.angle)*force*dt;s.fuel=Math.max(0,s.fuel-5.4*dt);const altitude=this.surface(s.x)-s.y-25;if(altitude<90){for(const m of this.modules){if(m.id==='pad'||Math.abs(m.x-s.x)>TYPE[m.id].w/2+78)continue;const damage=(1-altitude/110)*2.8*dt;m.hp=Math.max(15,m.hp-damage);if(this.clock-this.lastWarning>4){this.event('Exhaust is damaging '+TYPE[m.id].name.toLowerCase()+'. Move clear of the base.','danger');this.lastWarning=this.clock;}}}}
   s.vy+=G*dt;s.x+=s.vx*dt;s.y+=s.vy*dt;if(s.y<-160){s.y=-160;s.vy=Math.max(0,s.vy);}
   const collision=this.modules.find(m=>m.id!=='pad'&&Math.abs(m.x-s.x)<TYPE[m.id].w/2+19&&s.y+20>this.moduleY(m)-TYPE[m.id].h&&s.y-15<this.moduleY(m));
   if(collision){collision.hp=Math.max(15,collision.hp-18);this.fail('Structure collision.','Leave more clearance between your approach and the outpost. Damaged modules can be repaired on foot.');return;}
   const floor=Math.min(this.surface(s.x-22),this.surface(s.x+22));if(s.y+25>=floor){const pad=this.module('pad'),onPad=pad&&Math.abs(s.x-pad.x)<50,rough=terrainSpread(s.x,44),safe=onPad||this.safeLanding(s.x,false);const maxV=onPad?25:17,maxH=onPad?16:10,maxA=(onPad?12:9)*Math.PI/180;
    if(safe&&s.vy<maxV&&Math.abs(s.vx)<maxH&&Math.abs(s.angle)<maxA){const score=clamp(100-Math.abs(s.vy)/maxV*28-Math.abs(s.vx)/maxH*22-Math.abs(s.angle)/maxA*20-Math.min(18,Math.abs(s.x-this.landingTarget)/15),0,100);this.campaign.landings.push({score,vertical:s.vy/10,horizontal:Math.abs(s.vx)/10,fuel:s.fuel});s.y=floor-25;s.vx=s.vy=s.omega=0;s.angle=0;s.thrust=false;this.state='landed';this.checkpoint();this.event(`Touchdown. Flight rating ${Math.round(score)}/100. Press E to exit.`,'success');}
    else this.fail(!safe?'Unsuitable landing ground.':'Touchdown limits exceeded.',!safe?'That ground is sloped, rocky, or obstructed. Use the terrain scanner and aim for the narrow recommended landing pocket.':`Natural terrain needs less than 1.7 m/s down, 1.0 m/s sideways, and 9° tilt. Your landing: ${(s.vy/10).toFixed(1)} down, ${(Math.abs(s.vx)/10).toFixed(1)} sideways, ${Math.round(Math.abs(s.angle)*180/Math.PI)}° tilt.`);
   }
  }else if(this.state==='landed'){this.ship.thrust=false;if(input.thrust&&this.job?.complete)this.beginAscent();}
  else if(this.state==='eva'){
   const a=this.astro,move=(input.right?1:0)-(input.left?1:0),speed=a.carrying?34:54;a.x+=move*speed*dt;a.y=this.surface(a.x);if(move){a.dir=move;a.walk+=dt*10;}a.oxygen-=dt;this.build(dt,input);if(a.oxygen<=0){this.fail('Suit oxygen exhausted.','Land closer to the construction site, use a powered hub to refill, or return to the lander for a fresh supply.');return;}if(a.oxygen<25&&a.oxygen+dt>=25)this.event('25 seconds of suit oxygen. Return to an airlock or lander.','danger');
  }else if(this.state==='ascent'){
   this.transition+=dt;this.ship.vy=Math.max(-175,this.ship.vy-48*dt);this.ship.y+=this.ship.vy*dt;this.ship.thrust=true;if(this.ship.y<-230){this.state='orbit';this.job=null;this.astro=null;this.ship.thrust=false;this.checkpoint();this.event('Tender docked. Choose the next cargo or improve an installed module.');}
  }else if(this.state==='test'){
   this.testTime+=dt;const stats=this.stats();if(this.testTime>=30){if(stats.ready){this.testPassed=true;this.beginCrew();}else{this.testFailed=true;this.state='orbit';this.event('Systems test failed. Review the red checks; relocate or repair the affected modules.','danger');}}
  }else if(this.state==='crew'){
   this.transition+=dt;const p=this.module('pad'),hub=this.module('hub'),floor=this.moduleY(p)-25;
   if(this.transition<7){const t=clamp(this.transition/7,0,1);this.ship.y=lerp(-100,floor,1-(1-t)**3);this.ship.thrust=t<.97;}
   else{this.ship.y=floor;this.ship.thrust=false;for(let i=0;i<4;i++){if(this.transition>8+i*1.1&&!this.crew[i])this.crew[i]={x:p.x+28,y:this.surface(p.x+28),dir:hub.x>p.x?1:-1,walk:0,arrived:false};const c=this.crew[i];if(c&&!c.arrived){const move=Math.sign(hub.x-c.x);c.x+=move*40*dt;c.y=this.surface(c.x);c.walk+=dt*8;if(Math.abs(c.x-hub.x)<25)c.arrived=true;}}if(this.crew.length===4&&this.crew.every(c=>c.arrived)){this.campaign.crew=true;this.campaign.bestScore=this.stats().score;this.state='complete';this.checkpoint();this.event('Four crew inside. Aurora Base is operational.','success');}}
  }
 }
}
const api={Simulation,TYPES,TYPE,WORLD,G,ground,groundAngle,environment,terrainSpread,ROCKS,FLATS,clamp,lerp,fresh};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MoonSim=api;
})(typeof window!=='undefined'?window:globalThis);
