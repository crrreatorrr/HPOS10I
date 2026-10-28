// All story text: cutscenes, boss smack talk, mask tips, tutorial pop-ups, death captions.
// Nobu never speaks. Everyone else does.

export const SPEAKERS = {
  mask: { name: 'SPROTO MASK', portrait: 'sproto_mask', blip: 'blip' },
  bird: { name: 'MECHA BIRD', portrait: 'portrait_bird', blip: 'blip' },
  cat: { name: 'THE BIG CAT', portrait: 'portrait_cat', blip: 'blipLow' },
  cone: { name: 'THE EVIL CONE', portrait: 'portrait_cone', blip: 'blipLow' },
  narrator: { name: '', portrait: null, blip: 'blip' },
};

export const INTRO = [
  { img: 'story_intro_1', speaker: 'THE EVIL CONE', text: 'At last! My Cone of Shame Network is complete. Every dog on this island... in a CONE. Forever. MWAHAHA!' },
  { img: 'story_intro_2', speaker: '', text: 'His Broccoli Head army and the Mecha Bird swept the island. Corgis, pugs, dalmatians... one by one, coned. Zero tail wags detected.' },
  { img: 'story_intro_3', speaker: '', text: 'But in a cage at the Cone Factory, one Akita chewed through the bars. His cone? Shattered. His vibe? Immaculate.' },
  { img: 'story_intro_4', speaker: '', text: 'Nobu. The one dog who got away. The island needs a saviour dog... and he is NOT sitting this one out.' },
  { img: 'story_intro_4', speaker: 'SPROTO MASK', text: 'Yo Nobu! The name\'s Sproto. Smash blue spheres and I\'ll have your back. Let\'s go un-cone some doggos. WAGMI!' },
];

export const RESCUE = {
  1: [
    { img: 'story_rescue_1', speaker: '', text: 'The Mecha Bird is scrap! Its cargo cage bursts open and the cones go flying.' },
    { img: 'story_rescue_1', speaker: 'SPROTO MASK', text: 'Look at \'em go! Free tails, free zoomies. Next stop: Scratchpost Canyon.' },
  ],
  2: [
    { img: 'story_rescue_2', speaker: '', text: 'The Big Cat is down for the count. Dizzy. Humbled. Coughing up one last hairball.' },
    { img: 'story_rescue_2', speaker: 'SPROTO MASK', text: 'That\'s a W! Only the Cone Factory left. The big guy himself is waiting.' },
  ],
  3: [
    { img: 'story_rescue_3', speaker: 'THE EVIL CONE', text: 'No... NO! My beautiful plastic... I was supposed to be... a lampshade of POWER...' },
    { img: 'story_rescue_3', speaker: '', text: 'With the Evil Cone shattered, every cone on the island pops off at once. POP. POP. POP POP POP.' },
  ],
};

export const ENDING = [
  { img: 'story_ending', speaker: '', text: 'Every dog on the island is free. The zoomies can be heard from space.' },
  { img: 'story_ending', speaker: 'SPROTO MASK', text: 'Nobu, you absolute legend. Speech! Say something!' },
  { img: 'story_ending', speaker: '', text: 'Nobu says nothing. Nobu does a goofy little dance instead.' },
  { img: 'story_ending', speaker: 'SPROTO MASK', text: '...honestly? Iconic. THE END. (Golden Bones still waiting, if you\'re a completionist.)' },
];

