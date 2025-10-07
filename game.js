/* PvP (offline) — iPhone + Food + Tick Specials + Random Loadouts + Loot (Safe + Stable)
   - Specials: arm → fire on NEXT tick (never same-tick)
   - Explicit post-spec recovery (nextAttack set, not +=)
   - Idempotent KO + deferred loot (mobile Safari friendly)
*/

const W=420, H=640;
const config={
  type:Phaser.CANVAS,
  width:W, height:H,
  backgroundColor:'#1b2333',
  parent:'game',
  scale:{mode:Phaser.Scale.FIT, autoCenter:Phaser.Scale.CENTER_BOTH},
  scene:{ preload, create }
};
new Phaser.Game(config);

// ---- toggles ----
const SHOW_LOOT = true;

// ---- Core timing ----
const TICK_MS = 600;
const BASE_ACCURACY = 0.80;

// ---- Main weapons ----
const MAIN_WEAPONS = [
  // Melee
  {id:'dscim', name:'Dragon Scimitar', speedTicks:5, maxHit:48},
  {id:'whip',  name:'Abyssal Whip',    speedTicks:4, maxHit:42},
  // Ranged
  {id:'msb',   name:'Magic Shortbow',  speedTicks:5, maxHit:40},
  {id:'dkn',   name:'Dragon Knives',   speedTicks:3, maxHit:25},
  // Magic
  {id:'fsurge',name:'Fire Surge',      speedTicks:5, maxHit:48},
  {id:'iblitz',name:'Ice Blitz',       speedTicks:5, maxHit:44},
];
const MAIN_MAP = Object.fromEntries(MAIN_WEAPONS.map(w=>[w.id,w]));

// ---- Spec weapons ----
const SPEC_WEAPONS = [
  // Melee
  {id:'dds',    name:'Dragon Dagger',  cost:25, type:'dds'},
  {id:'dclaws', name:'Dragon Claws',   cost:50, type:'claws'},
  {id:'ags',    name:'Armadyl GS',     cost:50, type:'ags'},
  // Ranged
  {id:'dbow',   name:'Dark Bow',       cost:50, type:'dbow'},
  // Magic
  {id:'vstaff', name:'Volatile Staff', cost:55, type:'vstaff'},
];
const SPEC_MAP = Object.fromEntries(SPEC_WEAPONS.map(w=>[w.id,w]));

// ---- Food / spec energy ----
const EAT_AT_HP=50, FOOD_HEAL=20, FOOD_START=10, EAT_COST_TK=1;
const SPEC_MAX=100, SPEC_REGEN_PER_TICK=2;

// ---- Runtime ----
let s, ui={}, tickEvent=null, tickCount=0, duelActive=false, duelEnded=false;

// ---- Loot/inventory (local save) ----
let inventory = loadInventory();  // { mains: string[], specs: string[] }
let nextEquipOverride = { mainId:null, specId:null };

function loadInventory(){
  try{
    const raw = localStorage.getItem('pvp_inventory');
    if(raw){ const obj=JSON.parse(raw); return {mains:obj.mains||[], specs:obj.specs||[]}; }
  }catch(e){}
  return { mains:[], specs:[] };
}
function saveInventory(){
  try{ localStorage.setItem('pvp_inventory', JSON.stringify(inventory)); }catch(e){}
}

function preload(){}

