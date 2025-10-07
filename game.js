/* RuneScape-style PvP (offline) — iPhone + Food + Tick-true Specials
   - 600 ms tick engine
   - On-screen weapon buttons
   - Auto-eat at <= 50 HP, 10 food each, +20 heal, costs 1 tick
   - Specials ARM first, then FIRE on the attacker’s next tick (OSRS-style)
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

// --- Core combat constants ---
const TICK_MS = 600; // RuneScape-like tick
const WEAPONS = {
  sword: {id:'sword', name:'Sword',  speedTicks:6, maxHit:50, specCost:50}, // claws-style
  dagger:{id:'dagger',name:'Dagger', speedTicks:4, maxHit:30, specCost:25}, // dds-style
  axe:   {id:'axe',   name:'Axe',    speedTicks:8, maxHit:70, specCost:50}, // ags-style
};

// --- Food config ---
const EAT_AT_HP   = 50;
const FOOD_HEAL   = 20;
const FOOD_START  = 10;
const EAT_COST_TK = 1;

// --- Special energy ---
const SPEC_MAX = 100;
const SPEC_REGEN_PER_TICK = 2; // +2% per tick

// --- Hit model (simple, tweakable) ---
const BASE_ACCURACY = 0.80;

// --- Runtime state ---
let s;                    // scene
let ui={};               // texts & buttons
let tickEvent=null;      // global tick loop
let tickCount=0;
let duelActive=false;

function preload(){}

function create(){
  s=this;

  // Title
  s.add.text(W/2,22,'RuneScape-Style PvP (Offline)',{font:'18px Arial',color:'#ffffff'}).setOrigin(0.5);

  // Arena line
  s.add.rectangle(W/2,H*0.52, W*0.72, 2, 0x2a3a55);

  // Fighters
  const leftX=W*0.28, rightX=W*0.72, y=H*0.45;

  const p = makeFighter({ name:'You',   x:leftX,  y,  color:0x66ccff, outline:0x003355,  weapon:WEAPONS.sword });
  const e = makeFighter({ name:'Bot',   x:rightX, y,  color:0xff8888, outline:0x4b1b1b,  weapon:WEAPONS.dagger });

  s.player=p; s.enemy=e;

  // Labels
  p.nameText = s.add.text(p.x, p.y-60, `${p.name}`, {font:'12px Arial', color:'#d6e8ff'}).setOrigin(0.5);
  e.nameText = s.add.text(e.x, e.y-60, `${e.name}`, {font:'12px Arial', color:'#ffd6d6'}).setOrigin(0.5);

  // Status
  ui.status = s.add.text(W/2, H-140, 'Pick a weapon, then Start Duel', {font:'14px Arial', color:'#9fdcff'}).setOrigin(0.5);

  // Weapon bar
  createWeaponBar();

  // Special button (player) — arm/disarm, fires next tick if armed
  ui.specBtn = smallButton(W/2-112, H-100, 108, 36, 'SPECIAL', togglePlayerSpec);
  ui.specHint = s.add.text(W/2-112, H-121, 'Spec (arms → next tick)', {font:'10px Arial', color:'#cfe8ff'}).setOrigin(0.5);

  // Start/Rematch
  ui.startBtn   = button(W/2+60, H-74, 170, 44, 'Start Duel', ()=>startDuel());
  ui.rematchBtn = button(W/2+60, H-74, 170, 44, 'Rematch', ()=>rematch());
  ui.rematchBtn.setVisible(false);

  // Bot random weapon swaps every ~6–10 seconds (only during duel)
  s.time.addEvent({
    delay: Phaser.Math.Between(6000,10000),
    loop:true,
    callback: ()=>{
      if(!duelActive) return;
      const pool=[WEAPONS.sword, WEAPONS.dagger, WEAPONS.axe];
      const pick=Phaser.Utils.Array.GetRandom(pool);
      setWeapon(s.enemy, pick, `${s.enemy.name} switches to ${pick.name}`, true);
      highlightWeapon();
    }
  });
}

/* ------------ Fighter factory ------------ */
function makeFighter(opts){
  const f={
    name: opts.name,
    x: opts.x, y:opts.y,
    hp: 99, maxHp: 99,
    nextAttack: 0,
    weapon: opts.weapon,
    alive: true,
    food: FOOD_START,
    lastEatTick: -999,
    spec: SPEC_MAX,
    wantSpec: false // ARMED state; fires on next attack tick
  };
  const r=18;
  f.body = s.add.circle(f.x, f.y, r, opts.color).setStrokeStyle(3, opts.outline);

  // HP bar
  const barW=110, barH=10;
  f.hpBg   = s.add.rectangle(f.x, f.y-36, barW, barH, 0x2b2b2b).setStrokeStyle(2,0x161616).setOrigin(0.5);
  f.hpFill = s.add.rectangle(f.x-barW/2, f.y-36, barW, barH-2, 0x4dd06d).setOrigin(0,0.5);
  f.hpText = s.add.text(f.x, f.y-36, '', {font:'11px Arial', color:'#ffffff'}).setOrigin(0.5);

  // Food UI
  f.foodBg  = s.add.rectangle(f.x, f.y-18, 56, 14, 0x1f2a3a).setStrokeStyle(1,0x0e141c).setOrigin(0.5);
  f.foodTxt = s.add.text(f.x, f.y-18, `Food: ${f.food}`, {font:'10px Arial', color:'#cfe8ff'}).setOrigin(0.5);

  // Special energy bar
  f.specBg  = s.add.rectangle(f.x, f.y-6, 110, 6, 0x101621).setStrokeStyle(1,0x0e141c).setOrigin(0.5);
  f.specFill= s.add.rectangle(f.x-55, f.y-6, 110, 4, 0x6fd1ff).setOrigin(0,0.5);
  f.specTxt = s.add.text(f.x, f.y+10, `Spec ${f.spec}%`, {font:'10px Arial', color:'#cfe8ff'}).setOrigin(0.5);

  updateHpUI(f);
  updateFoodUI(f);
  updateSpecUI(f);
  return f;
}