export const BOSS_TALK = {
  bird: {
    intro: [
      ['bird', 'SQUAWK! A loose Akita? I\'ve got a cone in my cargo bay with your name on it!'],
      ['bird', 'Hold still, mutt. Delivery guaranteed in 30 seconds or your cone is free!'],
      ['mask', 'Wait for it to crash into the ground, then BITE or JUMP on it!'],
    ],
    phase2: [['bird', 'Lucky dodge! Try my FEATHER MISSILES. Premium shipping!']],
    phase3: [['bird', 'ENOUGH! Plan C: cones from ABOVE. Look up, doggo!']],
  },
  cat: {
    intro: [
      ['cat', 'Ohhh, look who ran all this way. You\'re cornered, little puppy.'],
      ['cat', 'The Evil Cone pays me in tuna to put that Akita in a cone. Easiest job ever.'],
      ['mask', 'When it counts 3-2-1, MOVE! If it misses the pounce, jump on its HEAD!'],
    ],
    phase2: [['cat', 'Hsssss! Lucky. Now I pounce TWICE. Cats always land on their feet.']],
    phase3: [['cat', 'MROWR! No more playing. Nine lives, puppy. How many do YOU have?']],
  },
  cone: {
    intro: [
      ['cone', 'So. The Akita who escaped. Do you know what you\'ve cost me? THREE henchmen. And a bird.'],
      ['cone', 'I am the Cone of Shame! I am inevitable! Every dog wears me eventually.'],
      ['cone', 'Now hold still while I put you in a cone. Forever.'],
      ['mask', 'He only opens up for a second after his combos. Be ready, Nobu!'],
      ['mask', 'And watch those pump.fun pills. They pump with every hop, then they DUMP. Pop them early!'],
    ],
    phase2: [['cone', 'Impossible! Fine. FASTER, then. Fresh launches! Pump it, my pills! Seize the Akita!']],
    phase3: [['cone', 'ENOUGH!!! Every pill to the moon! I will cone you, then the mask, then the MOON!']],
    death: [['cone', 'Wait wait wait... maybe we can just... share the cone?']],
  },
};

// Mask chatter before each level (tips, jokes, story updates).
export const LEVEL_INTRO = {
  1: [
    ['mask', 'Welcome to Bark Jungle! The Broccoli Heads have coned this whole park.'],
    ['mask', 'Bite with J or SHIFT. Jump with SPACE, then jump again in the air for a double jump.'],
  ],
  2: [
    ['mask', 'Scratchpost Canyon... I hear purring. Big purring. Uh oh.'],
    ['mask', 'If that giant cat shows up: RUN toward the camera. Hold DOWN. Don\'t look back. Okay, look back a LITTLE.'],
  ],
  3: [
    ['mask', 'The Cone Factory. This is where it all started, Nobu. Where YOU started.'],
    ['mask', 'Crushers, conveyors, every trick he\'s got. Breathe. Bite. Believe.'],
  ],
};

// Mask chatter after finishing a level (between levels).
export const BETWEEN = {
  1: [
    ['mask', 'Nice! Pro tip: a SLIDE + JUMP goes way farther than a normal jump. Ctrl or K, then SPACE.'],
    ['mask', 'Also: break every backpack and free every dog in a level to earn a Golden Bone. Shiny. Very shiny.'],
  ],
  2: [
    ['mask', 'You outran a cat the size of a house. Your cardio is unmatched.'],
    ['mask', 'Belly flop tip: jump, then press Ctrl or K. Smashes everything around you. Spiky stuff too.'],
    ['mask', 'Rumor says the Evil Cone gets dizzy after his combos. Hit him then, not before!'],
  ],
  3: [
    ['mask', 'It\'s over. Every cone is popped. Every dog is free. I\'m not crying, YOU\'RE crying.'],
  ],
};