function create(){
  s=this;

  s.add.text(W/2,22,'RuneScape-Style PvP (Offline)',{font:'18px Arial',color:'#ffffff'}).setOrigin(0.5);
  s.add.rectangle(W/2,H*0.52, W*0.72, 2, 0x2a3a55);

  const leftX=W*0.28, rightX=W*0.72, y=H*0.45;
  const p = makeFighter({ name:'You', x:leftX,  y, color:0x66ccff, outline:0x003355 });
  const e = makeFighter({ name:'Bot', x:rightX, y, color:0xff8888, outline:0x4b1b1b });

  s.player=p; s.enemy=e;

  p.nameText = s.add.text(p.x, p.y-72, `${p.name}`, {font:'12px Arial', color:'#d6e8ff'}).setOrigin(0.5);
  e.nameText = s.add.text(e.x, e.y-72, `${e.name}`, {font:'12px Arial', color:'#ffd6d6'}).setOrigin(0.5);

  p.loadoutTxt = s.add.text(p.x, p.y-60, '', {font:'10px Arial', color:'#bfe0ff'}).setOrigin(0.5);
  e.loadoutTxt = s.add.text(e.x, e.y-60, '', {font:'10px Arial', color:'#ffd6d6'}).setOrigin(0.5);

  ui.status = s.add.text(W/2, H-162, 'Reroll loadouts, then Start Duel', {font:'14px Arial', color:'#9fdcff'}).setOrigin(0.5);
  ui.invTxt = s.add.text(W/2, H-144, invLabel(), {font:'11px Arial', color:'#a8c8ff'}).setOrigin(0.5);

  ui.rerollBtn = button(W/2-100, H-110, 132, 36, 'Reroll Loadouts', ()=>{
    if(duelActive) return; // 🔒
    rollBothLoadouts();
    refreshLoadoutTexts();
    ui.status.setText('Loadouts rolled. Ready!');
  });

  ui.specBtn   = smallButton(W/2+110, H-110, 108, 36, 'SPEC', togglePlayerSpec);
  ui.startBtn  = button(W/2+60, H-74, 170, 44, 'Start Duel', ()=>startDuel());
  ui.rematchBtn= button(W/2+60, H-74, 170, 44, 'Rematch', ()=>rematch());
  ui.rematchBtn.setVisible(false);

  buildLootPanel();

  rollBothLoadouts(); refreshLoadoutTexts();
}

/* ---------------- Fighter ---------------- */
function makeFighter(opts){
  const f={
    name: opts.name,
    x: opts.x, y:opts.y,
    hp: 99, maxHp:99, alive:true,
    food: FOOD_START, lastEatTick:-999,
    spec: SPEC_MAX,
    mainWeapon: null,
    specWeapon: null,
    nextAttack: 0,
    wantSpec:false,
    armedSpecTick:-1,          // <— new: tick when player armed the spec
    specCooldown:0,
    lastSpecTick:-999
  };
  const r=18;
  f.body = s.add.circle(f.x, f.y, r, opts.color).setStrokeStyle(3, opts.outline);

  const barW=110, barH=10;
  f.hpBg   = s.add.rectangle(f.x, f.y-44, barW, barH, 0x2b2b2b).setStrokeStyle(2,0x161616).setOrigin(0.5);
  f.hpFill = s.add.rectangle(f.x-barW/2, f.y-44, barW, barH-2, 0x4dd06d).setOrigin(0,0.5);
  f.hpText = s.add.text(f.x, f.y-44, '', {font:'11px Arial', color:'#ffffff'}).setOrigin(0.5);

  f.foodBg  = s.add.rectangle(f.x, f.y-26, 56, 14, 0x1f2a3a).setStrokeStyle(1,0x0e141c).setOrigin(0.5);
  f.foodTxt = s.add.text(f.x, f.y-26, `Food: ${f.food}`, {font:'10px Arial', color:'#cfe8ff'}).setOrigin(0.5);

  f.specBg  = s.add.rectangle(f.x, f.y-14, 110, 6, 0x101621).setStrokeStyle(1,0x0e141c).setOrigin(0.5);
  f.specFill= s.add.rectangle(f.x-55, f.y-14, 110, 4, 0x6fd1ff).setOrigin(0,0.5);
  f.specTxt = s.add.text(f.x, f.y+2, `Spec ${f.spec}%`, {font:'10px Arial', color:'#cfe8ff'}).setOrigin(0.5);

  updateHpUI(f); updateFoodUI(f); updateSpecUI(f);
  return f;
}

