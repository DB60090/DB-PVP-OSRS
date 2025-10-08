/* PvP (offline) — iPhone + Food + Tick Specials + Random Loadouts + Loot + Inventory (consumable)
   + Armour + OSRS hitsplats + Stick-figure fighters & anims
   - Startup panel: Continue/Restart + "Save new loot to this device"
   - Inventory stores quantities; equipping from loot CONSUMES 1 at round start
   - Layout tuned for mobile: no overlaps; hitsplats above head
   - "Updated:" reads game.js Last-Modified (fallback to now)
*/

const W=420, H=640;
const config={
  type:Phaser.CANVAS, width:W, height:H, backgroundColor:'#1b2333',
  parent:'game', scale:{mode:Phaser.Scale.FIT, autoCenter:Phaser.Scale.CENTER_BOTH},
  scene:{ preload, create }
};
new Phaser.Game(config);

// -------- UI layout (tweak here) --------
const UI = {
  nameDy   : -96,
  loadoutDy: -80,
  armourDy : -66,
  hpDy     : -86,   // HP ABOVE head
  foodDy   : -28,   // below body
  specDy   : -14,   // below body
  hitsplatDy: -106, // well above head (never overlaps bars)
  arenaY   : H*0.44 // fighter baseline
};

// ---- Updated: stamp from game.js ----
function setUpdatedStampFromGameJs(){
  const el = document.getElementById('build');
  if(!el) return;
  const pad=n=>String(n).padStart(2,'0');
  const fmt=(d)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  try{
    const scripts=[...document.getElementsByTagName('script')];
    const me=scripts.find(sc=>/game\.js(?:\?|$)/.test(sc.src));
    const src=me?me.src:'./game.js';
    fetch(src, {method:'HEAD', cache:'no-cache'})
      .then(r=>{
        const lm=r.headers.get('last-modified');
        const when = lm ? new Date(lm) : new Date();
        el.textContent=`Updated: ${fmt(when)}`;
      })
      .catch(()=>{ el.textContent=`Updated: ${fmt(new Date())}`; });
  }catch(e){
    el.textContent=`Updated: ${fmt(new Date())}`;
  }
}

// ---- toggles ----
const SHOW_LOOT = true;  // set false to disable loot popup entirely
const KO_ANIM   = false; // death tween off for Safari stability

// ---- timing & balance ----
const TICK_MS=600, BASE_ACCURACY=0.80;
const EAT_AT_HP=50, FOOD_HEAL=20, FOOD_START=10, EAT_COST_TK=1;
const SPEC_MAX=100, SPEC_REGEN_PER_TICK=2;

// ---- mains & specs ----
const MAIN_WEAPONS=[
  // Melee
  {id:'dscim', name:'Dragon Scimitar', speedTicks:5, maxHit:48, style:'melee'},
  {id:'whip',  name:'Abyssal Whip',    speedTicks:4, maxHit:42, style:'melee'},
  // Ranged
  {id:'msb',   name:'Magic Shortbow',  speedTicks:5, maxHit:40, style:'ranged'},
  {id:'dkn',   name:'Dragon Knives',   speedTicks:3, maxHit:25, style:'ranged'},
  // Magic
  {id:'fsurge',name:'Fire Surge',      speedTicks:5, maxHit:48, style:'mage'},
  {id:'iblitz',name:'Ice Blitz',       speedTicks:5, maxHit:44, style:'mage'},
];
const SPEC_WEAPONS=[
  {id:'dds',    name:'Dragon Dagger',  cost:25, type:'dds'},
  {id:'dclaws', name:'Dragon Claws',   cost:50, type:'claws'},
  {id:'ags',    name:'Armadyl GS',     cost:50, type:'ags'},
  {id:'dbow',   name:'Dark Bow',       cost:50, type:'dbow'},
  {id:'vstaff', name:'Volatile Staff', cost:55, type:'vstaff'},
];
const MAIN_MAP=Object.fromEntries(MAIN_WEAPONS.map(w=>[w.id,w]));
const SPEC_MAP=Object.fromEntries(SPEC_WEAPONS.map(w=>[w.id,w]));

/* ================= Armour ================= */
const ARMOUR_SETS = [
  {id:'dragon_melee',  name:'Dragon',          affinity:'melee',  off:{acc:+0.04, dmg:+0.06}, def:{melee:{acc:-0.03,dmg:-0.03}}},
  {id:'barrows_melee', name:'Barrows',         affinity:'melee',  off:{acc:+0.06, dmg:+0.08}, def:{melee:{acc:-0.05,dmg:-0.05}}},
  {id:'nandos_melee',  name:"Nando's",         affinity:'melee',  off:{acc:+0.02, dmg:+0.03}, def:{melee:{acc:-0.02,dmg:-0.02}}},
  {id:'torva_melee',   name:'Torva',           affinity:'melee',  off:{acc:+0.08, dmg:+0.12}, def:{melee:{acc:-0.06,dmg:-0.06}, ranged:{acc:-0.02,dmg:-0.01}}},
  {id:'void_r',        name:'Void (Ranged)',   affinity:'ranged', off:{acc:+0.10, dmg:+0.10}, def:{ranged:{acc:-0.04,dmg:-0.04}}},
  {id:'evoid_r',       name:'Elite Void (R)',  affinity:'ranged', off:{acc:+0.12, dmg:+0.12}, def:{ranged:{acc:-0.05,dmg:-0.05}}},
  {id:'bdhide_r',      name:"Blessed d'hide",  affinity:'ranged', off:{acc:+0.07, dmg:+0.08}, def:{ranged:{acc:-0.05,dmg:-0.05}, mage:{acc:-0.01,dmg:0}}},
  {id:'zamorak_m',     name:'Zamorak Robes',   affinity:'mage',   off:{acc:+0.04, dmg:+0.06}, def:{mage:{acc:-0.04,dmg:-0.04}}},
  {id:'void_m',        name:'Void (Mage)',     affinity:'mage',   off:{acc:+0.10, dmg:+0.10}, def:{mage:{acc:-0.04,dmg:-0.04}}},
  {id:'evoid_m',       name:'Elite Void (M)',  affinity:'mage',   off:{acc:+0.12, dmg:+0.12}, def:{mage:{acc:-0.05,dmg:-0.05}}},
  {id:'ancestral_m',   name:'Ancestral',       affinity:'mage',   off:{acc:+0.08, dmg:+0.12}, def:{mage:{acc:-0.05,dmg:-0.05}, ranged:{acc:-0.01,dmg:0}}},
];
const ARMOUR_MAP = Object.fromEntries(ARMOUR_SETS.map(a=>[a.id,a]));

