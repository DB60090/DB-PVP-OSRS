/* RuneScape-style PvP (offline) — minimal Phaser 3 sandbox
   - 600 ms tick engine
   - Weapon speeds in ticks + max hits
   - Player vs Bot symmetry
   - Swap weapons with 1/2/3
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
const TICK_MS = 600; // RuneScape vibe
const WEAPONS = {
  sword: {id:'sword', name:'Sword', speedTicks:6,  maxHit:50},
  dagger:{id:'dagger',name:'Dagger',speedTicks:4,  maxHit:30},
  axe:   {id:'axe',   name:'Axe',   speedTicks:8,  maxHit:70},
};

// --- Runtime state ---
let s;                    // scene
let ui={};               // texts & buttons
let tickEvent=null;      // global tick loop
let duelActive=false;

function preload(){}

function create(){
  s=this;

  // Title
  s.add.text(W/2,22,'RuneScape-Style PvP (Offline)',{font:'18px Arial',color:'#ffffff'}).setOrigin(0.5);

  // Arena line
  s.add.rectangle(W/2,H*0.52, W*0.72, 2, 0x2a3a55);

  // Create fighters
  const leftX=W*0.28, rightX=W*0.72, y=H*0.45;

  const p = makeFighter({ name:'You',   x:leftX,  y,  color:0x66ccff, outline:0x003355,  weapon:WEAPONS.sword });
  const e = makeFighter({ name:'Bot',   x:rightX, y,  color:0xff8888, outline:0x4b1b1b,  weapon:WEAPONS.dagger });

  // Store globally for convenience
  s.player=p; s.enemy=e;

  // UI: HP labels
  p.nameText = s.add.text(p.x, p.y-46, `${p.name}`, {font:'12px Arial', color:'#d6e8ff'}).setOrigin(0.5);
  e.nameText = s.add.text(e.x, e.y-46, `${e.name}`, {font:'12px Arial', color:'#ffd6d6'}).setOrigin(0.5);

  // UI: action/status
  ui.status = s.add.text(W/2, H-80, 'Press Start Duel', {font:'14px Arial', color:'#9fdcff'}).setOrigin(0.5);

  // Buttons
  ui.startBtn = button(W/2, H-44, 150, 40, 'Start Duel', ()=>startDuel());
  ui.rematchBtn = button(W/2, H-44, 150, 40, 'Rematch', ()=>rematch());
  ui.rematchBtn.setVisible(false);

  // Keyboard: quick weapon switches
  s.input.keyboard.on('keydown-ONE',  ()=>setWeapon(p, WEAPONS.sword, 'Equipped Sword'));
  s.input.keyboard.on('keydown-TWO',  ()=>setWeapon(p, WEAPONS.dagger,'Equipped Dagger'));
  s.input.keyboard.on('keydown-THREE',()=>setWeapon(p, WEAPONS.axe,   'Equipped Axe'));
  s.input.keyboard.on('keydown-R',    ()=>rematch());

  // Bot random weapon swaps every ~6–10 seconds (only during duel)
  s.time.addEvent({
    delay: Phaser.Math.Between(6000,10000),
    loop:true,
    callback: ()=>{
      if(!duelActive) return;
      const pool=[WEAPONS.sword, WEAPONS.dagger, WEAPONS.axe];
      const pick=Phaser.Utils.Array.GetRandom(pool);
      setWeapon(e, pick, `${e.name} switches to ${pick.name}`, true);
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
    alive: true
  };
  // Body
  const r=18;
  f.body = s.add.circle(f.x, f.y, r, opts.color).setStrokeStyle(3, opts.outline);
  // HP bar
  const barW=110, barH=10;
  f.hpBg   = s.add.rectangle(f.x, f.y-28, barW, barH, 0x2b2b2b).setStrokeStyle(2,0x161616).setOrigin(0.5);
  f.hpFill = s.add.rectangle(f.x-barW/2, f.y-28, barW, barH-2, 0x4dd06d).setOrigin(0,0.5);
  f.hpText = s.add.text(f.x, f.y-28, '', {font:'11px Arial', color:'#ffffff'}).setOrigin(0.5);

  updateHpUI(f);
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

/* --------- Combat control --------- */
function startDuel(){
  if(duelActive) return;
  duelActive=true;
  ui.status.setText('Fight!');
  ui.startBtn.setVisible(false);
  ui.rematchBtn.setVisible(false);

  // Reset counters so both can attack soon
  s.player.nextAttack = s.player.weapon.speedTicks;
  s.enemy.nextAttack  = s.enemy.weapon.speedTicks;

  // Start global tick
  if(tickEvent) tickEvent.remove(false);
  tickEvent = s.time.addEvent({ delay:TICK_MS, loop:true, callback: onTick });
}