/* --------- UI bits --------- */
function button(x,y,w,h,label,onClick){
  const bg=s.add.rectangle(x,y,w,h,0x2a2f45).setStrokeStyle(2,0x151826).setOrigin(0.5).setInteractive({useHandCursor:true});
  const txt=s.add.text(x,y,label,{font:'16px Arial',color:'#ffffff'}).setOrigin(0.5);
  bg.on('pointerdown',()=>{ bg.setScale(0.98); onClick&&onClick(); });
  bg.on('pointerup',()=>bg.setScale(1));
  bg.on('pointerout',()=>bg.setScale(1));
  bg.setLabel = (t)=>txt.setText(t);
  return bg;
}
function smallButton(x,y,w,h,label,onClick){
  const bg=s.add.rectangle(x,y,w,h,0x23324a).setStrokeStyle(2,0x152033).setOrigin(0.5).setInteractive({useHandCursor:true});
  const txt=s.add.text(x,y,label,{font:'13px Arial',color:'#d6e8ff'}).setOrigin(0.5);
  bg.on('pointerdown',()=>{ bg.setScale(0.98); onClick&&onClick(); });
  bg.on('pointerup',()=>bg.setScale(1));
  bg.on('pointerout',()=>bg.setScale(1));
  bg.setActiveState=(armed)=>{
    bg.setStrokeStyle(2, armed?0x6fd1ff:0x152033);
    txt.setColor(armed?'#ffffff':'#d6e8ff');
  };
  bg._txt=txt;
  return bg;
}

function createWeaponBar(){
  const y = H-170;
  ui.weaponBtns = [];

  const items = [
    {key:'sword',  w:WEAPONS.sword},
    {key:'dagger', w:WEAPONS.dagger},
    {key:'axe',    w:WEAPONS.axe}
  ];

  const spacing = 126;
  const startX = W/2 - spacing;

  items.forEach((it,i)=>{
    const x = startX + i*spacing;
    const btn = weaponButton(x, y, 108, 44, it.w.name, ()=> {
      setWeapon(s.player, it.w, `Equipped ${it.w.name}`);
      highlightWeapon();
    });
    btn._weaponKey = it.key;
    ui.weaponBtns.push(btn);
  });

  highlightWeapon();
}

function weaponButton(x,y,w,h,label,onClick){
  const bg=s.add.rectangle(x,y,w,h,0x293245).setStrokeStyle(2,0x18202c).setOrigin(0.5).setInteractive({useHandCursor:true});
  const txt=s.add.text(x,y,label,{font:'14px Arial',color:'#d6e8ff'}).setOrigin(0.5);
  bg.on('pointerdown',()=>{ bg.setScale(0.98); onClick&&onClick(); });
  bg.on('pointerup',()=>bg.setScale(1));
  bg.on('pointerout',()=>bg.setScale(1));
  bg.setActiveState=(active)=>{
    bg.setStrokeStyle(2, active?0x9fdcff:0x18202c);
    txt.setColor(active?'#ffffff':'#d6e8ff');
  };
  return bg;
}