// ---- style colors ----
const SPLAT_COLOR = { melee:0xff6a6a, ranged:0x7ed957, mage:0x6fb9ff, zero:0x7fa7cc };

// ---- runtime ----
let s, ui={}, tickEvent=null, tickCount=0, duelActive=false, duelEnded=false, pendingKO=null;
let startupOpen = true;
let PERSIST_LOOT = true;

// ---- inventory (quantities) ----
let inventory = loadInventory();  // { mains:{}, specs:{} }
let nextEquipOverride = { mainId:null, specId:null }; // consumes 1 at round start

function emptyInv(){ return {mains:{}, specs:{}}; }
function loadInventory(){
  try{
    const raw=localStorage.getItem('pvp_inventory');
    if(!raw) return emptyInv();
    const o=JSON.parse(raw);
    if(Array.isArray(o.mains) || Array.isArray(o.specs)){ // migrate old save
      const mains={}, specs={};
      (o.mains||[]).forEach(id=>{ mains[id]=(mains[id]||0)+1; });
      (o.specs||[]).forEach(id=>{ specs[id]=(specs[id]||0)+1; });
      return {mains, specs};
    }
    return {mains:o.mains||{}, specs:o.specs||{}};
  }catch(e){ return emptyInv(); }
}
function saveInventory(){ if(!PERSIST_LOOT) return; try{ localStorage.setItem('pvp_inventory', JSON.stringify(inventory)); }catch(e){} }
function clearSavedInventory(){ try{ localStorage.removeItem('pvp_inventory'); }catch(e){} }
function invAdd(kind,id,count=1){ const bag=kind==='main'?inventory.mains:inventory.specs; bag[id]=(bag[id]||0)+count; saveInventory(); }
function invHas(kind,id,count=1){ const bag=kind==='main'?inventory.mains:inventory.specs; return (bag[id]||0)>=count; }
function invConsume(kind,id,count=1){ const bag=kind==='main'?inventory.mains:inventory.specs; if((bag[id]||0)<count) return false; bag[id]-=count; if(bag[id]<=0) delete bag[id]; saveInventory(); return true; }
function invTotals(){ const tot=o=>Object.values(o).reduce((a,b)=>a+b,0); return {mains:tot(inventory.mains), specs:tot(inventory.specs)}; }

function preload(){}

function create(){
  s=this;
  setUpdatedStampFromGameJs();

  styleReadableText(s.add.text(W/2,22,'RuneScape-Style PvP (Offline)',{font:'18px Arial',color:'#fff'}).setOrigin(0.5));
  s.add.rectangle(W/2,H*0.52,W*0.72,2,0x2a3a55);

  const leftX=W*0.28,rightX=W*0.72;
  const p=makeFighter({name:'You',x:leftX,y:UI.arenaY,color:0x66ccff,outline:0x003355});
  const e=makeFighter({name:'Bot', x:rightX,y:UI.arenaY,color:0xff8888,outline:0x4b1b1b});
  s.player=p; s.enemy=e;

  p.nameText=styleReadableText(s.add.text(p.x,p.y+UI.nameDy,`${p.name}`,{font:'12px Arial',color:'#d6e8ff'}).setOrigin(0.5));
  e.nameText=styleReadableText(s.add.text(e.x,e.y+UI.nameDy,`${e.name}`,{font:'12px Arial',color:'#ffd6d6'}).setOrigin(0.5));

  p.loadoutTxt=styleReadableText(s.add.text(p.x,p.y+UI.loadoutDy,'',{font:'10px Arial',color:'#bfe0ff'}).setOrigin(0.5));
  e.loadoutTxt=styleReadableText(s.add.text(e.x,e.y+UI.loadoutDy,'',{font:'10px Arial',color:'#ffd6d6'}).setOrigin(0.5));

  p.armourTxt=styleReadableText(s.add.text(p.x,p.y+UI.armourDy,'',{font:'10px Arial',color:'#bfe0ff'}).setOrigin(0.5));
  e.armourTxt=styleReadableText(s.add.text(e.x,e.y+UI.armourDy,'',{font:'10px Arial',color:'#ffd6d6'}).setOrigin(0.5));

  const HUD_Y = H - 190;
  ui.status=styleReadableText(s.add.text(W/2,HUD_Y,'Reroll loadouts, then Start Duel',{font:'14px Arial',color:'#9fdcff'}).setOrigin(0.5));
  ui.invTxt=styleReadableText(s.add.text(W/2,HUD_Y+18,invLabel(),{font:'11px Arial',color:'#a8c8ff'}).setOrigin(0.5));
  ui.invTxt.setInteractive({useHandCursor:true});
  ui.invTxt.on('pointerdown', ()=>{ if(!duelActive && !startupOpen) inv_show(); });

  ui.rerollBtn=button(W/2-120,HUD_Y+52,144,38,'Reroll Loadouts',()=>{
    if(duelActive || startupOpen) return;
    rollBothLoadouts(); refreshLoadoutTexts();
    ui.status.setText('Loadouts rolled. Ready!');
  });
  ui.specBtn   = smallButton(W/2+138,HUD_Y+52,116,38,'SPEC',togglePlayerSpec);
  ui.startBtn  = button(W/2,HUD_Y+94,190,46,'Start Duel',()=>startDuel());
  ui.rematchBtn= button(W/2,HUD_Y+94,190,46,'Rematch',()=>rematch());
  ui.rematchBtn.setVisible(false);

  buildLootPanel();
  buildInventoryPanel();
  buildStartupPanel(); // startup modal

  rollBothLoadouts(); refreshLoadoutTexts();
}

/* ================= Fighter & UI helpers ================= */

function styleReadableText(txt){ txt.setShadow(0,1,'#000',4,true,true); return txt; }