export const TUTORIALS = {
  bite: { img: 'nobu_head', title: 'BITE!', text: 'Press <span class="key">J</span> or <span class="key">SHIFT</span> to bite. Chomp backpacks for Golden Tickets!' },
  jump: { img: 'nobu_title', title: 'JUMP!', text: '<span class="key">SPACE</span> to jump, again in mid-air to double jump. Hold for higher.' },
  dog: { img: 'dog_shiba_coned', title: 'TRAPPED DOG', text: 'Bite or jump near a coned dog to pop the cone off. Free them all!' },
  broccoli: { img: 'broccoli', title: 'BROCCOLI HEAD', text: 'Bite it or jump on it. Easy greens.' },
  spiky: { img: 'broccoli_spiky', title: 'SPIKY BROCCOLI', text: 'DON\'T bite this one! Jump on its head instead (or belly flop it).' },
  cone: { img: 'broccoli_cone', title: 'CONE TROOPER', text: 'Raises its cone before slamming. Bite it while it winds up!' },
  sphere: { img: 'blue_sphere', title: 'BLUE SPHERE', text: 'Break it to summon a Sproto Mask. 1 mask = 1 free hit. 3 masks = invincible!' },
  doubleJump: { img: 'nobu_title', title: 'DOUBLE JUMP', text: 'Big gap! Jump, then press <span class="key">SPACE</span> again in the air.' },
  cat: { img: 'small_cat', title: 'CAT!', text: 'Touch it and it hisses 3...2...1 then POUNCES on everything nearby. Bite it and it pounces NOW.' },
  trampoline: { img: 'trampoline', title: 'TRAMPOLINE', text: 'Bounce for big height and free tickets. Something shiny is up there...' },
  rug: { img: 'rug', title: 'RUG', text: 'See it twitching? Touching it = RUG PULL. Instant rekt. Go around!' },
  snacks: { img: 'snacks', title: 'SNACKS = CHECKPOINT', text: 'Break a snack bag to save your progress.' },
  slide: { img: 'nobu_head', title: 'SLIDE', text: 'Running? Press <span class="key">K</span> or <span class="key">CTRL</span> to slide. Slide + jump = long jump!' },
  flop: { img: 'nobu_head', title: 'BELLY FLOP', text: 'In the air, press <span class="key">K</span> or <span class="key">CTRL</span> to slam down and smash everything around you.' },
  drone: { img: 'cone_drone', title: 'CONE DRONE', text: 'Flies low over the path. Jump and bite, or jump on it.' },
  squirrel: { img: 'squirrel', title: 'NUTJOB SQUIRREL', text: 'Hops like crazy. Time your bite between hops.' },
  lint: { img: 'nobu_head', title: 'LINT ROLLER', text: 'Hit this green box to roll up EVERY rug in the level. They count as broken!' },
  vacuum: { img: 'vacuum', title: 'VACUUM BOT', text: 'Fast patroller. Every dog\'s nemesis. Bite it or bounce on it.' },
  mouse: { img: 'mouse', title: 'BANDIT MOUSE', text: 'Scurries across the path. Don\'t let it trip you up!' },
  yarn: { img: 'small_cat', title: 'YARN BALL', text: 'Rolling yarn! Jump over it or bounce off the top.' },
  pill: { img: 'pill_bot', title: 'PILL BOT', text: 'Wobbles, then TUMBLES at you! Dodge the roll, then bite it in half.' },
  conveyor: { img: 'nobu_head', title: 'CONVEYOR', text: 'Belts push you around. Fight the current!' },
  crusher: { img: 'nobu_head', title: 'CONE STAMPER', text: 'Watch the shadow. Go when it lifts!' },
};

export const DEATH_CAPTIONS = {
  angel: ['PAPER PAWS!', 'NGMI... jk, try again', 'Nobu went to the big dog park in the sky', 'Bonk. Back to the checkpoint.'],
  fall: ['Gravity: still undefeated', 'Should\'ve double jumped, ser', 'Down bad. Literally.'],
  flat: ['FLATTENED', 'Nobu is now a doormat', 'Pancake Akita, extra syrup'],
  cone: ['CONED!', 'The cone of shame claims another', 'Nobu has been put in a cone. Tragic.'],
  rug: ['RUG PULLED!', 'Rugged. Should\'ve DYOR on that carpet.', 'Liquidity removed. So was the floor.'],
  puff: ['POOF!', 'Spiky broccoli: do not bite', 'That was NOT on the diet'],
};

export const DEATH_ART = { angel: 'death_angel', fall: 'death_angel', puff: 'death_angel', flat: 'death_flat', cone: 'death_cone', rug: 'death_rug' };