function highlightWeapon(){
  const current = s.player.weapon.id;
  ui.weaponBtns.forEach(btn=>{
    const active = (btn._weaponKey === current);
    btn.setActiveState(active);
  });
}

/* --------- Special arming (player) --------- */
function togglePlayerSpec(){
  const p = s.player;
  if(!duelActive || !p.alive) return;
  const cost = p.weapon.specCost ?? 50;
  if(!p.wantSpec && p.spec < cost){
    ui.status.setText('Not enough special energy');
    return;
  }
  p.wantSpec = !p.wantSpec; // toggle armed state
  ui.specBtn.setActiveState(p.wantSpec);
  ui.status.setText(p.wantSpec ? 'Special armed — will fire on your next tick' : 'Special disarmed');
}

/* --------- Combat control --------- */
function startDuel(){
  if(duelActive) return;
  duelActive=true;
  ui.status.setText('Fight!');
  ui.startBtn.setVisible(false);
  ui.rematchBtn.setVisible(false);

  s.player.nextAttack = s.player.weapon.speedTicks;
  s.enemy.nextAttack  = s.enemy.weapon.speedTicks;

  if(tickEvent) tickEvent.remove(false);
  tickEvent = s.time.addEvent({ delay:TICK_MS, loop:true, callback: onTick });
}

function onTick(){
  if(!duelActive) return;

  tickCount++;

  const p=s.player, e=s.enemy;
  if(!p.alive || !e.alive){ stopDuel(); return; }

  // Regen spec energy
  regenSpec(p);
  regenSpec(e);

  p.nextAttack--;
  e.nextAttack--;

  // Player turn: if armed & enough spec, fire special instead of normal swing
  if(p.nextAttack<=0 && p.alive){
    if(p.wantSpec && p.spec >= (p.weapon.specCost ?? 50)){
      performSpecial(p, e);
      p.wantSpec=false;
      ui.specBtn.setActiveState(false);
    }else{
      doSwing(p, e);
      p.nextAttack = p.weapon.speedTicks;
    }
  }

  // Enemy AI: decide ARMED state BEFORE tick, then execute here
  if(e.nextAttack<=0 && e.alive){
    // Simple AI: arm if enough energy and chance met (higher when player is low)
    const cost = e.weapon.specCost ?? 50;
    if(!e.wantSpec && e.spec >= cost){
      const want = (p.hp <= 45) ? 0.8 : 0.25;
      if(Math.random() < want) e.wantSpec = true;
    }
    if(e.wantSpec && e.spec >= (e.weapon.specCost ?? 50)){
      performSpecial(e, p);
      e.wantSpec=false;
    }else{
      doSwing(e, p);
      e.nextAttack = e.weapon.speedTicks;
    }
  }
}

function stopDuel(){
  duelActive=false;
  if(tickEvent){ tickEvent.remove(false); tickEvent=null; }
  ui.rematchBtn.setVisible(true);
}

function rematch(){
  resetFighter(s.player);
  resetFighter(s.enemy);
  ui.status.setText('Pick a weapon, then Start Duel');
  ui.startBtn.setVisible(true);
  ui.rematchBtn.setVisible(false);
  ui.specBtn.setActiveState(false);
}

function resetFighter(f){
  f.hp = f.maxHp; f.alive=true; f.nextAttack=0;
  f.food = FOOD_START; f.lastEatTick=-999;
  f.spec = SPEC_MAX; f.wantSpec=false;
  f.body.setAlpha(1).setScale(1);
  updateHpUI(f);
  updateFoodUI(f);
  updateSpecUI(f);
}

/* --------- Swing / Damage --------- */
function doSwing(attacker, defender, accBonus=0, dmgMult=1){
  if(!attacker.alive || !defender.alive) return;

  const hitChance = Math.min(0.98, BASE_ACCURACY + accBonus);
  const hitRoll = Math.random() < hitChance;
  const raw = hitRoll ? Phaser.Math.Between(0, Math.round(attacker.weapon.maxHit * dmgMult)) : 0;
  const dmg = Math.max(0, Math.floor(raw));

  swingFx(attacker, defender, dmg);

  if(dmg>0){
    defender.hp = Math.max(0, defender.hp - dmg);
    updateHpUI(defender);

    if(defender.hp>0 && defender.hp<=EAT_AT_HP){ tryAutoEat(defender); }

    if(defender.hp<=0){
      defender.alive=false;
      deathFx(defender);
      ui.status.setText(`${attacker.name} wins!`);
      stopDuel();
    }
  }else{
    if(defender.hp>0 && defender.hp<=EAT_AT_HP){ tryAutoEat(defender); }
  }
}