function makeFighter(o){
  const f={name:o.name,x:o.x,y:o.y,hp:99,maxHp:99,alive:true,
    food:FOOD_START,lastEatTick:-999,spec:SPEC_MAX,
    mainWeapon:null,specWeapon:null,nextAttack:0,
    wantSpec:false,armedSpecTick:-1,specCooldown:0,lastSpecTick:-999,
    armour:null
  };

  // stick-figure body (container)
  f.body = buildStickFigure(f.x, f.y, o.color, o.outline);

  const barW=110;
  // HP ABOVE head
  f.hpBg=s.add.rectangle(f.x,f.y+UI.hpDy,barW,10,0x2b2b2b).setStrokeStyle(2,0x161616).setOrigin(0.5);
  f.hpFill=s.add.rectangle(f.x-barW/2,f.y+UI.hpDy,barW,8,0x4dd06d).setOrigin(0,0.5);
  f.hpText=styleReadableText(s.add.text(f.x,f.y+UI.hpDy,'',{font:'11px Arial',color:'#fff'}).setOrigin(0.5));

  // Food/spec below body with extra space
  f.foodBg=s.add.rectangle(f.x,f.y+UI.foodDy,64,14,0x1f2a3a).setStrokeStyle(1,0x0e141c).setOrigin(0.5);
  f.foodTxt=styleReadableText(s.add.text(f.x,f.y+UI.foodDy,`Food: ${f.food}`,{font:'10px Arial',color:'#cfe8ff'}).setOrigin(0.5));

  f.specBg=s.add.rectangle(f.x,f.y+UI.specDy,110,6,0x101621).setStrokeStyle(1,0x0e141c).setOrigin(0.5);
  f.specFill=s.add.rectangle(f.x-55,f.y+UI.specDy,110,4,0x6fd1ff).setOrigin(0,0.5);
  f.specTxt=styleReadableText(s.add.text(f.x,f.y+UI.specDy+14,`Spec ${f.spec}%`,{font:'10px Arial',color:'#cfe8ff'}).setOrigin(0.5));

  updateHpUI(f); updateFoodUI(f); updateSpecUI(f);
  return f;
}

function button(x,y,w,h,label,onClick){
  const bg=s.add.rectangle(x,y,w,h,0x2a2f45).setStrokeStyle(2,0x151826).setOrigin(0.5).setInteractive({useHandCursor:true});
  const txt=styleReadableText(s.add.text(x,y,label,{font:'16px Arial',color:'#fff'}).setOrigin(0.5));
  bg.on('pointerdown',()=>{ bg.setScale(0.98); onClick&&onClick(); });
  bg.on('pointerup',()=>bg.setScale(1));
  bg.on('pointerout',()=>bg.setScale(1));
  bg.setLabel=t=>txt.setText(t); return bg;
}
function smallButton(x,y,w,h,label,onClick){
  const bg=s.add.rectangle(x,y,w,h,0x23324a).setStrokeStyle(2,0x152033).setOrigin(0.5).setInteractive({useHandCursor:true});
  const txt=styleReadableText(s.add.text(x,y,label,{font:'13px Arial',color:'#d6e8ff'}).setOrigin(0.5));
  bg.on('pointerdown',()=>{ bg.setScale(0.98); onClick&&onClick(); });
  bg.on('pointerup',()=>bg.setScale(1));
  bg.on('pointerout',()=>bg.setScale(1));
  bg.setActiveState=armed=>{ bg.setStrokeStyle(2,armed?0x6fd1ff:0x152033); txt.setColor(armed?'#fff':'#d6e8ff'); };
  bg._txt=txt; return bg;
}
function panelButton(parent, x, y, w, h, label, onClick){
  const bg = s.add.rectangle(x, y, w, h, 0x2a2f45).setStrokeStyle(2, 0x151826).setOrigin(0.5);
  const txt = styleReadableText(s.add.text(x, y, label, {font:'14px Arial', color:'#ffffff'}).setOrigin(0.5));
  bg.setInteractive({useHandCursor:true});
  bg.on('pointerdown', ()=>{ bg.setScale(0.98); onClick && onClick(); });
  bg.on('pointerup',   ()=>bg.setScale(1));
  bg.on('pointerout',  ()=>bg.setScale(1));
  parent.add(bg); parent.add(txt);
  return { bg, txt, setLabel:(t)=>txt.setText(t) };
}

/* ================= Loadouts (consuming one-time equips) ================= */

const pickRandom=a=>a[(Math.random()*a.length)|0];
const weaponStyle = w => w?.style || 'melee';

function rollArmourFor(f){
  const st = weaponStyle(f.mainWeapon);
  const poolMatch = ARMOUR_SETS.filter(a=>a.affinity===st);
  f.armour = (Math.random()<0.6 && poolMatch.length ? pickRandom(poolMatch) : pickRandom(ARMOUR_SETS));
}
function rollLoadout(f){
  if(f===s.player && nextEquipOverride.mainId && invHas('main', nextEquipOverride.mainId)){
    f.mainWeapon = MAIN_MAP[nextEquipOverride.mainId];
    invConsume('main', nextEquipOverride.mainId, 1);
  }else f.mainWeapon = pickRandom(MAIN_WEAPONS);

  if(f===s.player && nextEquipOverride.specId && invHas('spec', nextEquipOverride.specId)){
    f.specWeapon = SPEC_MAP[nextEquipOverride.specId];
    invConsume('spec', nextEquipOverride.specId, 1);
  }else f.specWeapon = pickRandom(SPEC_WEAPONS);

  if(f===s.player){ nextEquipOverride.mainId=null; nextEquipOverride.specId=null; }
  rollArmourFor(f);
}
function rollBothLoadouts(){ rollLoadout(s.player); rollLoadout(s.enemy); }
function refreshLoadoutTexts(){
  const p=s.player,e=s.enemy;
  p.loadoutTxt.setText(`Main: ${p.mainWeapon.name}  |  Spec: ${p.specWeapon.name}`);
  e.loadoutTxt.setText(`Main: ${e.mainWeapon.name}  |  Spec: ${e.specWeapon.name}`);
  p.armourTxt.setText(`Arm: ${p.armour?.name||'—'} (${p.armour?.affinity||'—'})`);
  e.armourTxt.setText(`Arm: ${e.armour?.name||'—'} (${e.armour?.affinity||'—'})`);
  ui.specBtn._txt.setText(`SPEC (${p.specWeapon.name})`);
  ui.invTxt.setText(invLabel());
}
function invLabel(){ const t=invTotals(); return `Loot: Mains ${t.mains} | Specs ${t.specs}`; }