/* ---------------- UI helpers ---------------- */
function button(x,y,w,h,label,onClick){
  const bg=s.add.rectangle(x,y,w,h,0x2a2f45).setStrokeStyle(2,0x151826).setOrigin(0.5).setInteractive({useHandCursor:true});
  const txt=s.add.text(x,y,label,{font:'16px Arial',color:'#ffffff'}).setOrigin(0.5);
  bg.on('pointerdown',()=>{ bg.setScale(0.98); onClick&&onClick(); });
  bg.on('pointerup',()=>bg.setScale(1));
  bg.on('pointerout',()=>bg.setScale(1));
  bg.setLabel=(t)=>txt.setText(t);
  return bg;
}
function smallButton(x,y,w,h,label,onClick){
  const bg=s.add.rectangle(x,y,w,h,0x23324a).setStrokeStyle(2,0x152033).setOrigin(0.5).setInteractive({useHandCursor:true});
  const txt=s.add.text(x,y,label,{font:'13px Arial',color:'#d6e8ff'}).setOrigin(0.5);
  bg.on('pointerdown',()=>{ bg.setScale(0.98); onClick&&onClick(); });
  bg.on('pointerup',()=>bg.setScale(1));
  bg.on('pointerout',()=>bg.setScale(1));
  bg.setActiveState=(armed)=>{ bg.setStrokeStyle(2, armed?0x6fd1ff:0x152033); txt.setColor(armed?'#ffffff':'#d6e8ff'); };
  bg._txt=txt;
  return bg;
}

/* ---------------- Loadouts ---------------- */
function pickRandom(arr){ return arr[(Math.random()*arr.length)|0]; }
function rollLoadout(f){
  if(f===s.player && nextEquipOverride.mainId && MAIN_MAP[nextEquipOverride.mainId]){
    f.mainWeapon = MAIN_MAP[nextEquipOverride.mainId];
  } else {
    f.mainWeapon = pickRandom(MAIN_WEAPONS);
  }
  if(f===s.player && nextEquipOverride.specId && SPEC_MAP[nextEquipOverride.specId]){
    f.specWeapon = SPEC_MAP[nextEquipOverride.specId];
  } else {
    f.specWeapon = pickRandom(SPEC_WEAPONS);
  }
}
function clearNextOverrides(){ nextEquipOverride.mainId=null; nextEquipOverride.specId=null; }
function rollBothLoadouts(){ rollLoadout(s.player); rollLoadout(s.enemy); }
function refreshLoadoutTexts(){
  const p=s.player, e=s.enemy;
  p.loadoutTxt.setText(`Main: ${p.mainWeapon.name}  |  Spec: ${p.specWeapon.name}`);
  e.loadoutTxt.setText(`Main: ${e.mainWeapon.name}  |  Spec: ${e.specWeapon.name}`);
  ui.specBtn._txt.setText(`SPEC (${p.specWeapon.name})`);
  ui.invTxt.setText(invLabel());
}
function invLabel(){ return `Loot: Mains ${inventory.mains.length} | Specs ${inventory.specs.length}`; }

/* ---------------- Combat control ---------------- */
function startDuel(){
  if(duelActive) return;
  duelActive=true;
  duelEnded=false;
  ui.status.setText('Fight!');
  ui.startBtn.setVisible(false);
  ui.rematchBtn.setVisible(false);

  s.player.nextAttack = s.player.mainWeapon.speedTicks;
  s.enemy.nextAttack  = s.enemy.mainWeapon.speedTicks;

  s.player.wantSpec=false; s.player.armedSpecTick=-1;
  s.enemy .wantSpec=false; s.enemy .armedSpecTick=-1;

  if(tickEvent) tickEvent.remove(false);
  tickEvent = s.time.addEvent({ delay:TICK_MS, loop:true, callback:onTick });
}