/* --------- Specials (fire ONLY on tick) --------- */
function performSpecial(a, d){
  const id = a.weapon.id;
  const cost = a.weapon.specCost ?? 50;
  if(a.spec < cost) { a.nextAttack = a.weapon.speedTicks; return; }

  if(id==='dagger'){  // DDS: 2 quick accurate stabs
    a.spec -= cost; updateSpecUI(a);
    doSwing(a, d, 0.15, 1.15);
    doSwing(a, d, 0.15, 1.15);
    a.nextAttack = a.weapon.speedTicks + 1; // recovery
    ui.status.setText(`${a.name} uses Special: Double Stab!`);

  }else if(id==='sword'){ // D Claws: 4 descending hits
    a.spec -= cost; updateSpecUI(a);
    const parts = [0.40, 0.30, 0.20, 0.10];
    parts.forEach(pct=>{
      const mult = pct * 1.8;
      doSwing(a, d, 0.10, mult);
    });
    a.nextAttack = a.weapon.speedTicks + 2;
    ui.status.setText(`${a.name} unleashes Special: Flurry!`);

  }else if(id==='axe'){ // AGS: one heavy accurate slam
    a.spec -= cost; updateSpecUI(a);
    doSwing(a, d, 0.15, 1.5);
    a.nextAttack = a.weapon.speedTicks + 2;
    ui.status.setText(`${a.name} uses Special: Judgement!`);
  }
}

/* --------- Eating logic --------- */
function tryAutoEat(f){
  if(f.food<=0) return;
  if(f.lastEatTick===tickCount) return; // once per tick
  f.food--;
  f.lastEatTick=tickCount;

  const before=f.hp;
  f.hp = Math.min(f.maxHp, f.hp + FOOD_HEAL);
  const healed = f.hp - before;

  f.nextAttack += EAT_COST_TK; // costs a tick

  updateHpUI(f);
  updateFoodUI(f);
  eatFx(f, healed);

  ui.status.setText((f===s.player)?`You eat (+${healed}) — Food left: ${f.food}`:`Bot eats (+${healed}) — Food left: ${f.food}`);
}

/* --------- Spec helpers --------- */
function regenSpec(f){
  if(!f.alive) return;
  f.spec = Math.min(SPEC_MAX, f.spec + SPEC_REGEN_PER_TICK);
  updateSpecUI(f);
}

/* --------- Visual FX --------- */
function swingFx(a, d, dmg){
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
  const ring=s.add.circle(f.x,f.y,12,0x4dd06d).setAlpha(0.9);
  s.tweens.add({targets:ring, radius:24, alpha:0, duration:260, onComplete:()=>ring.destroy()});
  const t=s.add.text(f.x, f.y-64, `+${healed}`, {font:'13px Arial', color:'#a9ffb6'}).setOrigin(0.5);
  s.tweens.add({targets:t, y:f.y-80, alpha:0, duration:700, onComplete:()=>t.destroy()});
}

function deathFx(f){
  s.tweens.add({targets:f.body, scale:1.35, alpha:0, duration:320});
}

/* --------- UI helpers --------- */
function updateHpUI(f){
  const barW=110;
  const r = Math.max(0, f.hp/f.maxHp);
  f.hpFill.width = barW * r;
  f.hpFill.fillColor = r>0.5 ? 0x4dd06d : (r>0.2 ? 0xf1c14e : 0xe86a6a);
  if(!f.hpText) return;
  f.hpText.setText(`${f.hp}/${f.maxHp}`);
}

function updateFoodUI(f){
  if(!f.foodTxt) return;
  f.foodTxt.setText(`Food: ${f.food}`);
  f.foodTxt.setColor(f.food>0 ? '#cfe8ff' : '#ffaaaa');
  f.foodBg.fillColor = f.food>0 ? 0x1f2a3a : 0x3a2222;
}

function updateSpecUI(f){
  const w = 110;
  const r = Math.max(0, Math.min(1, f.spec/SPEC_MAX));
  f.specFill.width = w * r;
  f.specFill.fillColor = r>0.5 ? 0x6fd1ff : (r>0.25 ? 0xf1c14e : 0xe86a6a);
  f.specTxt.setText(`Spec ${Math.round(f.spec)}%`);
}

/* --------- Weapons --------- */
function setWeapon(fighter, weapon, msg, quiet=false){
  fighter.weapon = weapon;
  if(!quiet){
    ui.status.setText(`${msg} (Speed: ${weapon.speedTicks}t, MaxHit: ${weapon.maxHit}, Spec ${weapon.specCost}%)`);
  }
}