/* ================= Combat control ================= */

function startDuel(){
  if(startupOpen) return;
  const hintEl=document.getElementById('hint'); if(hintEl) hintEl.style.display='none';
  if(duelActive) return;
  duelActive=true; duelEnded=false; pendingKO=null;
  ui.status.setText('Fight!'); ui.startBtn.setVisible(false); ui.rematchBtn.setVisible(false);

  s.player.nextAttack=s.player.mainWeapon.speedTicks;
  s.enemy.nextAttack =s.enemy.mainWeapon.speedTicks;

  s.player.wantSpec=false; s.player.armedSpecTick=-1;
  s.enemy.wantSpec =false; s.enemy.armedSpecTick =-1;

  if(tickEvent) tickEvent.remove(false);
  tickEvent=s.time.addEvent({delay:TICK_MS,loop:true,callback:onTick});
}
function onTick(){
  if(!duelActive || duelEnded) return; tickCount++;
  const p=s.player,e=s.enemy;
  if(!p.alive || !e.alive || pendingKO){ if(pendingKO) finalizeKO(); else safeEnd(p.alive?p:e, p.alive?e:p); return; }

  regenSpec(p); regenSpec(e);
  if(p.specCooldown>0) p.specCooldown--;
  if(e.specCooldown>0) e.specCooldown--;

  p.nextAttack--; e.nextAttack--;

  if(p.nextAttack<=0 && p.alive && !pendingKO){
    const fired=tryFireSpecialOnTick(p,e);
    if(!fired && !pendingKO){ doSwing(p,e); if(!pendingKO) p.nextAttack=p.mainWeapon.speedTicks; }
  }
  if(e.nextAttack<=0 && e.alive && !pendingKO){
    if(!e.wantSpec && canSpec(e)){ const want=(p.hp<=45)?0.7:0.25; if(Math.random()<want){ e.wantSpec=true; e.armedSpecTick=tickCount; } }
    const fired=tryFireSpecialOnTick(e,p);
    if(!fired && !pendingKO){ doSwing(e,p); if(!pendingKO) e.nextAttack=e.mainWeapon.speedTicks; }
  }
  if(pendingKO) finalizeKO();
}
function finalizeKO(){ if(!pendingKO) return; const {winner,loser}=pendingKO; pendingKO=null; safeEnd(winner,loser); }
function stopDuel(){ if(!duelActive) return; duelActive=false; if(tickEvent){try{tickEvent.remove(false);}catch{} tickEvent=null;} ui.rematchBtn.setVisible(true); }
function safeEnd(winner, loser){
  if(duelEnded) return; duelEnded=true; duelActive=false;
  if(tickEvent){ try{tickEvent.remove(false);}catch{} tickEvent=null; }
  sf_poseDead(loser);
  ui.status.setText(`${(winner?.name)||'Winner'} wins!`);
  ui.rematchBtn.setVisible(true);
  if(SHOW_LOOT && winner===s.player){
    const mainId=s.enemy.mainWeapon?.id, specId=s.enemy.specWeapon?.id;
    s.time.delayedCall(40, ()=>loot_show(mainId, specId));
  }
}

/* ================= Rematch ================= */

function rematch(){
  resetFighter(s.player); resetFighter(s.enemy);
  rollBothLoadouts(); refreshLoadoutTexts();
  duelEnded=false; pendingKO=null;
  ui.status.setText('Reroll loadouts, then Start Duel');
  ui.startBtn.setVisible(true); ui.rematchBtn.setVisible(false);
  ui.specBtn.setActiveState(false);
}
function resetFighter(f){
  f.hp=f.maxHp; f.alive=true;
  f.food=FOOD_START; f.lastEatTick=-999;
  f.spec=SPEC_MAX; f.wantSpec=false; f.armedSpecTick=-1; f.specCooldown=0; f.lastSpecTick=-999;
  f.nextAttack=0; f.body.setAlpha(1).setScale(1).setAngle(0);
  updateHpUI(f); updateFoodUI(f); updateSpecUI(f);
}

/* ================= Specials (arm → next tick) ================= */

function togglePlayerSpec(){
  const p=s.player;
  if(startupOpen || !duelActive || !p.alive || duelEnded || pendingKO) return;
  if(p.wantSpec){ p.wantSpec=false; p.armedSpecTick=-1; ui.specBtn.setActiveState(false); ui.status.setText('Special disarmed'); return; }
  if(!canSpec(p)){ ui.status.setText('Not ready (energy/cooldown)'); return; }
  p.wantSpec=true; p.armedSpecTick=tickCount; ui.specBtn.setActiveState(true);
  ui.status.setText('Special armed — will fire on your next tick');
}
function canSpec(f){ return f.spec>=f.specWeapon.cost && f.specCooldown<=0; }
function tryFireSpecialOnTick(a,d){
  if(duelEnded||pendingKO) return false;
  if(!a.wantSpec) return false;
  if(a.armedSpecTick===-1 || tickCount<=a.armedSpecTick) return false;
  if(!canSpec(a)) return false;

  performSpecial(a,d);
  a.wantSpec=false; a.armedSpecTick=-1;
  if(a===s.player) ui.specBtn.setActiveState(false);
  return true;
}

/* ================= Attack math (armour-aware) ================= */

function offensiveBonus(attacker){
  const a = attacker.armour, st = weaponStyle(attacker.mainWeapon);
  if(!a) return {acc:+0, dmg:1};
  if(a.affinity === st) return {acc:a.off.acc, dmg:1+a.off.dmg};
  return {acc:+0, dmg:1};
}
function defensiveDebuff(defender, incomingStyle){
  const a = defender.armour;
  if(!a) return {acc:0, dmg:1};
  const vs = (a.def && a.def[incomingStyle]) || null;
  if(!vs) return {acc:0, dmg:1};
  return {acc:vs.acc, dmg:1+vs.dmg};
}
function computeAttack(attacker, defender, accBonus=0, dmgMult=1){
  const style = weaponStyle(attacker.mainWeapon);
  const off = offensiveBonus(attacker);
  const def = defensiveDebuff(defender, style);
  const baseHit = BASE_ACCURACY + accBonus + off.acc + def.acc;
  const hitChance = Math.min(0.98, Math.max(0.02, baseHit));
  const effDmgMult = Math.max(0, dmgMult * off.dmg * def.dmg);
  const max = Math.round(attacker.mainWeapon.maxHit * effDmgMult);
  return {style, hitChance, max};
}