function onTick(){
  if(!duelActive) return;

  const p=s.player, e=s.enemy;
  if(!p.alive || !e.alive){ stopDuel(); return; }

  p.nextAttack--;
  e.nextAttack--;

  // Player swing
  if(p.nextAttack<=0 && p.alive){
    doSwing(p, e);
    p.nextAttack = p.weapon.speedTicks;
  }

  // Enemy swing
  if(e.nextAttack<=0 && e.alive){
    doSwing(e, p);
    e.nextAttack = e.weapon.speedTicks;
  }
}

function stopDuel(){
  duelActive=false;
  if(tickEvent){ tickEvent.remove(false); tickEvent=null; }
  ui.rematchBtn.setVisible(true);
}

function rematch(){
  // Reset fighters
  const p=s.player, e=s.enemy;
  resetFighter(p);
  resetFighter(e);
  ui.status.setText('Press Start Duel');
  ui.startBtn.setVisible(true);
  ui.rematchBtn.setVisible(false);
}

function resetFighter(f){
  f.hp = f.maxHp; f.alive=true; f.nextAttack=0;
  f.body.setAlpha(1).setScale(1);
  updateHpUI(f);
}

/* --------- Swing / Damage --------- */
function doSwing(attacker, defender){
  if(!attacker.alive || !defender.alive) return;

  // Accuracy/damage model (very simple):
  // 80% chance to hit; damage 0..maxHit (0 treated as a splash/miss)
  const hitRoll = Math.random() < 0.80;
  const dmg = hitRoll ? Phaser.Math.Between(0, attacker.weapon.maxHit) : 0;

  swingFx(attacker, defender, dmg);

  if(dmg>0){
    defender.hp = Math.max(0, defender.hp - dmg);
    updateHpUI(defender);
    if(defender.hp<=0){
      defender.alive=false;
      deathFx(defender);
      ui.status.setText(`${attacker.name} wins!`);
      stopDuel();
    }
  }
}

/* --------- Visual FX --------- */
function swingFx(a, d, dmg){
  // swipe line
  const ang=Phaser.Math.Angle.Between(a.x, a.y, d.x, d.y);
  const dist=Phaser.Math.Distance.Between(a.x,a.y,d.x,d.y)-18;
  const swipe=s.add.rectangle(a.x,a.y,Math.max(8,dist),6,0x99ddff).setStrokeStyle(2,0xcfeaff)
    .setOrigin(0,0.5).setRotation(ang).setAlpha(0).setScale(0,1);
  s.tweens.add({targets:swipe,alpha:.95,scaleX:1,duration:120,ease:'quad.out',
    onComplete:()=>s.tweens.add({targets:swipe,alpha:0,duration:140,onComplete:()=>swipe.destroy()})
  });

  // attacker pop
  s.tweens.add({targets:a.body, scale:1.15, yoyo:true, duration:120});

  // defender impact + floating dmg
  const flash=s.add.circle(d.x,d.y,8, dmg>0?0xffff88:0x8888ff).setAlpha(0.9);
  s.tweens.add({targets:flash, radius:20, alpha:0, duration:220, onComplete:()=>flash.destroy()});

  const txt = s.add.text(d.x, d.y-30, dmg>0?`-${dmg}`:'0', {font:'14px Arial', color:'#ffffff'}).setOrigin(0.5);
  s.tweens.add({targets:txt, y:d.y-46, alpha:0, duration:700, onComplete:()=>txt.destroy()});
}

function deathFx(f){
  s.tweens.add({targets:f.body, scale:1.35, alpha:0, duration:320});
}

/* --------- HP/UI helpers --------- */
function updateHpUI(f){
  const barW=110;
  const r = Math.max(0, f.hp/f.maxHp);
  f.hpFill.width = barW * r;
  f.hpFill.fillColor = r>0.5 ? 0x4dd06d : (r>0.2 ? 0xf1c14e : 0xe86a6a);
  if(!f.hpText) return;
  f.hpText.setText(`${f.hp}/${f.maxHp}`);
}

/* --------- Weapons --------- */
function setWeapon(fighter, weapon, msg, quiet=false){
  fighter.weapon = weapon;
  if(!quiet){
    ui.status.setText(`${msg} (Speed: ${weapon.speedTicks}t, MaxHit: ${weapon.maxHit})`);
  }
}