function onTick(){
  if(!duelActive || duelEnded) return;
  tickCount++;

  const p=s.player, e=s.enemy;
  if(!p.alive || !e.alive){ safeEnd(p.alive?p:e, p.alive?e:p); return; }

  regenSpec(p); regenSpec(e);
  if(p.specCooldown>0) p.specCooldown--;
  if(e.specCooldown>0) e.specCooldown--;

  p.nextAttack--; e.nextAttack--;

  if(p.nextAttack<=0 && p.alive && !duelEnded){
    const fired = tryFireSpecialOnTick(p, e);
    if(!fired && !duelEnded){ doSwing(p, e); if(!duelEnded) p.nextAttack = p.mainWeapon.speedTicks; }
  }

  if(e.nextAttack<=0 && e.alive && !duelEnded){
    if(!e.wantSpec && canSpec(e)){
      const want = (p.hp <= 45) ? 0.7 : 0.25;
      if(Math.random()<want){ e.wantSpec = true; e.armedSpecTick = tickCount; }
    }
    const fired = tryFireSpecialOnTick(e, p);
    if(!fired && !duelEnded){ doSwing(e, p); if(!duelEnded) e.nextAttack = e.mainWeapon.speedTicks; }
  }
}

/* ---------------- End / KO ---------------- */
function stopDuel(){
  if(!duelActive) return;
  duelActive=false;
  if(tickEvent){ try{ tickEvent.remove(false); }catch{} tickEvent=null; }
  ui.rematchBtn.setVisible(true);
}

function safeEnd(winner, loser){
  if(duelEnded) return;
  duelEnded=true;
  duelActive=false;

  if(tickEvent){ try{ tickEvent.remove(false); }catch{} tickEvent=null; }
  const winnerName = winner?.name || 'Winner';
  ui.status.setText(`${winnerName} wins!`);
  ui.rematchBtn.setVisible(true);

  if(SHOW_LOOT && winner===s.player){
    const mainId = s.enemy.mainWeapon?.id;
    const specId = s.enemy.specWeapon?.id;
    s.time.delayedCall(40, ()=>loot_show(mainId, specId));
  }
}

/* ---------------- Rematch ---------------- */
function rematch(){
  resetFighter(s.player);
  resetFighter(s.enemy);
  rollBothLoadouts();
  refreshLoadoutTexts();
  clearNextOverrides();
  duelEnded=false;
  ui.status.setText('Reroll loadouts, then Start Duel');
  ui.startBtn.setVisible(true);
  ui.rematchBtn.setVisible(false);
  ui.specBtn.setActiveState(false);
}

function resetFighter(f){
  f.hp=f.maxHp; f.alive=true;
  f.food=FOOD_START; f.lastEatTick=-999;
  f.spec=SPEC_MAX; f.wantSpec=false; f.armedSpecTick=-1; f.specCooldown=0; f.lastSpecTick=-999;
  f.nextAttack=0;
  f.body.setAlpha(1).setScale(1);
  updateHpUI(f); updateFoodUI(f); updateSpecUI(f);
}