/* ================= Single + Multi swings (OSRS hitsplats) ================= */

function doSwing(attacker,defender,accBonus=0,dmgMult=1){
  if(duelEnded||pendingKO||!attacker.alive||!defender.alive) return;
  const {style, hitChance, max} = computeAttack(attacker,defender,accBonus,dmgMult);
  const hit = Math.random()<hitChance;
  const dmg = hit ? Phaser.Math.Between(0, Math.max(0,max)) : 0;

  swipeFx(attacker,defender);
  hitsplatFx(defender, [dmg], style);
  applyDamage(defender, dmg);
}
function doMultiSwing(attacker,defender,parts){
  if(duelEnded||pendingKO||!attacker.alive||!defender.alive) return;
  const damages=[]; let style = weaponStyle(attacker.mainWeapon);
  for(const p of parts){
    const calc = computeAttack(attacker,defender,p.accBonus||0,p.dmgMult||1);
    const hit = Math.random()<calc.hitChance;
    damages.push(hit ? Phaser.Math.Between(0, Math.max(0,calc.max)) : 0);
    style = calc.style;
  }
  swipeFx(attacker,defender);
  hitsplatFx(defender, damages, style);
  const total = damages.reduce((a,b)=>a+b,0);
  applyDamage(defender, total);
}
function applyDamage(defender, total){
  const lethal = (total>=defender.hp);
  if(total>0){
    defender.hp = Math.max(0, defender.hp - total);
    updateHpUI(defender);
    sf_poseHit(defender);
    if(lethal){
      defender.alive=false;
      if(KO_ANIM) deathFx(defender);
      pendingKO={winner:(defender===s.player? s.enemy:s.player), loser:defender};
      return;
    }
    if(defender.hp<=EAT_AT_HP) tryAutoEat(defender);
  }else{
    if(defender.hp>0 && defender.hp<=EAT_AT_HP) tryAutoEat(defender);
  }
}

/* ================= Specials (multi-hit helpers) ================= */

function performSpecial(a,d){
  if(duelEnded||pendingKO||!a.alive||!d.alive) return;
  const spec=a.specWeapon.type, cost=a.specWeapon.cost;
  if(a.spec<cost) return;
  a.spec -= cost; updateSpecUI(a);

  if(spec==='dds'){
    doMultiSwing(a,d,[{accBonus:0.15,dmgMult:1.15},{accBonus:0.15,dmgMult:1.15}]);
    sf_specFx('dds',a,d);
    a.nextAttack = a.mainWeapon.speedTicks + 1; a.specCooldown=3; ui.status.setText(`${a.name} uses Double Stab!`);
  }else if(spec==='claws'){
    const parts=[0.4,0.3,0.2,0.1].map(p=>({accBonus:0.10,dmgMult:p*1.8}));
    doMultiSwing(a,d,parts);
    sf_specFx('claws',a,d);
    a.nextAttack = a.mainWeapon.speedTicks + 2; a.specCooldown=4; ui.status.setText(`${a.name} unleashes Claw Flurry!`);
  }else if(spec==='ags'){
    doSwing(a,d,0.15,1.5);
    sf_specFx('ags',a,d);
    a.nextAttack = a.mainWeapon.speedTicks + 2; a.specCooldown=4; ui.status.setText(`${a.name} smashes with AGS!`);
  }else if(spec==='dbow'){
    doMultiSwing(a,d,[{accBonus:0.10,dmgMult:1.25},{accBonus:0.10,dmgMult:1.25}]);
    sf_specFx('dbow',a,d);
    a.nextAttack = a.mainWeapon.speedTicks + 2; a.specCooldown=4; ui.status.setText(`${a.name} fires Dark Bow!`);
  }else if(spec==='vstaff'){
    doSwing(a,d,0.2,1.8);
    sf_specFx('vstaff',a,d);
    a.nextAttack = a.mainWeapon.speedTicks + 3; a.specCooldown=5; ui.status.setText(`${a.name} channels Volatile Blast!`);
  }
  a.lastSpecTick=tickCount;
}

/* ================= Eating / Regen ================= */

function tryAutoEat(f){
  if(duelEnded||pendingKO) return; if(f.food<=0) return; if(f.lastEatTick===tickCount) return;
  f.food--; f.lastEatTick=tickCount;
  const before=f.hp; f.hp=Math.min(f.maxHp,f.hp+FOOD_HEAL); const healed=f.hp-before;
  f.nextAttack = f.nextAttack + EAT_COST_TK;
  updateHpUI(f); updateFoodUI(f); eatFx(f,healed);
  if(!duelEnded) ui.status.setText((f===s.player)?`You eat (+${healed}) — Food left: ${f.food}`:`Bot eats (+${healed}) — Food left: ${f.food}`);
}
function regenSpec(f){ if(!f.alive||duelEnded||pendingKO) return; f.spec=Math.min(SPEC_MAX,f.spec+SPEC_REGEN_PER_TICK); updateSpecUI(f); }

/* ================= Loot modal ================= */

