/* Moon Base v1.0 | original art and game code, no external dependencies. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const canvas = $('world'), ctx = canvas.getContext('2d');
const TAU = Math.PI * 2, WORLD = 3600, GRAVITY = 18, THRUST = 51;
const SAVE_KEY = 'moon-base-campaign-v1';
const missions = [
 {x:560,y:515,name:'Rim power array',cargo:'Solar array',short:'POWER',description:'Put the first solar array on the illuminated rim. This is where the outpost begins.',role:'RIM / POWER GENERATION'},
 {x:1080,y:650,name:'Crater power relay',cargo:'Power relay',short:'RELAY',description:'Bring power down from the rim. Install a relay to connect the future habitat.',role:'SLOPE / POWER DISTRIBUTION'},
 {x:1640,y:785,name:'A place to breathe',cargo:'Habitat module',short:'HABITAT',description:'Deliver a pressurized habitat to the sheltered crater floor.',role:'CRATER FLOOR / CREW QUARTERS'},
 {x:2140,y:785,name:'Water from the dark',cargo:'Ice extractor',short:'WATER',description:'Set up an ice extraction unit beside the habitat. Water keeps this outpost alive.',role:'SHADOW / ICE EXTRACTION'},
 {x:2570,y:680,name:'Room to grow',cargo:'Greenhouse',short:'FOOD',description:'Deliver a sealed greenhouse. Complete the next piece of the life support system.',role:'INNER TERRACE / FOOD SYSTEMS'},
 {x:3070,y:505,name:'A signal home',cargo:'Comms array',short:'COMMS',description:'Install the communications array on the far rim and bring Aurora Base online.',role:'FAR RIM / COMMUNICATIONS'}
];
const anchors = [[0,610],[170,575],[350,525],[560,515],[820,595],[1080,650],[1360,748],[1640,785],[1880,806],[2140,785],[2370,745],[2570,680],[2830,555],[3070,505],[3380,540],[3600,595]];
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const lerp = (a,b,t) => a+(b-a)*t;
let W=innerWidth,H=innerHeight,dpr=1;
let state='title', index=0, paused=false, helpReturn=null, mapOpen=false;
let ship, astronaut, installed=false, buildTime=0, cargoOnShip=true;
let elapsed=0, missionTime=0, toastTime=0, last=0, camera={x:1750,y:430,z:.7};
let particles=[], stars=[], dust=[], keys={}, pressed={}, progress={completed:0,crashes:0,time:0,landings:[]};
let storageAvailable=true, audioEnabled=false,audioContext=null,engine=null,engineGain=null, deferredInstall=null;
let touchdown=null, hudClock=0;
try { const data=JSON.parse(localStorage.getItem(SAVE_KEY)); if(data&&Number.isInteger(data.completed)&&data.completed>=0&&data.completed<=6) progress={...progress,...data}; } catch(e) {storageAvailable=false;}
let seed=2711; const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
for(let i=0;i<400;i++) stars.push({x:random(),y:random()*.8,r:random()*1.3+.25,a:random()*.65+.12});
for(let i=0;i<800;i++) dust.push({x:random()*WORLD,y:random()*200,r:random()*2.5+.4,a:random()*.16+.03});
function ground(x) {
 x=clamp(x,0,WORLD);
 for(const m of missions) if(Math.abs(x-m.x)<155) return m.y;
 let n=0;while(n<anchors.length-2&&anchors[n+1][0]<x)n++;
 const a=anchors[n],b=anchors[n+1],t=clamp((x-a[0])/(b[0]-a[0]),0,1),smooth=t*t*(3-2*t);
 let base=lerp(a[1],b[1],smooth)+Math.sin(x*.029)*3+Math.sin(x*.071)*1.5;
 for(const m of missions){const d=Math.abs(x-m.x);if(d<210)base=lerp(m.y,base,(d-155)/55);}
 return base;
}
function save(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(progress));}catch(e){storageAvailable=false;}}
function resize(){W=innerWidth;H=innerHeight;dpr=Math.min(devicePixelRatio||1,2);canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);if(mapOpen)drawMap();}
window.addEventListener('resize',resize);resize();
if(matchMedia('(pointer: coarse)').matches)document.body.classList.add('touch');
function toast(message,duration=5){$('toast').textContent=message;$('toast').classList.add('visible');toastTime=duration;}
function showDialog(content){$('dialog').innerHTML=content;$('overlay').hidden=false;setTimeout(()=>{$('dialog').querySelector('button')?.focus();},30);}
function hideDialog(){$('overlay').hidden=true;helpReturn=null;}
function actions(items){return '<div class="actions">'+items.map(([id,label,primary])=>`<button id="${id}" class="${primary?'primary':'secondary'}">${label}</button>`).join('')+'</div>';}
function on(id,fn){$(id)?.addEventListener('click',fn);}
function title(){
 state='title';paused=false;mapOpen=false;$('map').hidden=true;$('hud').hidden=true;setEngine(false);
 const continued=progress.completed>0&&progress.completed<6;
 showDialog(`<div class="eyebrow"><span class="status-dot"></span> ESTABLISH A NEW FRONTIER</div><h1>MOON<br><span>BASE.</span></h1><p class="lead">A precise landing. A breath of oxygen.<br>A foothold on another world.</p><p>Deliver the parts. Step into the dark. Build an outpost at the lunar south pole, one mission at a time.</p>${actions([[continued?'continue':'start',continued?`Continue · ${progress.completed}/6 complete`:'Begin expedition ↗',true],['how','How to play',false],...(continued?[['new','New expedition',false]]:[])])}<div class="brief-stats"><div><strong>06</strong><span>CARGO MISSIONS</span></div><div><strong>95s</strong><span>SUIT OXYGEN</span></div><div><strong>01</strong><span>NEW BEGINNING</span></div></div><p class="meta">FICTIONAL SOUTH POLE OUTPOST · PLAY AT YOUR OWN PACE<br>KEYBOARD + TOUCH · INSTALLABLE · OFFLINE READY</p>`);
 on('start',()=>{progress={completed:0,crashes:0,time:0,landings:[]};save();launch(0);});on('continue',()=>launch(progress.completed));on('how',showHelp);on('new',newCampaign);
}
function newCampaign(){showDialog(`<div class="eyebrow">NEW EXPEDITION</div><h2>Start from the first delivery?</h2><p>This replaces your saved expedition progress.</p>${actions([['confirmNew','Start new expedition',true],['cancelNew','Keep current expedition',false]])}`);on('confirmNew',()=>{progress={completed:0,crashes:0,time:0,landings:[]};save();launch(0);});on('cancelNew',title);}
function launch(n){
 index=n;const m=missions[index];state='flying';paused=false;installed=false;buildTime=0;cargoOnShip=true;astronaut=null;particles=[];keys={};pressed={};missionTime=0;touchdown=null;
 ship={x:m.x-180,y:m.y-360,vx:12,vy:3,angle:0,fuel:100,thrust:false};
 camera={x:ship.x+100,y:ship.y+110,z:cameraZoom()};
 hideDialog();$('hud').hidden=false;$('buildWrap').hidden=true;$('pause').textContent='Ⅱ';$('pause').setAttribute('aria-label','Pause game');
 toast('Cargo secured. Land on the illuminated pad. Keep descent below 2.7 m/s.',7);updateHud();tone(460,.1,.035);
}
function cameraZoom(){return W<600?.76:W<900?.92:1.08;}
function showHelp(){
 if(helpReturn===null) helpReturn={state,paused,nodes:Array.from($('dialog').childNodes),overlayHidden:$('overlay').hidden};paused=true;setEngine(false);
 showDialog(`<div class="eyebrow">FLIGHT MANUAL / AURORA EXPEDITION</div><h2>Land. Deliver. Build.</h2><p>Use short bursts to slow your descent. Land upright on a flat surface, then carry your cargo to the amber construction marker.</p><div class="control-grid"><b>↑ / W / Space</b><span>Fire main engine</span><b>← → / A D</b><span>Tilt lander / walk astronaut</span><b>↓ / S</b><span>Level the lander</span><b>E</b><span>Exit, collect cargo, enter lander</span><b>Hold E</b><span>Assemble cargo at its marker (6 sec)</span><b>M</b><span>Open sector map</span><b>P / Esc</b><span>Pause / resume</span><b>R</b><span>Retry current delivery</span></div><p><b>Landing limits:</b> vertical under 2.7 m/s, horizontal under 2.2 m/s, tilt under 12°. Rotation eases back toward level when you release the controls.</p><p><b>On foot:</b> exit the lander, press E nearby to collect cargo, carry it to the marker, then hold E to build. Return to the lander and press E to complete the delivery. Your suit has 95 seconds of oxygen. Touch buttons perform the same actions.</p>${actions([['closeHelp','Got it',true]])}`);
 on('closeHelp',()=>{const ret=helpReturn;helpReturn=null;if(ret.state==='title')title();else{$('dialog').replaceChildren(...ret.nodes);$('overlay').hidden=ret.overlayHidden;state=ret.state;paused=ret.paused;}});
}
function pauseDialog(){showDialog(`<div class="eyebrow">MISSION ON HOLD</div><h2>Take a breath.</h2><p>Your lander and suit are on standby. Resume when you’re ready.</p>${actions([['resume','Resume mission',true],['retry','Retry delivery',false],['manual','Controls',false],['menu','Main menu',false]])}`);on('resume',()=>{paused=false;hideDialog();$('pause').textContent='Ⅱ';});on('retry',()=>launch(index));on('manual',showHelp);on('menu',title);}
function togglePause(){if(state==='title'||state==='failed'||state==='complete'||state==='between')return;if(mapOpen){toggleMap();return;}if(helpReturn!==null){$('closeHelp')?.click();return;}paused=!paused;keys={};pressed={};setEngine(false);$('pause').textContent=paused?'▶':'Ⅱ';if(paused)pauseDialog();else hideDialog();}
function fail(reason){state='failed';ship.thrust=false;setEngine(false);progress.crashes++;save();tone(95,.4,.07);showDialog(`<div class="eyebrow" style="color:var(--amber)">DELIVERY INTERRUPTED</div><h2>${reason.title}</h2><p>${reason.text}</p><p>Your completed modules are safe. Retry this delivery with a fresh lander and suit.</p>${actions([['retry','Retry delivery ↗',true],['manual','Flight manual',false],['menu','Main menu',false]])}`);on('retry',()=>launch(index));on('manual',showHelp);on('menu',title);}
function finishMission(){
 const m=missions[index];progress.completed=index+1;progress.time+=missionTime;progress.landings[index]=touchdown;save();state='between';setEngine(false);tone(660,.15,.06);setTimeout(()=>tone(880,.2,.04),160);
 if(progress.completed===6){state='complete';showDialog(`<div class="eyebrow"><span class="status-dot"></span> ALL SYSTEMS ONLINE</div><h2>Aurora Base.<br>We’re here to stay.</h2><p>Power, shelter, water, food, and a signal home. Six careful deliveries turned a quiet crater into a new beginning.</p><div class="brief-stats"><div><strong>6/6</strong><span>MODULES ONLINE</span></div><div><strong>${formatTime(progress.time)}</strong><span>MISSION TIME</span></div><div><strong>${progress.crashes}</strong><span>RETRIES</span></div></div>${actions([['viewBase','View completed base',true],['menu','Main menu',false],['new','New expedition',false]])}`);on('viewBase',()=>{hideDialog();toggleMap(true);});on('menu',title);on('new',newCampaign);return;}
 const next=missions[index+1];showDialog(`<div class="eyebrow"><span class="status-dot"></span> DELIVERY ${String(index+1).padStart(2,'0')} COMPLETE</div><h2>${m.cargo} online.</h2><p>You made it back to the lander. The next cargo is ready in orbit.</p><div class="panel" style="padding:18px;margin-top:20px"><div class="eyebrow">NEXT / ${next.role}</div><h2 style="font-size:25px;margin:12px 0">${next.name}</h2><p style="margin:0">${next.description}</p></div>${actions([['next','Launch next delivery ↗',true],['sector','Review sector map',false],['menu','Main menu',false]])}`);on('next',()=>launch(progress.completed));on('sector',()=>toggleMap());on('menu',title);
}
function formatTime(t){return Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');}
function interact(){
 if(state==='landed'){
  astronaut={x:ship.x+29,y:ground(ship.x+29),oxygen:95,carrying:false,dir:1,walk:0};state='eva';toast('Press E beside the lander to collect your cargo.');tone(350,.08,.04);
 }else if(state==='eva'){
  const nearShip=Math.abs(astronaut.x-ship.x)<50;
  if(nearShip&&installed){finishMission();return;}
  if(nearShip&&cargoOnShip){cargoOnShip=false;astronaut.carrying=true;toast('Cargo collected. Walk to the amber marker, then hold E to assemble.');tone(520,.08,.04);}
  else if(nearShip&&!astronaut.carrying){astronaut.oxygen=95;toast('Suit oxygen replenished. Retrieve the cargo beside your lander.');}
  else if(nearShip&&astronaut.carrying){toast('Cargo in hand. Carry it to the amber construction marker.');}
 }
}
function update(dt){
 elapsed+=dt;if(toastTime>0){toastTime-=dt;if(toastTime<=0)$('toast').classList.remove('visible');}
 if(!paused&&!mapOpen&&['flying','landed','eva'].includes(state)){
  missionTime+=dt;
  if(pressed.KeyE)interact();
  if(state==='flying'){
   const rotation=(keys.ArrowRight||keys.KeyD?1:0)-(keys.ArrowLeft||keys.KeyA?1:0);
   ship.angle+=rotation*1.28*dt;
   if(!rotation)ship.angle*=Math.exp(-1.25*dt);
   if(keys.ArrowDown||keys.KeyS)ship.angle*=Math.exp(-4*dt);
   ship.angle=clamp(ship.angle,-1.25,1.25);
   ship.thrust=!!((keys.ArrowUp||keys.KeyW||keys.Space)&&ship.fuel>0);
   if(ship.thrust){ship.vx+=Math.sin(ship.angle)*THRUST*dt;ship.vy-=Math.cos(ship.angle)*THRUST*dt;ship.fuel=Math.max(0,ship.fuel-4.1*dt);emitExhaust(dt);}
   ship.vy+=GRAVITY*dt;ship.vx*=Math.exp(-.018*dt);ship.x+=ship.vx*dt;ship.y+=ship.vy*dt;
   if(ship.x<25||ship.x>WORLD-25){ship.x=clamp(ship.x,25,WORLD-25);ship.vx*=-.2;}
   if(ship.y<40){ship.y=40;ship.vy=Math.max(0,ship.vy);}
   const feet=ship.y+25, floor=Math.min(ground(ship.x-16),ground(ship.x+16));
   if(feet>=floor){
    const slope=Math.abs(ground(ship.x+18)-ground(ship.x-18))/36;
    if(ship.vy<27&&Math.abs(ship.vx)<22&&Math.abs(ship.angle)<12*Math.PI/180&&slope<.24){
     touchdown={vertical:ship.vy/10,horizontal:Math.abs(ship.vx)/10,fuel:ship.fuel};ship.y=floor-25;ship.vx=0;ship.vy=0;ship.angle=0;ship.thrust=false;state='landed';tone(420,.12,.05);toast('Touchdown confirmed. Press E to begin your surface walk.',6);
    }else{for(let i=0;i<65;i++)particles.push({x:ship.x,y:ship.y,vx:(Math.random()-.5)*160,vy:-Math.random()*140,life:1.5,max:1.5,r:Math.random()*5+1,color:i%3?'#b9b5a9':'#ffbc7c'});fail({title:'A hard landing.',text:'Touch down below 2.7 m/s vertically and 2.2 m/s sideways. Keep the lander upright and aim for a flat pad.'});}
   }
   setEngine(ship.thrust);
  }else{ship.thrust=false;setEngine(false);}
  if(state==='eva'){
   const move=(keys.ArrowRight||keys.KeyD?1:0)-(keys.ArrowLeft||keys.KeyA?1:0);astronaut.x=clamp(astronaut.x+move*(astronaut.carrying?40:58)*dt,20,WORLD-20);astronaut.y=ground(astronaut.x);if(move){astronaut.dir=move;astronaut.walk+=dt*9;}
   astronaut.oxygen=Math.max(0,astronaut.oxygen-dt);
   const site=missions[index].x+116;
   const canBuild=astronaut.carrying&&!installed&&Math.abs(astronaut.x-site)<34;
   $('buildWrap').hidden=!(canBuild||buildTime>0&&!installed);
   if(canBuild&&keys.KeyE){buildTime=Math.min(6,buildTime+dt);$('buildLabel').textContent='ASSEMBLING '+Math.round(buildTime/6*100)+'%';$('buildBar').style.width=(buildTime/6*100)+'%';if(buildTime>=6){installed=true;astronaut.carrying=false;$('buildWrap').hidden=true;toast('Module online. Return to your lander and press E.',8);tone(740,.3,.06);}}
   else if(canBuild){$('buildLabel').textContent='HOLD E TO ASSEMBLE';$('buildBar').style.width=(buildTime/6*100)+'%';}
   if(astronaut.oxygen<=0){$('buildWrap').hidden=true;fail({title:'Suit oxygen depleted.',text:'Keep your lander close to the construction marker. Collect the cargo with E, hold E at the marker, then head straight back.'});}
   else if(astronaut.oxygen<25&&astronaut.oxygen+dt>=25){toast('Oxygen reserve: 25 seconds. Return to the lander.',7);tone(180,.3,.08);}
  }
 }
 if(paused||mapOpen){setEngine(false);}else{for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=8*dt;p.life-=dt;}particles=particles.filter(p=>p.life>0);}
 updateCamera(dt);hudClock+=dt;if(hudClock>.08){updateHud();hudClock=0;}pressed={};
}
function updateCamera(dt){
 let tx,ty,z;
 if(state==='title'){tx=1820+Math.sin(elapsed*.045)*180;ty=400;z=Math.min(W/2200,H/800);}
 else if(state==='complete'&&!mapOpen){tx=1850;ty=470;z=Math.min(W/3300,H/950);}
 else{const target=state==='eva'?astronaut:ship;z=cameraZoom();tx=target.x+(state==='flying'?ship.vx*.75:0);ty=target.y+(state==='flying'?90:-80);if(W<600){ty-=115;tx+=40;}tx=clamp(tx,W/z*.37,WORLD-W/z*.37);}
 const smooth=1-Math.exp(-3*dt);camera.x=lerp(camera.x,tx,smooth);camera.y=lerp(camera.y,ty,smooth);camera.z=lerp(camera.z,z,smooth);
}
function updateHud(){
 if(state==='title')return;const m=missions[index],eva=state==='eva';
 $('phase').textContent=`${eva?'SURFACE EVA':state==='landed'?'TOUCHDOWN':'CARGO DESCENT'} / ${String(index+1).padStart(2,'0')}`;
 $('missionTitle').textContent=m.name;
 $('objective').textContent=eva?(installed?'Module online. Return to the lander and press E.':astronaut.carrying?'Carry cargo to the amber marker. Hold E to assemble.':'Press E beside the lander to collect cargo.'):(state==='landed'?'Press E to exit and collect your cargo.':`Deliver ${m.cargo.toLowerCase()} to the illuminated pad.`);
 $('missionProgress').innerHTML=missions.map((_,i)=>`<i class="${i<progress.completed?'done':i===index?'current':''}"></i>`).join('');
 const resource=eva?astronaut.oxygen/95*100:ship.fuel;$('resourceLabel').textContent=eva?'SUIT OXYGEN':'PROPELLANT';$('fuelText').innerHTML=eva?`${Math.ceil(astronaut.oxygen)}<span> sec</span>`:`${Math.round(ship.fuel)}<span>%</span>`;$('fuelBar').style.width=resource+'%';$('fuelBar').style.background=resource<28?'var(--amber)':'var(--cyan)';
 $('verticalLabel').textContent=eva?'CARGO':'VERTICAL';$('verticalText').innerHTML=eva?(installed?'BUILT':astronaut.carrying?'IN HAND':'ON SHIP'):`${Math.abs(ship.vy/10).toFixed(1)} <small>${ship.vy<-.1?'↑':'↓'} m/s</small>`;$('verticalText').style.fontSize=eva?'18px':'';$('verticalText').style.color=!eva&&ship.vy>27?'var(--amber)':'';
 $('verticalNote').textContent=eva?(installed?'RETURN TO LANDER':'HOLD E AT MARKER'):'SAFE BELOW 2.7';
 $('altitudeLabel').textContent=eva?(installed?'TO LANDER':'TO SITE'):'ALTITUDE';const distance=eva?Math.abs(astronaut.x-(installed?ship.x:m.x+116)):Math.max(0,ground(ship.x)-ship.y-25);$('altitudeText').innerHTML=`${(distance/10).toFixed(1)} <small>m</small>`;$('altitudeNote').textContent=eva?'WALK ← →':'ABOVE TERRAIN';
 $('hint').innerHTML=eva?'← → Walk &nbsp; E Cargo / Return &nbsp; Hold E Build':state==='landed'?'E Exit lander &nbsp; M Sector map':'↑ Thrust &nbsp; ← → Tilt &nbsp; E Interact &nbsp; M Map';
 $('touchInteract').textContent=eva?(installed?'ENTER':astronaut.carrying?'BUILD':'CARGO'):'EVA';
}
function emitExhaust(dt){const count=Math.ceil(dt*80);for(let i=0;i<count;i++){const a=ship.angle;particles.push({x:ship.x-Math.sin(a)*18,y:ship.y+Math.cos(a)*18,vx:-Math.sin(a)*(60+Math.random()*70)+(Math.random()-.5)*20,vy:Math.cos(a)*(60+Math.random()*70),life:.3+Math.random()*.3,max:.6,r:Math.random()*3+1,color:Math.random()>.4?'#8be9dd':'#ffbc7c'});}}
function screen(x,y){return{x:(x-camera.x)*camera.z+W/2,y:(y-camera.y)*camera.z+H*.5};}
function line(x1,y1,x2,y2,color,width=1){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
function rounded(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function render(){
 const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#040912');sky.addColorStop(.6,'#0b1828');sky.addColorStop(1,'#132635');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
 for(const s of stars){ctx.globalAlpha=s.a;ctx.fillStyle='#d2e6ed';ctx.beginPath();ctx.arc(((s.x*W-camera.x*.025)%W+W)%W,s.y*H,s.r,0,TAU);ctx.fill();}ctx.globalAlpha=1;
 drawEarth(W*.79-camera.x*.018,H*.22,Math.min(29,W*.027));
 // Distant rim silhouettes, parallax separates them from the playable terrain.
 for(let layer=0;layer<3;layer++){ctx.beginPath();ctx.moveTo(0,H);for(let x=-20;x<=W+20;x+=20){let wx=x+camera.x*(.08+layer*.03);let y=H*(.64+layer*.065)-Math.sin(wx*.003+layer*2)*H*.055-Math.cos(wx*.009+layer)*H*.025;ctx.lineTo(x,y);}ctx.lineTo(W,H);ctx.closePath();ctx.fillStyle=['#102030','#172c3b','#1f3543'][layer];ctx.fill();}
 ctx.save();ctx.translate(W/2-camera.x*camera.z,H/2-camera.y*camera.z);ctx.scale(camera.z,camera.z);
 drawTerrain();drawCables();
 missions.forEach((m,i)=>{drawPad(m,i);if(i<progress.completed||(i===index&&installed))drawModule(m,i);else drawGhost(m,i);});
 // Scattered boulders and surface flecks.
 for(const d of dust){const gy=ground(d.x);ctx.fillStyle=`rgba(180,199,210,${d.a})`;ctx.beginPath();ctx.ellipse(d.x,gy+d.y,d.r*2,d.r,0,0,TAU);ctx.fill();}
 for(let i=0;i<32;i++){let x=(i*137+72)%WORLD;if(missions.some(m=>Math.abs(m.x-x)<180))continue;const y=ground(x);ctx.beginPath();ctx.moveTo(x-8,y);ctx.lineTo(x-5,y-6-i%4);ctx.lineTo(x+3,y-10-i%5);ctx.lineTo(x+10,y);ctx.closePath();ctx.fillStyle='#40515f';ctx.fill();line(x-5,y-6-i%4,x+3,y-10-i%5,'#6e7c83',.7);}
 if(state==='title'){const activeShip=ship;ship={x:camera.x+W/camera.z*.25,y:405+Math.sin(elapsed*.7)*7,angle:-.13,fuel:100,thrust:true};drawShip();ship=activeShip;}
 else if(ship){drawShip();if(astronaut&&state!=='flying'&&state!=='landed')drawAstronaut();}
 for(const p of particles){ctx.globalAlpha=p.life/p.max;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,TAU);ctx.fill();}ctx.globalAlpha=1;
 ctx.restore();
 if(['flying','landed','eva'].includes(state))drawGuidance();
 const vignette=ctx.createRadialGradient(W*.5,H*.45,H*.15,W*.5,H*.45,Math.max(W,H)*.7);vignette.addColorStop(0,'transparent');vignette.addColorStop(1,'#02070d99');ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
}
function drawEarth(x,y,r){ctx.save();ctx.translate(x,y);ctx.rotate(-.3);ctx.shadowBlur=18;ctx.shadowColor='#69bfdd40';ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fillStyle='#5a9bb6';ctx.fill();ctx.shadowBlur=0;ctx.save();ctx.clip();ctx.fillStyle='#a7c4ba';ctx.beginPath();ctx.moveTo(-r*.8,-r*.4);ctx.lineTo(-r*.2,-r*.65);ctx.lineTo(r*.2,-r*.2);ctx.lineTo(0,r*.1);ctx.lineTo(r*.2,r*.45);ctx.lineTo(-r*.1,r*.85);ctx.lineTo(-r*.5,r*.2);ctx.closePath();ctx.fill();ctx.strokeStyle='#dbe9e7aa';ctx.lineWidth=r*.12;for(let i=0;i<4;i++){ctx.beginPath();ctx.ellipse(0,-r*.6+i*r*.4,r*.9,r*.13,-.2,0,Math.PI);ctx.stroke();}const shade=ctx.createLinearGradient(-r,0,r,0);shade.addColorStop(0,'#06132300');shade.addColorStop(.5,'#06132344');shade.addColorStop(1,'#061323ff');ctx.fillStyle=shade;ctx.fillRect(-r,-r,r*2,r*2);ctx.restore();ctx.restore();}
function drawTerrain(){
 ctx.beginPath();ctx.moveTo(-200,1200);for(let x=0;x<=WORLD;x+=5)ctx.lineTo(x,ground(x));ctx.lineTo(WORLD+200,1200);ctx.closePath();const g=ctx.createLinearGradient(0,480,0,1100);g.addColorStop(0,'#5e6b70');g.addColorStop(.35,'#303e4b');g.addColorStop(1,'#141f2d');ctx.fillStyle=g;ctx.fill();
 ctx.save();ctx.clip();
 const shadow=ctx.createLinearGradient(850,0,2700,0);shadow.addColorStop(0,'#060c1500');shadow.addColorStop(.2,'#03091280');shadow.addColorStop(.7,'#03091290');shadow.addColorStop(1,'#060c1500');ctx.fillStyle=shadow;ctx.fillRect(0,400,WORLD,900);
 for(let i=0;i<18;i++){ctx.beginPath();for(let x=0;x<=WORLD;x+=15){const y=ground(x)+30+i*23+Math.sin(x*.008+i*.8)*10;x===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.strokeStyle=i%3===0?'#b3c3c40b':'#09111f25';ctx.lineWidth=1;ctx.stroke();}
 // Long shadows across the permanently dark crater floor.
 ctx.fillStyle='#02081228';ctx.beginPath();ctx.moveTo(890,625);ctx.lineTo(1520,1120);ctx.lineTo(2800,1120);ctx.lineTo(2740,645);ctx.lineTo(2300,800);ctx.closePath();ctx.fill();ctx.restore();
 ctx.beginPath();for(let x=0;x<=WORLD;x+=5)x===0?ctx.moveTo(x,ground(x)):ctx.lineTo(x,ground(x));ctx.strokeStyle='#9aa8ad77';ctx.lineWidth=1.3;ctx.stroke();
 // Sunlight catches only the upper rim.
 for(const [a,b] of [[0,720],[2920,3270]]){ctx.beginPath();for(let x=a;x<=b;x+=4)x===a?ctx.moveTo(x,ground(x)):ctx.lineTo(x,ground(x));ctx.strokeStyle='#e2c49a8c';ctx.lineWidth=2.2;ctx.stroke();}
}
function drawCables(){for(let i=1;i<missions.length;i++){if(i>progress.completed&&!(i===index&&installed))continue;const a=missions[i-1],b=missions[i];ctx.beginPath();for(let x=a.x+110;x<=b.x+110;x+=10){const y=ground(x)+3;x===a.x+110?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.strokeStyle='#8be9dd70';ctx.lineWidth=1.4;ctx.stroke();}}
function drawPad(m,i){
 const current=i===index&&state!=='title'&&progress.completed<6;line(m.x-95,m.y,m.x+65,m.y,'#8da4ae',3);line(m.x-95,m.y+4,m.x+65,m.y+4,'#1e2c37',4);
 for(let x=m.x-85;x<=m.x+65;x+=30){line(x,m.y-1,x+8,m.y-1,current?'#ffbc7c':'#758e9b',3);}
 for(const x of [m.x-100,m.x+70]){line(x,m.y,x,m.y-13,'#7f949c',1.5);ctx.fillStyle=current?'#ffbc7c':'#8be9dd';ctx.shadowBlur=current?18:6;ctx.shadowColor=ctx.fillStyle;ctx.fillRect(x-2,m.y-15,4,3);ctx.shadowBlur=0;}
 ctx.font='9px monospace';ctx.fillStyle=current?'#e6c5a5':'#7b929f';ctx.textAlign='center';ctx.fillText(`LZ ${String(i+1).padStart(2,'0')}`,m.x-15,m.y+19);
 if(current&&!installed){ctx.save();ctx.globalAlpha=.24+Math.sin(elapsed*2)*.08;const g=ctx.createLinearGradient(0,m.y-170,0,m.y);g.addColorStop(0,'#ffbc7c00');g.addColorStop(1,'#ffbc7c55');ctx.fillStyle=g;ctx.fillRect(m.x-94,m.y-170,160,170);ctx.restore();}
}
function drawGhost(m,i){
 const x=m.x+116,y=m.y;const current=i===index&&state!=='title'&&progress.completed<6;ctx.save();ctx.setLineDash([4,5]);ctx.strokeStyle=current?'#ffbc7c88':'#9fb6ca26';ctx.lineWidth=1;ctx.strokeRect(x-23,y-39,46,37);ctx.setLineDash([]);line(x-30,y,x+30,y,current?'#ffbc7c99':'#9fb6ca20',1);
 if(current){ctx.textAlign='center';ctx.font='9px monospace';ctx.fillStyle='#ffbc7c';ctx.fillText('BUILD SITE',x,y-54);const bounce=Math.sin(elapsed*3)*3;ctx.beginPath();ctx.moveTo(x-5,y-75+bounce);ctx.lineTo(x,y-70+bounce);ctx.lineTo(x+5,y-75+bounce);ctx.strokeStyle='#ffbc7c';ctx.stroke();}
 ctx.restore();
}
function drawModule(m,i){
 ctx.save();ctx.translate(m.x+116,m.y);ctx.lineWidth=1;const metal='#bac6ca',dark='#172a39',teal='#8be9dd';
 ctx.fillStyle='#02060a66';ctx.beginPath();ctx.ellipse(18,2,60,5,0,0,TAU);ctx.fill();
 if(i===0){for(const x of [-28,25]){line(x,0,x,-30,metal,3);ctx.save();ctx.translate(x,-38);ctx.transform(1,-.12,.3,1,0,0);rounded(-23,-12,46,25,1,'#173c57','#8ca6b5');for(let n=-15;n<20;n+=8)line(n,-10,n,11,'#74a5ba77',.6);line(-21,0,21,0,'#74a5ba77',.6);ctx.restore();}rounded(-9,-17,18,17,2,dark,metal);}
 if(i===1){rounded(-17,-26,34,26,3,metal,'#e0e7e7');rounded(-12,-21,24,14,2,dark);for(let j=0;j<3;j++){ctx.fillStyle=teal;ctx.fillRect(-8+j*7,-17,3,2);}line(0,-26,0,-51,metal,2);line(-11,-44,11,-44,metal,1.5);ctx.fillStyle=teal;ctx.fillRect(-2,-54,4,3);}
 if(i===2){rounded(-39,-42,78,37,12,metal,'#e5e9e6');rounded(-25,-35,22,22,6,'#233b4e','#647e8c');rounded(6,-35,20,22,6,'#233b4e','#647e8c');ctx.fillStyle=teal;ctx.globalAlpha=.5;ctx.fillRect(-20,-31,11,13);ctx.fillRect(11,-31,9,13);ctx.globalAlpha=1;rounded(-46,-29,15,25,3,'#d1d4ce','#758993');line(-28,-5,-28,0,metal,3);line(26,-5,26,0,metal,3);rounded(-9,-50,18,8,2,'#344a58',metal);}
 if(i===3){rounded(-29,-31,36,29,4,'#8fa8b1',metal);rounded(-23,-25,23,14,2,dark);line(19,0,19,-55,metal,4);line(-2,-48,35,-48,metal,3);for(let y=-46;y<0;y+=9)line(14,y,24,y+7,'#c6d2d3',2);rounded(11,-59,16,8,2,'#b9c6c9');ctx.fillStyle=teal;ctx.fillRect(-18,-20,10,2);line(4,-7,17,-7,'#8be9dd',2);}
 if(i===4){ctx.beginPath();ctx.ellipse(0,-6,42,38,0,Math.PI,0);ctx.lineTo(42,-3);ctx.lineTo(-42,-3);ctx.closePath();const g=ctx.createLinearGradient(0,-42,0,0);g.addColorStop(0,'#8bdedb77');g.addColorStop(1,'#2b5b5d');ctx.fillStyle=g;ctx.fill();ctx.strokeStyle=metal;ctx.stroke();line(0,-44,0,-4,'#b8d1ce',1);ctx.beginPath();ctx.ellipse(0,-6,20,38,0,Math.PI,0);ctx.stroke();for(let x=-25;x<=25;x+=12){line(x,-4,x,-15,'#7fcf9a',2);line(x,-12,x-4,-17,'#7fcf9a',2);}rounded(-43,-7,86,7,2,metal);}
 if(i===5){line(0,0,0,-54,metal,4);line(-20,0,0,-43,metal,2);line(20,0,0,-43,metal,2);ctx.save();ctx.translate(0,-54);ctx.rotate(-.6);ctx.beginPath();ctx.arc(0,-15,24,0,Math.PI);ctx.quadraticCurveTo(0,18,-24,-15);ctx.fillStyle=metal;ctx.fill();ctx.strokeStyle='#dde4e3';ctx.stroke();line(0,-2,0,-25,'#c9dbdf',1);ctx.restore();rounded(-21,-16,18,16,2,dark,metal);ctx.fillStyle=teal;ctx.fillRect(-17,-12,7,3);}
 ctx.shadowColor=teal;ctx.shadowBlur=10;ctx.fillStyle=teal;ctx.fillRect(-2,-3,4,2);ctx.shadowBlur=0;ctx.font='8px monospace';ctx.fillStyle='#9ac0c5';ctx.textAlign='center';ctx.fillText(m.short+' / ONLINE',0,20);ctx.restore();
}
function drawShip(){
 const x=ship.x,y=ship.y;ctx.fillStyle='#03070d66';ctx.beginPath();ctx.ellipse(x+12,ground(x)+2,clamp(25-(ground(x)-y)*.035,5,25),3,0,0,TAU);ctx.fill();if(state==='failed'&&particles.length)return;
 ctx.save();ctx.translate(x,y);ctx.rotate(ship.angle);
 if(ship.thrust){const f=22+Math.random()*22;const g=ctx.createLinearGradient(0,12,0,12+f);g.addColorStop(0,'#f1fff7');g.addColorStop(.2,'#8be9dd');g.addColorStop(1,'#8be9dd00');ctx.beginPath();ctx.moveTo(-6,15);ctx.lineTo(0,18+f);ctx.lineTo(6,15);ctx.closePath();ctx.fillStyle=g;ctx.fill();}
 line(-13,5,-25,25,'#b6c4c9',2.5);line(13,5,25,25,'#b6c4c9',2.5);line(-12,15,-24,25,'#6a8695',1.5);line(12,15,24,25,'#6a8695',1.5);line(-30,25,-20,25,'#e0ded0',2);line(20,25,30,25,'#e0ded0',2);
 ctx.beginPath();ctx.moveTo(-15,12);ctx.lineTo(-17,-6);ctx.lineTo(-9,-18);ctx.lineTo(9,-18);ctx.lineTo(17,-6);ctx.lineTo(15,12);ctx.closePath();const hull=ctx.createLinearGradient(-17,0,17,0);hull.addColorStop(0,'#c3cec9');hull.addColorStop(.5,'#eff0e6');hull.addColorStop(1,'#839ca7');ctx.fillStyle=hull;ctx.fill();ctx.strokeStyle='#edf1e5';ctx.lineWidth=.8;ctx.stroke();
 rounded(-9,-13,18,10,3,'#142f44','#668d9e');line(-6,-11,4,-11,'#a2d6e0',1);rounded(-18,5,36,9,2,'#a88d60','#ddc593');rounded(-6,14,12,4,1,'#384e58');line(13,-12,20,-24,'#7a939f',1);ctx.fillStyle='#8be9dd';ctx.fillRect(19,-25,2,2);
 if(cargoOnShip&&!installed){rounded(-9,0,18,11,2,'#294151','#748f9c');line(-5,3,5,3,'#ffbc7c',1.5);}ctx.restore();
 if(state==='landed'||state==='eva'){ctx.textAlign='center';ctx.font='9px monospace';ctx.fillStyle='#8be9dd';ctx.fillText('LANDER',x,y-38);}
}
function drawAstronaut(){
 const a=astronaut;ctx.save();ctx.translate(a.x,a.y);const step=Math.sin(a.walk)*3;ctx.fillStyle='#02060b70';ctx.beginPath();ctx.ellipse(3,0,11,2,0,0,TAU);ctx.fill();rounded(-8,-24,7,16,2,'#7d949f');line(-3,-9,-4-step,-1,'#d9dfd8',4);line(3,-9,4+step,-1,'#c2d0ce',4);rounded(-6,-24,12,16,4,'#e1e4d9','#97acb1');line(-6,-20,-9,-11,'#e1e4d9',3);line(6,-20,9,-11,'#d5dfd9',3);ctx.beginPath();ctx.arc(0,-29,8,0,TAU);ctx.fillStyle='#e6e7da';ctx.fill();rounded(a.dir>0?-1:-7,-33,8,7,3,'#1a394c','#d8ba7b');ctx.fillStyle='#ffbc7c';ctx.fillRect(-2,-21,4,3);
 // Small pool of suit light makes surface work readable in the shadow.
 ctx.save();ctx.globalCompositeOperation='screen';const light=ctx.createRadialGradient(0,-10,0,0,-10,65);light.addColorStop(0,'#a2dfe210');light.addColorStop(1,'#a2dfe200');ctx.fillStyle=light;ctx.fillRect(-65,-75,130,130);ctx.restore();
 if(a.carrying){rounded(a.dir>0?7:-21,-21,14,14,2,'#455965','#b5c7cc');line(a.dir>0?9:-19,-17,a.dir>0?18:-10,-17,'#ffbc7c',2);}ctx.restore();
}
function drawGuidance(){
 const m=missions[index],targetX=state==='eva'?(installed?ship.x:m.x+116):m.x-15;const targetY=ground(targetX)-50;const p=screen(targetX,targetY);const visible=p.x>45&&p.x<W-45&&p.y>85&&p.y<H-60;
 if(!visible){const x=clamp(p.x,40,W-40),y=clamp(p.y,340,H-65);ctx.fillStyle='#ffbc7c';ctx.font='11px monospace';ctx.textAlign=p.x<40?'left':'right';ctx.fillText((p.x<40?'◀ ':'')+(state==='eva'&&installed?'LANDER':'TARGET')+(p.x>W-40?' ▶':''),x,y);ctx.fillStyle='#a8b8c2';ctx.font='9px monospace';ctx.fillText((Math.abs((state==='eva'?astronaut.x:ship.x)-targetX)/10).toFixed(0)+' m',x,y+17);}
 if(state==='flying'){
  const pos=screen(ship.x,ship.y);ctx.strokeStyle='#8be9dd33';ctx.lineWidth=1;ctx.beginPath();ctx.arc(pos.x,pos.y,47*camera.z,-.3,.3);ctx.stroke();ctx.beginPath();ctx.arc(pos.x,pos.y,47*camera.z,Math.PI-.3,Math.PI+.3);ctx.stroke();
  ctx.font='9px monospace';ctx.fillStyle=Math.abs(ship.vx)>22?'#ffbc7c':'#8fa9b7';ctx.textAlign='left';ctx.fillText(`H ${Math.abs(ship.vx/10).toFixed(1)} m/s`,pos.x+55*camera.z,pos.y+5);ctx.fillStyle=Math.abs(ship.angle)>12*Math.PI/180?'#ffbc7c':'#8fa9b7';ctx.fillText(`${Math.round(ship.angle*180/Math.PI)}°`,pos.x+55*camera.z,pos.y+19);
 }
 if(state==='eva'){
  const a=screen(astronaut.x,astronaut.y-45);ctx.textAlign='center';ctx.font='9px monospace';ctx.fillStyle=astronaut.oxygen<25?'#ffbc7c':'#8be9dd';ctx.fillText(Math.ceil(astronaut.oxygen)+'s O₂',a.x,a.y);
  const near=Math.abs(astronaut.x-ship.x)<50;const atSite=Math.abs(astronaut.x-(m.x+116))<34;
  if(near||atSite){ctx.font='10px monospace';ctx.fillStyle='#dce8e5';ctx.fillText(near?(installed?'E · RETURN':cargoOnShip?'E · COLLECT CARGO':''):(astronaut.carrying?'HOLD E · BUILD':''),a.x,a.y-20);}
 }
}
function toggleMap(force=false){
 if(state==='title')return;mapOpen=force||!mapOpen;$('map').hidden=!mapOpen;keys={};pressed={};setEngine(false);
 if(mapOpen){drawMap();$('closeMap').focus();}else if(state==='complete'){$('overlay').hidden=false;}
}
function drawMap(){
 const c=$('mapCanvas'),r=c.getBoundingClientRect();c.width=r.width*dpr;c.height=r.height*dpr;const g=c.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);const w=r.width,h=r.height,s=Math.min((w-40)/WORLD,(h-60)/650),ox=(w-WORLD*s)/2,oy=h*.2-380*s;
 g.clearRect(0,0,w,h);g.beginPath();g.moveTo(ox,oy+1100*s);for(let x=0;x<=WORLD;x+=10)g.lineTo(ox+x*s,oy+ground(x)*s);g.lineTo(ox+WORLD*s,oy+1100*s);g.fillStyle='#293c4c';g.fill();g.beginPath();for(let x=0;x<=WORLD;x+=10)x===0?g.moveTo(ox,oy+ground(0)*s):g.lineTo(ox+x*s,oy+ground(x)*s);g.strokeStyle='#718591';g.lineWidth=1;g.stroke();
 missions.forEach((m,i)=>{const x=ox+m.x*s,y=oy+m.y*s;g.fillStyle=i<progress.completed?'#8be9dd':i===index?'#ffbc7c':'#708594';g.beginPath();g.arc(x,y-6,4,0,TAU);g.fill();g.textAlign='center';g.font='10px monospace';g.fillText(String(i+1).padStart(2,'0'),x,y-20);g.setLineDash([3,4]);g.beginPath();g.moveTo(x,y+5);g.lineTo(x,h-15);g.strokeStyle='#8da9ba20';g.stroke();g.setLineDash([]);});
 if(ship){g.fillStyle='#f5f2dc';g.beginPath();g.arc(ox+ship.x*s,oy+ship.y*s,3,0,TAU);g.fill();}
 $('mapLegend').innerHTML=missions.map((m,i)=>`<div class="${i<progress.completed?'done':i===index?'current':''}"><b>${String(i+1).padStart(2,'0')} ${m.cargo}</b>${i<progress.completed?'System online':i===index?'Current delivery':'Awaiting cargo'}</div>`).join('');
}
function tone(freq,duration,gain){if(!audioEnabled)return;initAudio();const osc=audioContext.createOscillator(),volume=audioContext.createGain();osc.type='sine';osc.frequency.value=freq;volume.gain.setValueAtTime(gain,audioContext.currentTime);volume.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);osc.connect(volume).connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+duration);}
function initAudio(){try{if(!audioContext){audioContext=new(window.AudioContext||window.webkitAudioContext)();engine=audioContext.createOscillator();engineGain=audioContext.createGain();engine.type='sawtooth';engine.frequency.value=48;const filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.value=170;engineGain.gain.value=0;engine.connect(filter).connect(engineGain).connect(audioContext.destination);engine.start();}audioContext.resume();}catch(e){audioEnabled=false;}}
function setEngine(active){if(engineGain&&audioContext)engineGain.gain.setTargetAtTime(active&&audioEnabled?.035:0,audioContext.currentTime,.08);}
on('sound',()=>{audioEnabled=!audioEnabled;if(audioEnabled)initAudio();$('sound').textContent=audioEnabled?'Sound on':'Sound off';$('sound').setAttribute('aria-label',audioEnabled?'Disable sound':'Enable sound');setEngine(false);});
on('help',showHelp);on('pause',togglePause);on('home',e=>{e.preventDefault();if(state==='title')return;paused=true;pauseDialog();});on('mapButton',()=>toggleMap());on('closeMap',()=>toggleMap());
const allowed=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyW','KeyA','KeyS','KeyD','KeyE','KeyM','KeyP','Escape','KeyR']);
window.addEventListener('keydown',e=>{if(!allowed.has(e.code))return;if(e.code==='Space'&&e.target instanceof HTMLButtonElement&&(!$('overlay').hidden||mapOpen))return;e.preventDefault();if(e.repeat)return;if(e.code==='KeyM'){toggleMap();return;}if(e.code==='Escape'||e.code==='KeyP'){togglePause();return;}if(e.code==='KeyR'&&['flying','landed','eva','failed'].includes(state)&&!mapOpen){launch(index);return;}if(!keys[e.code])pressed[e.code]=true;keys[e.code]=true;});
window.addEventListener('keyup',e=>{delete keys[e.code];});
document.querySelectorAll('[data-key]').forEach(button=>{button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);const code=button.dataset.key;if(!keys[code])pressed[code]=true;keys[code]=true;button.classList.add('active');});const release=()=>{delete keys[button.dataset.key];button.classList.remove('active');};button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);});
function loseFocus(){keys={};pressed={};document.querySelectorAll('[data-key]').forEach(b=>b.classList.remove('active'));if(['flying','landed','eva'].includes(state)&&!paused&&!mapOpen){paused=true;pauseDialog();}setEngine(false);}
window.addEventListener('blur',loseFocus);document.addEventListener('visibilitychange',()=>{if(document.hidden)loseFocus();});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;$('install').hidden=false;});on('install',async()=>{if(!deferredInstall)return;await deferredInstall.prompt();deferredInstall=null;$('install').hidden=true;});
window.addEventListener('appinstalled',()=>{$('install').hidden=true;toast('Moon Base installed. Ready for your next expedition.');});
if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
function frame(now){const dt=Math.min((now-last)/1000||0,.04);last=now;update(dt);render();requestAnimationFrame(frame);}
title();requestAnimationFrame(frame);
})();