/* ---------------- Specials (arm → next tick) ---------------- */
function togglePlayerSpec(){
  const p=s.player;
  if(!duelActive || !p.alive || duelEnded) return;
  if(p.wantSpec){ p.wantSpec=false; p.armedSpecTick=-1; ui.specBtn.setActiveState(false); ui.status.setText('Special disarmed'); return; }
  if(!canSpec(p)){ ui.status.setText('Not ready (energy/cooldown)'); return; }
  p.wantSpec=true; p.armedSpecTick=tickCount; ui.specBtn.setActiveState(true);
  ui.status.setText('Special armed — will fire on your next tick');
}
function canSpec(f){ return f.spec>=f.specWeapon.cost && f.specCooldown<=0; }
function tryFireSpecialOnTick(a, d){
  // only fire if armed and at least one full tick has elapsed since arming
  if(duelEnded) return false;
  if(!a.wantSpec) return false;
  if(a.armedSpecTick === -1 || tickCount <= a.armedSpecTick) return false;
  if(!canSpec(a)) return false;

  performSpecial(a, d);
  a.wantSpec=false; a.armedSpecTick=-1;
  if(a===s.player) ui.specBtn.setActiveState(false);
  return true;
}
function performSpecial(a, d){
  if(duelEnded || !a.alive || !d.alive) return;
  const spec=a.specWeapon.type, cost=a.specWeapon.cost;
  if(a.spec<cost) return;
  a.spec -= cost; updateSpecUI(a);

  // After a spec, we SET nextAttack to (base + recovery), not +=
  if(spec==='dds'){
    doSwing(a,d,0.15,1.15); if(duelEnded) return;
    doSwing(a,d,0.15,1.15);
    a.nextAttack = a.mainWeapon.speedTicks + 1;
    a.specCooldown = 3; ui.status.setText(`${a.name} uses Double Stab!`);
  }else if(spec==='claws'){
    const parts=[0.4,0.3,0.2,0.1];
    for(const pct of parts){ doSwing(a,d,0.1,pct*1.8); if(duelEnded) break; }
    a.nextAttack = a.mainWeapon.speedTicks + 2;
    a.specCooldown = 4; ui.status.setText(`${a.name} unleashes Claw Flurry!`);
  }else if(spec==='ags'){
    doSwing(a,d,0.15,1.5);
    a.nextAttack = a.mainWeapon.speedTicks + 2;
    a.specCooldown = 4; ui.status.setText(`${a.name} smashes with AGS!`);
  }else if(spec==='dbow'){
    doSwing(a,d,0.1,1.25); if(duelEnded) return;
    doSwing(a,d,0.1,1.25);
    a.nextAttack = a.mainWeapon.speedTicks + 2;
    a.specCooldown = 4; ui.status.setText(`${a.name} fires Dark Bow!`);
  }else if(spec==='vstaff'){
    doSwing(a,d,0.2,1.8);
    a.nextAttack = a.mainWeapon.speedTicks + 3;
    a.specCooldown = 5; ui.status.setText(`${a.name} channels Volatile Blast!`);
  }
  a.lastSpecTick = tickCount;
}

/* ---------------- Autos / Damage ---------------- */
function doSwing(attacker, defender, accBonus=0, dmgMult=1){
  if(duelEnded || !attacker.alive || !defender.alive) return;

  const max = Math.round(attacker.mainWeapon.maxHit * dmgMult);
  const hitChance = Math.min(0.98, Math.max(0, BASE_ACCURACY + accBonus));
  const hit = Math.random() < hitChance;
  const dmg = hit ? Phaser.Math.Between(0, Math.max(0,max)) : 0;

  const lethal = dmg >= defender.hp;

  swingFx(attacker, defender, dmg);

  if(dmg>0){
    defender.hp = Math.max(0, defender.hp - dmg);
    updateHpUI(defender);

    if(lethal){
      defender.alive=false;
      deathFx(defender);
      safeEnd(attacker, defender);
      return;
    }

    if(defender.hp<=EAT_AT_HP) tryAutoEat(defender);
  }else{
    if(defender.hp>0 && defender.hp<=EAT_AT_HP) tryAutoEat(defender);
  }
}

/* ---------------- Eating / regen ---------------- */
function tryAutoEat(f){
  if(duelEnded) return;
  if(f.food<=0) return;
  if(f.lastEatTick===tickCount) return;
  f.food--; f.lastEatTick=tickCount;

  const before=f.hp;
  f.hp = Math.min(f.maxHp, f.hp + FOOD_HEAL);
  const healed = f.hp - before;

  f.nextAttack = f.nextAttack + EAT_COST_TK; // minor delay
  updateHpUI(f); updateFoodUI(f); eatFx(f, healed);

  if(!duelEnded) ui.status.setText((f===s.player)?`You eat (+${healed}) — Food left: ${f.food}`:`Bot eats (+${healed}) — Food left: ${f.food}`);
}
function regenSpec(f){
  if(!f.alive || duelEnded) return;
  f.spec = Math.min(SPEC_MAX, f.spec + SPEC_REGEN_PER_TICK);
  updateSpecUI(f);
}