let lootUI=null;
function buildLootPanel(){
  if(!SHOW_LOOT){ lootUI=null; return; }

  const cx=W/2, cy=H*0.34;
  const cont = s.add.container(cx, cy).setDepth(10);
  const bg   = s.add.rectangle(0,0, W*0.86, 210, 0x202a3a).setStrokeStyle(2,0x0f141d).setOrigin(0.5);
  const title= styleReadableText(s.add.text(0,-82,'Loot Found',{font:'18px Arial',color:'#ffffff'}).setOrigin(0.5));

  const mainTxt = styleReadableText(s.add.text(-160, -48, 'Main: —', {font:'14px Arial', color:'#cfe8ff'}).setOrigin(0,0.5));
  const specTxt = styleReadableText(s.add.text(-160, -22, 'Spec: —', {font:'14px Arial', color:'#cfe8ff'}).setOrigin(0,0.5));

  cont.add([bg,title,mainTxt,specTxt]);

  panelButton(cont, -50, 24, 120, 30, 'Take Main (+1)', ()=>{ if(lootUI.currentMainId){ invAdd('main', lootUI.currentMainId, 1); ui.invTxt.setText(invLabel()); }});
  panelButton(cont,  70, 24, 120, 30, 'Take Spec (+1)', ()=>{ if(lootUI.currentSpecId){ invAdd('spec', lootUI.currentSpecId, 1); ui.invTxt.setText(invLabel()); }});
  panelButton(cont, 160, 86,  86, 28, 'Close', ()=>loot_hide());

  const equipNextMain = styleReadableText(s.add.text(-160, 60, '☐ Equip main next round (consumes 1)', {font:'12px Arial', color:'#9fdcff'}).setOrigin(0,0.5)).setInteractive({useHandCursor:true});
  const equipNextSpec = styleReadableText(s.add.text(-160, 80, '☐ Equip spec next round (consumes 1)', {font:'12px Arial', color:'#9fdcff'}).setOrigin(0,0.5)).setInteractive({useHandCursor:true});
  cont.add([equipNextMain, equipNextSpec]);

  cont.setVisible(false);

  lootUI = { cont, mainTxt, specTxt, equipNextMain, equipNextSpec, currentMainId:null, currentSpecId:null, equipMain:false, equipSpec:false };

  equipNextMain.on('pointerdown', ()=>{ lootUI.equipMain=!lootUI.equipMain; equipNextMain.setText((lootUI.equipMain?'☑':'☐')+' Equip main next round (consumes 1)'); });
  equipNextSpec.on('pointerdown', ()=>{ lootUI.equipSpec=!lootUI.equipSpec; equipNextSpec.setText((lootUI.equipSpec?'☑':'☐')+' Equip spec next round (consumes 1)'); });
}
function loot_show(mainId, specId){
  if(!SHOW_LOOT || !lootUI) return;
  lootUI.currentMainId = mainId || null;
  lootUI.currentSpecId = specId || null;
  lootUI.equipMain=false; lootUI.equipSpec=false;
  lootUI.equipNextMain.setText('☐ Equip main next round (consumes 1)');
  lootUI.equipNextSpec.setText('☐ Equip spec next round (consumes 1)');
  lootUI.mainTxt.setText(`Main: ${MAIN_MAP[mainId]?.name || '—'}`);
  lootUI.specTxt.setText(`Spec: ${SPEC_MAP[specId]?.name || '—'}`);
  lootUI.cont.setVisible(true);
}
function loot_hide(){
  if(!SHOW_LOOT || !lootUI) return;
  lootUI.cont.setVisible(false);
  if(lootUI.equipMain) nextEquipOverride.mainId = lootUI.currentMainId;
  if(lootUI.equipSpec) nextEquipOverride.specId = lootUI.currentSpecId;
}

/* ================= Inventory modal ================= */

let invUI=null, invCur={mainIdx:0, specIdx:0}, invKeys={mains:[], specs:[]};
function buildInventoryPanel(){
  const cx=W/2, cy=H*0.36;
  const cont = s.add.container(cx, cy).setDepth(10);
  const bg   = s.add.rectangle(0,0, W*0.86, 230, 0x202a3a).setStrokeStyle(2,0x0f141d).setOrigin(0.5);
  const title= styleReadableText(s.add.text(0,-92,'Inventory',{font:'18px Arial',color:'#ffffff'}).setOrigin(0.5));

  const mainLbl = styleReadableText(s.add.text(-160,-56,'Mains:',{font:'13px Arial',color:'#cfe8ff'}).setOrigin(0,0.5));
  const specLbl = styleReadableText(s.add.text(-160, -16,'Specs:',{font:'13px Arial',color:'#cfe8ff'}).setOrigin(0,0.5));

  const mainVal = styleReadableText(s.add.text(-26,-56,'—',{font:'14px Arial',color:'#ffffff'}).setOrigin(0,0.5));
  const specVal = styleReadableText(s.add.text(-26, -16,'—',{font:'14px Arial',color:'#ffffff'}).setOrigin(0,0.5));

  cont.add([bg,title,mainLbl,specLbl,mainVal,specVal]);

  panelButton(cont, -90, -56, 44, 26, '◀', ()=>{ browse('main', -1); });
  panelButton(cont,  90, -56, 44, 26, '▶', ()=>{ browse('main', +1); });
  panelButton(cont, -90, -16, 44, 26, '◀', ()=>{ browse('spec', -1); });
  panelButton(cont,  90,  -16, 44, 26, '▶', ()=>{ browse('spec', +1); });

  const lockMain = styleReadableText(s.add.text(-160, 28, '☐ Equip selected main next round (consumes 1)', {font:'12px Arial', color:'#9fdcff'}).setOrigin(0,0.5)).setInteractive({useHandCursor:true});
  const lockSpec = styleReadableText(s.add.text(-160, 48, '☐ Equip selected spec next round (consumes 1)', {font:'12px Arial', color:'#9fdcff'}).setOrigin(0,0.5)).setInteractive({useHandCursor:true});
  cont.add([lockMain, lockSpec]);

  let lockM=false, lockS=false;
  lockMain.on('pointerdown', ()=>{ lockM=!lockM; lockMain.setText((lockM?'☑':'☐')+' Equip selected main next round (consumes 1)'); });
  lockSpec.on('pointerdown', ()=>{ lockS=!lockS; lockSpec.setText((lockS?'☑':'☐')+' Equip selected spec next round (consumes 1)'); });

  panelButton(cont, 150, 92, 86, 28, 'Close', ()=>{
    const mainId = invKeys.mains[invCur.mainIdx];
    const specId = invKeys.specs[invCur.specIdx];
    if(lockM && mainId && invHas('main',mainId)) nextEquipOverride.mainId = mainId;
    if(lockS && specId && invHas('spec',specId)) nextEquipOverride.specId = specId;
    cont.setVisible(false);
  });

  cont.setVisible(false);

  invUI = { cont, mainVal, specVal, lockMain, lockSpec };

  function browse(kind, delta){
    refreshKeys();
    if(kind==='main'){
      const L=invKeys.mains.length||1; invCur.mainIdx=( (invCur.mainIdx+delta)%L + L )%L;
    }else{
      const L=invKeys.specs.length||1; invCur.specIdx=( (invCur.specIdx+delta)%L + L )%L;
    }
    inv_refreshVals();
  }
  function refreshKeys(){
    invKeys.mains = Object.keys(inventory.mains);
    invKeys.specs = Object.keys(inventory.specs);
    invCur.mainIdx = Math.min(invCur.mainIdx, Math.max(0, invKeys.mains.length-1));
    invCur.specIdx = Math.min(invCur.specIdx, Math.max(0, invKeys.specs.length-1));
  }
  function inv_refreshVals(){
    const mid = invKeys.mains[invCur.mainIdx];
    const sid = invKeys.specs[invCur.specIdx];
    invUI.mainVal.setText(mid ? `${MAIN_MAP[mid]?.name||mid}  x${inventory.mains[mid]}` : '—');
    invUI.specVal.setText(sid ? `${SPEC_MAP[sid]?.name||sid}  x${inventory.specs[sid]}` : '—');
  }
  invUI.refreshKeys = refreshKeys;
  invUI.refreshVals = inv_refreshVals;
  refreshKeys(); inv_refreshVals();
}
function inv_show(){ if(!invUI) return; invUI.refreshKeys(); invUI.refreshVals(); invUI.cont.setVisible(true); }

