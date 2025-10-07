/* PvP (offline) — iPhone + Food + Tick Specials + Random Loadouts (No Armour)
   - Loadouts locked during duel
   - Main weapons: D Scim / Whip / MSB / Dragon Knives / Fire Surge / Ice Blitz
   - Specs: DDS, Claws, AGS, Dark Bow, Volatile Staff
   - Specials arm first, fire on next attack tick; have cooldowns
   - SAFE KO: idempotent end-of-duel guards to prevent crash at death
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

// ---- Timing / base ----
const TICK_MS = 600;
const BASE_ACCURACY = 0.80;

// ---- Styles ----
const STYLES = { MELEE:'Melee', RANGED:'Ranged', MAGE:'Mage' };

// ---- Main weapons (auto-attack stats only) ----
const MAIN_WEAPONS = [
  // Melee
  {id:'dscim', name:'Dragon Scimitar', style:STYLES.MELEE,  speedTicks:5, maxHit:48},
  {id:'whip',  name:'Abyssal Whip',    style:STYLES.MELEE,  speedTicks:4, maxHit:42},
  // Ranged
  {id:'msb',   name:'Magic Shortbow',  style:STYLES.RANGED, speedTicks:5, maxHit:40},
  {id:'dkn',   name:'Dragon Knives',   style:STYLES.RANGED, speedTicks:3, maxHit:25},
  // Magic
  {id:'fsurge',name:'Fire Surge',      style:STYLES.MAGE,   speedTicks:5, maxHit:48},
  {id:'iblitz',name:'Ice Blitz',       style:STYLES.MAGE,   speedTicks:5, maxHit:44},
];

// ---- Spec weapons (which special move) ----
const SPEC_WEAPONS = [
  // Melee
  {id:'dds',    name:'Dragon Dagger',  cost:25, type:'dds'},    // 2 accurate pokes
  {id:'dclaws', name:'Dragon Claws',   cost:50, type:'claws'},  // 4-hit flurry
  {id:'ags',    name:'Armadyl GS',     cost:50, type:'ags'},    // big slam
  // Ranged
  {id:'dbow',   name:'Dark Bow',       cost:50, type:'dbow'},   // 2 heavy arrows
  // Magic
  {id:'vstaff', name:'Volatile Staff', cost:55, type:'vstaff'}, // massive single hit
];

// ---- Food / spec energy ----
const EAT_AT_HP=50, FOOD_HEAL=20, FOOD_START=10, EAT_COST_TK=1;
const SPEC_MAX=100, SPEC_REGEN_PER_TICK=2;

// ---- Runtime ----
let s, ui={}, tickEvent=null, tickCount=0, duelActive=false, duelEnded=false;

function preload(){}

function create(){
  s=this;

  s.add.text(W/2,22,'RuneScape-Style PvP (Offline)',{font:'18px Arial',color:'#ffffff'}).setOrigin(0.5);
  s.add.rectangle(W/2,H*0.52, W*0.72, 2, 0x2a3a55);

  const leftX=W*0.28, rightX=W*0.72, y=H*0.45;
  const p = makeFighter({ name:'You', x:leftX,  y, color:0x66ccff, outline:0x003355 });
  const e = makeFighter({ name:'Bot', x:rightX, y, color:0xff8888, outline:0x4b1b1b });

  s.player=p; s.enemy=e;

  // Labels & loadout lines
  p.nameText   = s.add.text(p.x, p.y-84, `${p.name}`, {font:'12px Arial', color:'#d6e8ff'}).setOrigin(0.5);
  e.nameText   = s.add.text(e.x, e.y-84, `${e.name}`, {font:'12px Arial', color:'#ffd6d6'}).setOrigin(0.5);
  p.loadoutTxt = s.add.text(p.x, p.y-72, '', {font:'10px Arial', color:'#bfe0ff'}).setOrigin(0.5);
  e.loadoutTxt = s.add.text(e.x, e.y-72, '', {font:'10px Arial', color:'#ffd6d6'}).setOrigin(0.5);

  ui.status    = s.add.text(W/2, H-152, 'Reroll loadouts, then Start Duel', {font:'14px Arial', color:'#9fdcff'}).setOrigin(0.5);

  // Buttons (Reroll locked during duel)
  ui.rerollBtn = button(W/2-110, H-110, 150, 36, 'Reroll Loadouts', ()=>{
    if(duelActive) return;
    rollBothLoadouts(); refreshLoadoutTexts();
    ui.status.setText('Loadouts rolled. Ready!');
  });

  ui.specBtn   = smallButton(W/2+110, H-110, 108, 36, 'SPEC', togglePlayerSpec);
  ui.startBtn  = button(W/2+60, H-74, 170, 44, 'Start Duel', ()=>startDuel());
  ui.rematchBtn= button(W/2+60, H-74, 170, 44, 'Rematch', ()=>rematch());
  ui.rematchBtn.setVisible(false);

  // Initial loadouts
  rollBothLoadouts(); refreshLoadoutTexts();
}

/* ---------------- Factories & UI ---------------- */
function makeFighter(opts){
  const f={
    name: opts.name,
    x: opts.x, y:opts.y,
    hp: 99, maxHp:99, alive:true,
    food: FOOD_START, lastEatTick:-999,
    spec: SPEC_MAX, wantSpec:false, specCooldown:0, lastSpecTick:-999,
    mainWeapon:null, specWeapon:null,
    nextAttack:0
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

/* ---------------- Loadouts (locked during duel) ---------------- */
function pickRandom(arr){ return arr[(Math.random()*arr.length)|0]; }
function rollLoadout(f){
  f.mainWeapon = pickRandom(MAIN_WEAPONS);
  f.specWeapon = pickRandom(SPEC_WEAPONS);
}
function rollBothLoadouts(){ rollLoadout(s.player); rollLoadout(s.enemy); }
function refreshLoadoutTexts(){
  const p=s.player, e=s.enemy;
  p.loadoutTxt.setText(`Main: ${p.mainWeapon.name} (${p.mainWeapon.style}) | Spec: ${p.specWeapon.name}`);
  e.loadoutTxt.setText(`Main: ${e.mainWeapon.name} (${e.mainWeapon.style}) | Spec: ${e.specWeapon.name}`);
  ui.specBtn._txt.setText(`SPEC (${p.specWeapon.name})`);
}

/* ---------------- Special arming (player) ---------------- */
function togglePlayerSpec(){
  const p=s.player;
  if(!duelActive || !p.alive || duelEnded) return;
  if(p.wantSpec){ p.wantSpec=false; ui.specBtn.setActiveState(false); ui.status.setText('Special disarmed'); return; }
  if(!canSpec(p)){ ui.status.setText('Not ready (energy/cooldown)'); return; }
  p.wantSpec=true; ui.specBtn.setActiveState(true);
  ui.status.setText('Special armed — fires on your next tick');
}
function canSpec(f){ return f.spec>=f.specWeapon.cost && f.specCooldown<=0; }

/* ---------------- Combat flow ---------------- */
function startDuel(){
  if(duelActive) return;
  duelActive=true;
  duelEnded=false;
  ui.status.setText('Fight!');
  ui.startBtn.setVisible(false);
  ui.rematchBtn.setVisible(false);

  s.player.nextAttack = s.player.mainWeapon.speedTicks;
  s.enemy.nextAttack  = s.enemy.mainWeapon.speedTicks;

  if(tickEvent) tickEvent.remove(false);
  tickEvent = s.time.addEvent({ delay:TICK_MS, loop:true, callback:onTick });
}

function onTick(){
  if(!duelActive || duelEnded) return;
  tickCount++;

  const p=s.player, e=s.enemy;
  if(!p.alive || !e.alive){ safeEnd(p.alive ? p : e); return; }

  // regen & cooldowns
  regenSpec(p); regenSpec(e);
  if(p.specCooldown>0) p.specCooldown--;
  if(e.specCooldown>0) e.specCooldown--;

  p.nextAttack--; e.nextAttack--;

  // Player tick
  if(p.nextAttack<=0 && p.alive){
    const fired = tryFireSpecialOnTick(p, e);
    if(!fired && !duelEnded){
      doSwing(p, e);
      if(!duelEnded) p.nextAttack = p.mainWeapon.speedTicks;
    }
  }

  // Enemy tick
  if(e.nextAttack<=0 && e.alive && !duelEnded){
    if(!e.wantSpec && canSpec(e)){
      const want = (p.hp <= 45) ? 0.7 : 0.25;
      if(Math.random()<want) e.wantSpec = true;
    }
    const fired = tryFireSpecialOnTick(e, p);
    if(!fired && !duelEnded){
      doSwing(e, p);
      if(!duelEnded) e.nextAttack = e.mainWeapon.speedTicks;
    }
  }
}

function stopDuel(){
  // Idempotent: safe to call many times
  if(duelEnded) return;
  duelEnded=true;
  duelActive=false;
  if(tickEvent){ try{ tickEvent.remove(false); }catch{} tickEvent=null; }
  ui.rematchBtn.setVisible(true);
}

function safeEnd(winner){
  if(duelEnded) return;
  duelEnded=true;
  duelActive=false;
  if(tickEvent){ try{ tickEvent.remove(false); }catch{} tickEvent=null; }
  const name = winner?.name || 'Winner';
  ui.status.setText(`${name} wins!`);
  ui.rematchBtn.setVisible(true);
}

function rematch(){
  resetFighter(s.player);
  resetFighter(s.enemy);
  rollBothLoadouts(); refreshLoadoutTexts();
  duelEnded=false;
  ui.status.setText('Reroll loadouts, then Start Duel');
  ui.startBtn.setVisible(true);
  ui.rematchBtn.setVisible(false);
  ui.specBtn.setActiveState(false);
}

function resetFighter(f){
  f.hp=f.maxHp; f.alive=true;
  f.food=FOOD_START; f.lastEatTick=-999;
  f.spec=SPEC_MAX; f.wantSpec=false; f.specCooldown=0; f.lastSpecTick=-999;
  f.nextAttack=0;
  f.body.setAlpha(1).setScale(1);
  updateHpUI(f); updateFoodUI(f); updateSpecUI(f);
}

/* ---------------- Tick-gated specials ---------------- */
function tryFireSpecialOnTick(a, d){
  if(duelEnded) return false;
  if(!a.wantSpec || !canSpec(a)) return false;
  performSpecial(a, d);
  a.wantSpec=false; if(a===s.player) ui.specBtn.setActiveState(false);
  return true;
}

function performSpecial(a, d){
  if(duelEnded || !a.alive || !d.alive) return;
  const spec=a.specWeapon.type, cost=a.specWeapon.cost;
  if(a.spec<cost) return;

  // Spend spec
  a.spec -= cost; updateSpecUI(a);

  // No armour triangle in this build; just tuned acc/dmg
  if(spec==='dds'){ // 2 fast accurate pokes
    doSwing(a, d, 0.15, 1.15); if(duelEnded) return;
    doSwing(a, d, 0.15, 1.15);
    a.nextAttack = a.mainWeapon.speedTicks + 1;
    a.specCooldown = 3;
    ui.status.setText(`${a.name} uses Double Stab!`);

  }else if(spec==='claws'){ // 4 descending
    const parts=[0.40,0.30,0.20,0.10];
    for(const pct of parts){ doSwing(a, d, 0.10, pct*1.8); if(duelEnded) break; }
    a.nextAttack = a.mainWeapon.speedTicks + 2;
    a.specCooldown = 4;
    ui.status.setText(`${a.name} unleashes Claw Flurry!`);

  }else if(spec==='ags'){ // big slam
    doSwing(a, d, 0.15, 1.5);
    a.nextAttack = a.mainWeapon.speedTicks + 2;
    a.specCooldown = 4;
    ui.status.setText(`${a.name} smashes with AGS!`);

  }else if(spec==='dbow'){ // Dark Bow: 2 heavy arrows
    doSwing(a, d, 0.10, 1.25); if(duelEnded) return;
    doSwing(a, d, 0.10, 1.25);
    a.nextAttack = a.mainWeapon.speedTicks + 2;
    a.specCooldown = 4;
    ui.status.setText(`${a.name} fires Dark Bow!`);

  }else if(spec==='vstaff'){ // Volatile Staff: massive accurate single hit
    doSwing(a, d, 0.20, 1.8);
    a.nextAttack = a.mainWeapon.speedTicks + 3;
    a.specCooldown = 5;
    ui.status.setText(`${a.name} channels Volatile Blast!`);
  }

  a.lastSpecTick = tickCount;
}

/* ---------------- Autos / damage ---------------- */
function doSwing(attacker, defender, accBonus=0, dmgMult=1){
  if(duelEnded || !attacker.alive || !defender.alive) return;

  const max = Math.round(attacker.mainWeapon.maxHit * dmgMult);
  const hitChance = Math.min(0.98, Math.max(0, BASE_ACCURACY + accBonus));
  const hit = Math.random() < hitChance;
  const dmg = hit ? Phaser.Math.Between(0, Math.max(0,max)) : 0;

  swingFx(attacker, defender, dmg);

  if(dmg>0){
    defender.hp = Math.max(0, defender.hp - dmg);
    updateHpUI(defender);

    if(defender.hp>0 && defender.hp<=EAT_AT_HP) tryAutoEat(defender);

    if(defender.hp<=0){
      defender.alive=false;
      deathFx(defender);
      safeEnd(attacker);
      return;
    }
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

  f.nextAttack += EAT_COST_TK;

  updateHpUI(f); updateFoodUI(f); eatFx(f, healed);
  if(!duelEnded){
    ui.status.setText((f===s.player)?`You eat (+${healed}) — Food left: ${f.food}`:`Bot eats (+${healed}) — Food left: ${f.food}`);
  }
}
function regenSpec(f){
  if(!f.alive || duelEnded) return;
  f.spec = Math.min(SPEC_MAX, f.spec + SPEC_REGEN_PER_TICK);
  updateSpecUI(f);
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
  const w=110, r = Math.max(0, Math.min(1, f.spec/SPEC_MAX));
  f.specFill.width = w * r;
  f.specFill.fillColor = r>0.5 ? 0x6fd1ff : (r>0.25 ? 0xf1c14e : 0xe86a6a);
  f.specTxt.setText(`Spec ${Math.round(f.spec)}%`);
}