/* ---------------- Loot Panel ---------------- */
let lootUI = null;
function buildLootPanel(){
  if(!SHOW_LOOT){ lootUI=null; return; }
  const cx=W/2, cy=H*0.34;
  const cont = s.add.container(cx, cy);
  cont.setDepth(10);
  const bg = s.add.rectangle(0,0, W*0.84, 170, 0x202a3a).setStrokeStyle(2,0x0f141d).setOrigin(0.5);
  const title = s.add.text(0,-68,'Loot Found',{font:'16px Arial',color:'#ffffff'}).setOrigin(0.5);

  const mainTxt = s.add.text(-150,-36,'Main: —',{font:'13px Arial',color:'#cfe8ff'}).setOrigin(0,0.5);
  const specTxt = s.add.text(-150,-12,'Spec: —',{font:'13px Arial',color:'#cfe8ff'}).setOrigin(0,0.5);

  const takeMainBtn = button(-60, 32, 110, 30, 'Take Main', ()=>loot_takeMain());
  const takeSpecBtn = button( 60, 32, 110, 30, 'Take Spec', ()=>loot_takeSpec());

  const equipNextMain = s.add.text(-150, 56, '☐ Equip main next round', {font:'12px Arial', color:'#9fdcff'}).setOrigin(0,0.5).setInteractive({useHandCursor:true});
  const equipNextSpec = s.add.text(-150, 76, '☐ Equip spec next round', {font:'12px Arial', color:'#9fdcff'}).setOrigin(0,0.5).setInteractive({useHandCursor:true});

  const closeBtn = button(140, 70, 80, 28, 'Close', ()=>loot_hide());

  cont.add([bg,title,mainTxt,specTxt,takeMainBtn,takeSpecBtn,equipNextMain,equipNextSpec,closeBtn]);
  cont.setVisible(false);

  lootUI = {
    cont, mainTxt, specTxt,
    equipNextMain, equipNextSpec,
    currentMainId:null, currentSpecId:null,
    equipMain:false, equipSpec:false
  };

  equipNextMain.on('pointerdown',()=>{
    lootUI.equipMain=!lootUI.equipMain;
    equipNextMain.setText((lootUI.equipMain?'☑':'☐')+' Equip main next round');
  });
  equipNextSpec.on('pointerdown',()=>{
    lootUI.equipSpec=!lootUI.equipSpec;
    equipNextSpec.setText((lootUI.equipSpec?'☑':'☐')+' Equip spec next round');
  });

  function loot_takeMain(){
    if(!lootUI.currentMainId) return;
    if(!inventory.mains.includes(lootUI.currentMainId)){
      inventory.mains.push(lootUI.currentMainId); saveInventory(); ui.invTxt.setText(invLabel());
    }
  }
  function loot_takeSpec(){
    if(!lootUI.currentSpecId) return;
    if(!inventory.specs.includes(lootUI.currentSpecId)){
      inventory.specs.push(lootUI.currentSpecId); saveInventory(); ui.invTxt.setText(invLabel());
    }
  }
}
function loot_show(mainId, specId){
  if(!SHOW_LOOT || !lootUI) return;
  lootUI.currentMainId = mainId || null;
  lootUI.currentSpecId = specId || null;
  lootUI.equipMain=false; lootUI.equipSpec=false;
  lootUI.equipNextMain.setText('☐ Equip main next round');
  lootUI.equipNextSpec.setText('☐ Equip spec next round');

  const mainName = mainId && MAIN_MAP[mainId] ? MAIN_MAP[mainId].name : '—';
  const specName = specId && SPEC_MAP[specId] ? SPEC_MAP[specId].name : '—';
  lootUI.mainTxt.setText(`Main: ${mainName}`);
  lootUI.specTxt.setText(`Spec: ${specName}`);

  lootUI.cont.setVisible(true);
}
function loot_hide(){
  if(!SHOW_LOOT || !lootUI) return;
  lootUI.cont.setVisible(false);
  if(lootUI.equipMain) nextEquipOverride.mainId = lootUI.currentMainId;
  if(lootUI.equipSpec) nextEquipOverride.specId = lootUI.currentSpecId;
}