/* ================= Startup modal ================= */

function buildStartupPanel(){
  const cx=W/2, cy=H*0.34;
  const cont = s.add.container(cx, cy).setDepth(20);
  const bg   = s.add.rectangle(0,0, W*0.86, 230, 0x202a3a).setStrokeStyle(2,0x0f141d).setOrigin(0.5);
  const title= styleReadableText(s.add.text(0,-86,'Welcome',{font:'18px Arial',color:'#ffffff'}).setOrigin(0.5));
  const desc1= styleReadableText(s.add.text(0,-56,'Choose how to start this session:',{font:'13px Arial',color:'#cfe8ff'}).setOrigin(0.5));

  const toggleTxt= styleReadableText(s.add.text(-160,10,'☑ Save new loot to this device',{font:'12px Arial',color:'#9fdcff'}).setOrigin(0,0.5)).setInteractive({useHandCursor:true});
  let saveOn=true;
  toggleTxt.on('pointerdown', ()=>{ saveOn=!saveOn; toggleTxt.setText((saveOn?'☑':'☐')+' Save new loot to this device'); });

  const btnCont = s.add.container(0,60);
  panelButton(btnCont,-70,0,120,34,'Continue', ()=>{
    PERSIST_LOOT = saveOn; saveInventory();
    cont.setVisible(false); startupOpen=false;
    ui.status.setText('Continue selected — good luck!'); ui.invTxt.setText(invLabel());
  });
  panelButton(btnCont, 70,0,120,34,'Restart', ()=>{
    PERSIST_LOOT = saveOn; clearSavedInventory(); inventory = emptyInv(); saveInventory();
    cont.setVisible(false); startupOpen=false;
    ui.status.setText('Restarted with empty loot.'); ui.invTxt.setText(invLabel());
  });

  cont.add([bg,title,desc1,toggleTxt,btnCont]);
  cont.setVisible(true);
}

/* ================= FX & UI updates ================= */

// ----- Stick figure builder & anims -----
function buildStickFigure(x,y,fill=0x66ccff, outline=0x003355){
  const c = s.add.container(x,y);
  const headR=10, torsoH=20, legH=18, armL=16;

  const head = s.add.circle(0,-(torsoH+headR), headR, fill).setStrokeStyle(2, outline);
  const torso= s.add.rectangle(0,-torsoH/2, 6, torsoH, fill).setStrokeStyle(2, outline);
  const armLft = s.add.rectangle(-6,-torsoH+4, armL, 4, fill).setOrigin(1,0.5).setStrokeStyle(2, outline);
  const armRgt = s.add.rectangle( 6,-torsoH+4, armL, 4, fill).setOrigin(0,0.5).setStrokeStyle(2, outline);
  const legLft = s.add.rectangle(-3,  2, 4, legH, fill).setOrigin(0.5,0).setStrokeStyle(2, outline);
  const legRgt = s.add.rectangle( 3,  2, 4, legH, fill).setOrigin(0.5,0).setStrokeStyle(2, outline);
  const weapon = s.add.rectangle(armRgt.x+armL, armRgt.y, 12, 4, 0xcccccc).setOrigin(0,0.5).setStrokeStyle(2, 0x555555);

  c.add([legLft, legRgt, torso, armLft, armRgt, weapon, head]);
  c.sf = { head, torso, armLft, armRgt, legLft, legRgt, weapon, baseFill:fill, outline };

  sf_poseIdle({body:c});
  return c;
}
function sf_poseIdle(f){
  const c=f.body, p=c.sf;
  s.tweens.add({targets:c, y:c.y, duration:900, yoyo:true, repeat:-1, ease:'sine.inOut'});
  [p.armLft, p.armRgt].forEach(a=>a.setAngle(0));
  p.weapon.fillColor = 0xcccccc;
}
function sf_poseHit(f){ const c=f.body; s.tweens.add({targets:c, x:c.x+2, yoyo:true, repeat:2, duration:40}); }
function sf_poseDead(f){ const c=f.body; s.tweens.add({targets:c, angle:90, duration:300, ease:'quad.in'}); }
function sf_setStyle(f, style){ const p=f.body.sf; const tint = style==='melee'?SPLAT_COLOR.melee : style==='ranged'?SPLAT_COLOR.ranged : SPLAT_COLOR.mage; p.weapon.fillColor = tint; }
function sf_meleeSwing(a,d){
  sf_setStyle(a, 'melee');
  const p=a.body.sf; p.armRgt.setAngle(-60);
  s.tweens.add({targets:p.armRgt, angle:50, duration:160, ease:'quad.out', yoyo:true, onComplete:()=>p.armRgt.setAngle(0)});
  s.tweens.add({targets:a.body, x:a.body.x+(a.x<d.x?6:-6), duration:120, yoyo:true, ease:'quad.out'});
}
function sf_rangedShot(a,d){
  sf_setStyle(a, 'ranged');
  const p=a.body.sf; s.tweens.add({targets:p.armRgt, angle:-30, duration:120, yoyo:true});
  const ang=Phaser.Math.Angle.Between(a.x,a.y,d.x,d.y);
  const proj = s.add.rectangle(a.x, a.y-20, 10, 3, SPLAT_COLOR.ranged).setRotation(ang);
  s.tweens.add({targets:proj, x:d.x, y:d.y-20, duration:180, ease:'quad.in', onComplete:()=>proj.destroy()});
}
function sf_mageCast(a,d){
  sf_setStyle(a,'mage');
  const p=a.body.sf; s.tweens.add({targets:[p.armLft,p.armRgt], angle:20, duration:120, yoyo:true});
  const orb = s.add.circle(a.x, a.y-30, 6, SPLAT_COLOR.mage).setAlpha(0.9);
  s.tweens.add({targets:orb, radius:18, alpha:0, duration:240, onComplete:()=>orb.destroy()});
  const ang=Phaser.Math.Angle.Between(a.x,a.y,d.x,d.y);
  const spark = s.add.triangle(a.x, a.y-24, 0,0, 10,4, 10,-4, SPLAT_COLOR.mage).setRotation(ang);
  s.tweens.add({targets:spark, x:d.x, y:d.y-24, duration:200, onComplete:()=>spark.destroy()});
}
function sf_specFx(type, a, d){
  if(type==='dds'){
    for(let i=0;i<2;i++){
      const ang=Phaser.Math.Angle.Between(a.x,a.y,d.x,d.y)+(i?0.08:-0.08);
      const slash=s.add.rectangle(a.x,a.y, 44,4, SPLAT_COLOR.melee).setOrigin(0,0.5).setRotation(ang).setAlpha(0.9);
      s.tweens.add({targets:slash, x:d.x, y:d.y, alpha:0, duration:180, onComplete:()=>slash.destroy()});
    }
  }else if(type==='claws'){
    for(let i=0;i<4;i++){
      const arc=s.add.arc(d.x, d.y+UI.hitsplatDy+26, 14+i*2, 220, 320, false, SPLAT_COLOR.melee).setStrokeStyle(3, SPLAT_COLOR.melee);
      s.tweens.add({targets:arc, alpha:0, scale:1.2, duration:260, onComplete:()=>arc.destroy()});
    }
  }else if(type==='ags'){
    const boom = s.add.circle(d.x, d.y+UI.hitsplatDy+40, 10, SPLAT_COLOR.melee).setAlpha(0.9);
    s.tweens.add({targets:boom, radius:34, alpha:0, duration:260, ease:'quad.out', onComplete:()=>boom.destroy()});
  }else if(type==='dbow'){
    for(let i=0;i<2;i++){
      const ang=Phaser.Math.Angle.Between(a.x,a.y,d.x,d.y)+(i?0.03:-0.03);
      const proj = s.add.rectangle(a.x, a.y-20, 14,4, SPLAT_COLOR.ranged).setRotation(ang);
      s.tweens.add({targets:proj, x:d.x, y:d.y-20, duration:220, onComplete:()=>proj.destroy()});
    }
  }else if(type==='vstaff'){
    const ring=s.add.circle(d.x,d.y+UI.hitsplatDy+34,12,SPLAT_COLOR.mage).setAlpha(0.9);
    s.tweens.add({targets:ring, radius:40, alpha:0, duration:340, onComplete:()=>ring.destroy()});
  }
}
// style-aware attack animation bridge
function swipeFx(a,d){
  const st = (a.mainWeapon && a.mainWeapon.style) || 'melee';
  if(st==='melee')      sf_meleeSwing(a,d);
  else if(st==='ranged')sf_rangedShot(a,d);
  else                  sf_mageCast(a,d);
}

// ----- Hitsplats / misc FX -----
function hitsplatFx(defender, values, style='melee'){
  if(duelEnded||pendingKO) return;
  const baseX=defender.x, baseY=defender.y+UI.hitsplatDy; // ABOVE head
  const spread = 18;
  const startX = baseX - ((values.length-1)*spread)/2;
  const fill = SPLAT_COLOR[style] || SPLAT_COLOR.melee;
  values.forEach((v,i)=>{
    const isZero=(v<=0), color=isZero?SPLAT_COLOR.zero:fill, size=16, x=startX+i*spread, y=baseY;
    const diamond = s.add.rectangle(x, y, size, size, color).setAngle(45).setAlpha(0.92);
    const tail = s.add.triangle(x, y+size*0.55, x-4, y+7, x+4, y+7, x, y+13, color).setAlpha(0.92);
    const t=s.add.text(x, y, isZero?'0':`${v}`, {font:'14px Arial', color:'#ffffff'}).setOrigin(0.5).setShadow(0,1,'#000',4,true,true);
    s.tweens.add({targets:[diamond,tail,t], y:'-=16', alpha:0, duration:760, onComplete:()=>{ diamond.destroy(); tail.destroy(); t.destroy(); }});
    if(isZero){ s.tweens.add({targets:[diamond,tail,t], x:`+=3`, yoyo:true, repeat:3, duration:60}); }
  });
}
function eatFx(f,healed){
  if(duelEnded||pendingKO) return;
  const ring=s.add.circle(f.x,f.y,12,0x4dd06d).setAlpha(0.9);
  s.tweens.add({targets:ring,radius:24,alpha:0,duration:260,onComplete:()=>ring.destroy()});
  const t=s.add.text(f.x,f.y-64,`+${healed}`,{font:'13px Arial',color:'#a9ffb6'}).setOrigin(0.5).setShadow(0,1,'#000',4,true,true);
  s.tweens.add({targets:t,y:f.y-80,alpha:0,duration:700,onComplete:()=>t.destroy()});
}
function deathFx(f){ s.tweens.add({targets:f.body,scale:1.35,alpha:0,duration:320}); }

function updateHpUI(f){
  const barW=110,r=Math.max(0,f.hp/f.maxHp);
  f.hpFill.width=barW*r;
  f.hpFill.fillColor=r>0.5?0x4dd06d:(r>0.2?0xf1c14e:0xe86a6a);
  f.hpText.setText(`${f.hp}/${f.maxHp}`);
}
function updateFoodUI(f){
  f.foodTxt.setText(`Food: ${f.food}`);
  f.foodTxt.setColor(f.food>0?'#cfe8ff':'#ffaaaa');
  f.foodBg.fillColor=f.food>0?0x1f2a3a:0x3a2222;
}
function updateSpecUI(f){
  const w=110,r=Math.max(0,Math.min(1,f.spec/SPEC_MAX));
  f.specFill.width=w*r;
  f.specFill.fillColor=r>0.5?0x6fd1ff:(r>0.25?0xf1c14e:0xe86a6a);
  f.specTxt.setText(`Spec ${Math.round(f.spec)}%`);
}