/* ---------------- FX ---------------- */
function swingFx(a, d, dmg){
  if(duelEnded) return;
  const ang=Phaser.Math.Angle.Between(a.x, a.y, d.x, d.y);
  const dist=Phaser.Math.Distance.Between(a.x,a.y,d.x,d.y)-18;
  const swipe=s.add.rectangle(a.x,a.y,Math.max(8,dist),6,0x99ddff).setStrokeStyle(2,0xcfeaff)
    .setOrigin(0,0.5).setRotation(ang).setAlpha(0).setScale(0,1);
  s.tweens.add({targets:swipe,alpha:.95,scaleX:1,duration:120,ease:'quad.out',
    onComplete:()=>s.tweens.add({targets:swipe,alpha:0,duration:140,onComplete:()=>swipe.destroy()})
  });
  s.tweens.add({targets:a.body, scale:1.15, yoyo:true, duration:120});
  const flash=s.add.circle(d.x,d.y,8, dmg>0?0xffff88:0x8888ff).setAlpha(0.9);
  s.tweens.add({targets:flash, radius:20, alpha:0, duration:220, onComplete:()=>flash.destroy()});
  const txt = s.add.text(d.x, d.y-30, dmg>0?`-${dmg}`:'0', {font:'14px Arial', color:'#ffffff'}).setOrigin(0.5);
  s.tweens.add({targets:txt, y:d.y-46, alpha:0, duration:700, onComplete:()=>txt.destroy()});
}
function eatFx(f, healed){
  if(duelEnded) return;
  const ring=s.add.circle(f.x,f.y,12,0x4dd06d).setAlpha(0.9);
  s.tweens.add({targets:ring, radius:24, alpha:0, duration:260, onComplete:()=>ring.destroy()});
  const t=s.add.text(f.x, f.y-64, `+${healed}`, {font:'13px Arial', color:'#a9ffb6'}).setOrigin(0.5);
  s.tweens.add({targets:t, y:f.y-80, alpha:0, duration:700, onComplete:()=>t.destroy()});
}

/* ---------------- UI updates ---------------- */
function updateHpUI(f){
  const barW=110, r = Math.max(0, f.hp/f.maxHp);
  f.hpFill.width = barW * r;
  f.hpFill.fillColor = r>0.5 ? 0x4dd06d : (r>0.2 ? 0xf1c14e : 0xe86a6a);
  f.hpText.setText(`${f.hp}/${f.maxHp}`);
}
function updateFoodUI(f){
  f.foodTxt.setText(`Food: ${f.food}`);
  f.foodTxt.setColor(f.food>0 ? '#cfe8ff' : '#ffaaaa');
  f.foodBg.fillColor = f.food>0 ? 0x1f2a3a : 0x3a2222;
}
function updateSpecUI(f){
  const w = 110, r = Math.max(0, Math.min(1, f.spec/SPEC_MAX));
  f.specFill.width = w * r;
  f.specFill.fillColor = r>0.5 ? 0x6fd1ff : (r>0.25 ? 0xf1c14e : 0xe86a6a);
  f.specTxt.setText(`Spec ${Math.round(f.spec)}%`);
}
