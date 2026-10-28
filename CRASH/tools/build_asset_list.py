#!/usr/bin/env python3
"""Source of truth for every Higgsfield asset: id, job, prompt, destination, processing.

Run this to regenerate tools/asset_list.json, then run tools/process_assets.py.
"""
import json
from pathlib import Path

CDN = "https://d8j0ntlcm91z4.cloudfront.net/user_3EhTMTxw0fkqxeeNVPZRAKwzj8d/"
NOBU = "<<<4c1a2f56-870c-4f6e-8be9-4948f984ed1f>>>"  # Higgsfield Element "Nobu"

STYLE_3D = ("Chunky colorful late-1990s console 3D platformer mascot style, polished PS1-era cartoon "
            "game render, smooth clay-like shapes, simple soft shading, bold saturated colors, thin black "
            "cartoon outlines.")
STYLE_SPRITE = ("Chunky colorful late-1990s console 3D platformer style, polished PS1-era cartoon game render, "
                "smooth clay-like shapes, bold saturated colors, thin black outline.")
STYLE_PANEL = ("Chunky colorful late-1990s console 3D platformer cartoon style, polished PS1-era game cutscene "
               "render, bold saturated colors.")
STYLE_BACKDROP = "Chunky colorful late-1990s console 3D platformer style, painted cartoon backdrop, bold saturated colors."
STYLE_TEX = "chunky hand-painted PS1-era platformer texture style, bold saturated colors, edges tile seamlessly."
EVIL = ("the Evil Cone, a giant sentient veterinary cone of shame villain made of glossy lavender plastic, funnel "
        "shaped with the wide rim on top, glowing red angry eyes and a sneering mouth on its front, spindly robotic "
        "arms with claw hands and a small purple cape")
WHITE_BG = "Pure white seamless background, single character only, no text."

NBP = "nano_banana_pro"
GPT = "gpt_image_2_5 (medium)"
GPT_HI = "gpt_image_2_5 (high)"

SPRITE_OPS = ["trim", "max:768", "webp:86"]
CUT_OPS = ["cutout:18", "trim", "max:900", "webp:86"]
PANEL_OPS = ["max:1600", "jpg:84"]
BG_OPS = ["max:2048", "jpg:84"]
TEX_OPS = ["size:512", "jpg:88"]

A = []


def add(id, job, ts, dest, ops, model, used_for, prompt):
    A.append({
        "id": id,
        "jobId": job,
        "url": f"{CDN}hf_{ts}_{job}.png" if ts else "",
        "dest": dest,
        "ops": ops,
        "model": model,
        "usedFor": used_for,
        "prompt": prompt,
    })


# ---- Style lock --------------------------------------------------------------------------------
add("concept_keyart", "2da490ea-713a-4327-ba84-c6a02a0f47de", "20261028_081941", "ui/concept_keyart.jpg", PANEL_OPS, NBP,
    "Style lock concept; credits backdrop",
    "Key art concept for an original 3D cartoon platformer video game. The hero Nobu, a white Akita Inu dog standing upright "
    "on two legs with lanky skinny arms and legs, an oversized head, huge expressive eyes, a goofy confident toothy grin, small "
    "triangular ears, a fluffy tail curled over his back, an orange bandana and red sneakers, leaps through the air over a "
    "tropical jungle path lined with black backpacks, glowing blue spheres and spinning golden tickets. Sad cartoon dogs wearing "
    "plastic vet cones of shame sit in the background. Looming in the stormy sky is the villain: a giant sentient veterinary cone "
    "of shame made of glossy lavender plastic, funnel shaped with the wide rim on top, glowing red angry eyes and a sneering mouth, "
    "spindly robotic arms. " + STYLE_3D + " Wide cinematic composition, no text, no logos, no watermark.")
add("concept_environments", "377e0c3f-0afe-4572-b70e-81bc199157ba", "20261028_081941", "ui/concept_environments.jpg", PANEL_OPS, NBP,
    "Style lock environment sheet",
    "Environment concept sheet for an original 3D cartoon platformer video game, three equal vertical panels: a lush tropical "
    "dog-park jungle path; a sandy orange canyon chase path at sunset with giant cardboard scratching posts and yarn balls; an evil "
    "cone factory interior with purple riveted metal, hazard stripes, conveyor belts of vet cones and glowing green vats. "
    + STYLE_3D + " No characters, no text.")

# ---- Nobu --------------------------------------------------------------------------------------
NOBU_MASTER = ("Full-body character reference of Nobu, an original cartoon video game mascot: a white Akita Inu dog who stands "
               "upright on two legs like a cartoon platformer hero. Lanky cartoon proportions with skinny long arms and legs, a big "
               "oversized head, huge expressive eyes with black pupils and thick dark eyebrows, a goofy confident toothy grin, a "
               "black nose, small triangular upright ears with pale pink insides, thick fluffy cream-white fur, a fluffy tail curled "
               "up in a loop over his back, an orange bandana tied around his neck with a small gold coin tag, red sneakers with "
               "white soles, four-fingered paw hands. Standing in a neutral front-facing A-pose, arms slightly away from the body, "
               "feet apart, full body head to toe visible and centered. " + STYLE_3D + " Pure white seamless background, single "
               "character only, no text, no props.")
add("nobu_master", "3b4b558c-8a50-4faf-91ce-baba41bf4613", "20261028_081941", "nobu/nobu_master.png", CUT_OPS, NBP,
    "Reference Element 'Nobu' source + 3D GLB input + title screen fallback", NOBU_MASTER)
add("nobu_sheet", "cbf48d27-a738-4423-935b-d059e701d4a3", "20261028_082140", "nobu/nobu_sheet.jpg", PANEL_OPS, NBP + " + Nobu element",
    "Character sheet (front, side, back); shown in the Extras/credits",
    f"Character turnaround model sheet of {NOBU}, three consistent full-body views evenly spaced in a row: front view, side "
    "profile view facing right, and back view showing his curled fluffy tail and the knot of his orange bandana. Identical "
    "character in every view, neutral standing pose, full body head to toe. " + STYLE_3D + " Pure white seamless background, "
    "no text, no labels, no extra characters.")
add("nobu_title", "f06e2219-f92c-4291-9bd1-c6b006d6d174", "20261028_082140", "nobu/nobu_title.png", CUT_OPS, NBP + " + Nobu element",
    "Title screen hero art",
    f"{NOBU} striking a cocky heroic title-screen pose: one fist pumped in the air, the other hand on his hip, winking with a "
    "huge confident toothy grin, chest puffed out, tail curled high, full body head to toe, slightly low camera angle. "
    + STYLE_3D + " " + WHITE_BG)
add("nobu_complete", "39a6b5a7-f9a5-4435-8ea0-ac561258f420", "20261028_082140", "nobu/nobu_complete.png", CUT_OPS, NBP + " + Nobu element",
    "Level complete screen",
    f"{NOBU} doing a goofy victory dance: one leg kicked up high, arms flailing happily, tongue flopping out, eyes squeezed "
    "shut with joy, holding a shiny golden ticket in one paw, full body head to toe. " + STYLE_3D + " " + WHITE_BG)
add("death_flat", "8752af1e-72c1-4cde-b41a-279089f19da9", "20261028_082140", "nobu/death_flat.png", CUT_OPS, NBP + " + Nobu element",
    "Death screen: squashed",
    f"{NOBU} comically flattened like a pancake after being squashed, lying paper-thin on the ground seen from slightly above, "
    "dizzy spiral eyes, tongue out, little yellow stars circling over his flat head, his red sneakers and orange bandana "
    "flattened too, slapstick cartoon death gag. " + STYLE_3D + " " + WHITE_BG)
add("death_angel", "06567544-0988-4cc1-ac6f-3c13fe5cd16f", "20261028_082141", "nobu/death_angel.png", CUT_OPS, NBP + " + Nobu element",
    "Death screen: fell / angel",
    f"{NOBU} as a slightly translucent ghost angel floating upward, small fluffy white feathered wings flapping on his back, a "
    "glowing golden halo over his head, eyes closed with a sheepish embarrassed grin, waving goodbye, full body, slapstick "
    "cartoon death gag. " + STYLE_3D + " " + WHITE_BG)
add("death_cone", "ad3d5b26-6414-446a-b2cd-a80fd80d508b", "20261028_082141", "nobu/death_cone.png", CUT_OPS, NBP + " + Nobu element",
    "Death screen: coned",
    f"{NOBU} stuck wearing a huge translucent plastic veterinary cone of shame around his head, sitting slumped on the ground, "
    "sad droopy puppy eyes, ears pinned down, bottom lip quivering, comically miserable, full body, slapstick cartoon death "
    "gag. " + STYLE_3D + " " + WHITE_BG)
add("death_rug", "d829ca8f-2e03-4f74-8186-70b2cedf67f2", "20261028_082533", "nobu/death_rug.png", CUT_OPS, NBP + " + Nobu element",
    "Death screen: rug pull",
    f"{NOBU} tumbling head over heels in mid-air with a shocked wide-eyed cartoon expression, because a colorful purple and gold "
    "patterned rug has just been pulled out from under his red sneakers and is flying away to the side, silly slapstick "
    "cartoon gag, full body. " + STYLE_3D + " Pure white seamless background, no text.")
add("nobu_head", "eb958386-08c5-406f-979a-7f2abe1f42e7", "20261028_082141", "nobu/nobu_head.png", CUT_OPS, NBP + " + Nobu element",
    "HUD life icon, 1UP pickup billboard",
    f"Head-only game icon of {NOBU}: front-facing head with a big goofy confident toothy grin and one eyebrow raised, cropped "
    "just below the neck so only his head and the top of his orange bandana show, centered and filling the frame. "
    + STYLE_3D + " Pure white seamless background, no text.")

# ---- Story -------------------------------------------------------------------------------------
add("story_intro_1", "cac60bab-9b2b-4971-9ac4-3005eb971eba", "20261028_082533", "story/intro_1.jpg", PANEL_OPS, NBP,
    "Intro cutscene panel 1: the Evil Cone's plan",
    "Comic book panel illustration of a cartoon villain lair: the Evil Cone, a giant living veterinary cone collar made of glossy "
    "lavender plastic, funnel shaped with the wide rim on top, with glowing red eyes, a smug grin, thin purple robot arms and a "
    "small purple cape, laughing and pointing at a huge glowing wall map of an island covered in paw-print markers, inside a purple "
    "factory with conveyor belts of plastic cones, little green broccoli-headed minions saluting him. " + STYLE_PANEL +
    " Purple and green lighting, playful. No text, no speech bubbles.")
add("story_intro_2", "b41defdf-af43-4e8c-a45d-8ce40d48a3ed", "20261028_082140", "story/intro_2.jpg", PANEL_OPS, NBP,
    "Intro cutscene panel 2: dogs getting coned",
    "Comic book panel illustration: chaos in a sunny tropical dog park as little green broccoli-headed soldier minions with angry "
    "faces fire plastic veterinary cones of shame from cone cannons at panicking cartoon dogs (a corgi, a pug, a dalmatian and a "
    "golden retriever), each dog getting stuck in a cone and looking sad, while a flying mechanical robot bird drops more cones "
    "from the sky. " + STYLE_PANEL + " Dynamic action composition. No text, no speech bubbles.")
add("story_intro_3", "f6e149e0-1f20-47ad-920f-9372c7ca4098", "20261028_082140", "story/intro_3.jpg", PANEL_OPS, NBP + " + Nobu element",
    "Intro cutscene panel 3: Nobu breaks free",
    f"Comic book panel illustration: {NOBU} breaking free inside a cage in a dark purple cone factory at night, biting clean "
    "through the metal bars with a huge chomp, a cracked plastic cone of shame shattering off his head into flying pieces, sparks "
    "everywhere, a fierce determined grin, other sad coned dogs in cages watching in awe. " + STYLE_PANEL +
    " Dramatic lighting. No text, no speech bubbles.")
add("story_intro_4", "d2c7f955-ce3a-4196-b448-ba7a4b7eed67", "20261028_082140", "story/intro_4.jpg", PANEL_OPS, NBP + " + Nobu element",
    "Intro cutscene panel 4: Nobu sets out",
    f"Comic book panel illustration: {NOBU} standing heroically on a jungle cliff edge at sunrise, seen from behind and slightly "
    "to the side, looking toward a distant ominous purple cone-shaped factory on the horizon belching smoke, wind ruffling his fur "
    "and orange bandana, cracking his knuckles with a cocky grin. " + STYLE_PANEL + " Warm golden light. No text, no speech bubbles.")
add("story_rescue_1", "de5cbce0-a0a6-4e61-a2fd-fbcd5bc7853b", "20261028_082258", "story/rescue_1.jpg", PANEL_OPS, NBP + " + Nobu element",
    "Post-boss scene after the Mecha Bird",
    f"Comic book panel illustration: {NOBU} cheering with both fists up in a jungle clearing next to a crashed, smoking purple "
    "robot bird, its cargo cage burst open as a group of happy cartoon dogs (a shiba inu, a beagle, a poodle and a husky) leap out "
    "while their plastic cones of shame pop off and fly into the air, confetti everywhere. " + STYLE_PANEL +
    " Joyful. No text, no speech bubbles.")
add("story_rescue_2", "5145ad6f-92a8-470f-ba95-4ecd08afc2cb", "20261028_082258", "story/rescue_2.jpg", PANEL_OPS, NBP + " + Nobu element",
    "Post-boss scene after the Big Cat",
    f"Comic book panel illustration: a giant chubby ginger tabby cat lies defeated on its back with dizzy spiral eyes in a sandy "
    f"canyon arena at sunset, while {NOBU} high-fives a crowd of freed cartoon dogs (a corgi, a dachshund, a pug and a border "
    "collie) whose plastic cones of shame are flying off their heads, confetti in the air. " + STYLE_PANEL +
    " Joyful. No text, no speech bubbles.")
add("story_rescue_3", "4c2b718a-0ecb-48e0-b281-755e51d8fec8", "20261028_082624", "story/rescue_3.jpg", PANEL_OPS, NBP + " + Nobu element",
    "Post-boss scene after the Evil Cone (every cone pops off)",
    "Comic book panel illustration of a cartoon victory moment: a giant lavender plastic cone-shaped cartoon villain with red eyes "
    "cracks into big harmless plastic pieces with a comically shocked face, inside a purple toy-like factory, while hundreds of "
    f"plastic vet cones pop off happy dogs and fly up into the sky like confetti, {NOBU} standing triumphant in the foreground "
    "with a huge grin. " + STYLE_PANEL + " Celebratory and playful. No text, no speech bubbles.")
add("story_ending", "2bab104b-79bc-4cfc-91e4-8e297f3fe4dc", "20261028_082258", "story/ending.jpg", PANEL_OPS, NBP + " + Nobu element",
    "Ending celebration",
    f"Comic book panel illustration: {NOBU} doing a goofy victory dance on top of a pile of broken plastic cones, one leg up and "
    "tongue out, while dozens of happy freed cartoon dogs of many breeds (shiba inus, corgis, pugs, dalmatians, huskies, poodles) "
    "celebrate around him, fireworks and confetti in a sunrise sky over a tropical island, golden tickets raining down. "
    + STYLE_PANEL + " Joyful celebration. No text, no speech bubbles.")

# ---- Characters & enemies ----------------------------------------------------------------------
TB = " Transparent background, single character, no text."
add("broccoli", "10d19a6a-c2db-450b-9e87-ad3327be1ef1", "20261028_082258", "characters/broccoli.png", SPRITE_OPS, GPT,
    "Enemy card + tutorial pop-up: Broccoli Head",
    "Video game enemy sprite, full body, front facing: a Broccoli Head foot soldier minion, a small cartoon creature whose head is "
    "a big bushy bright green broccoli floret with two angry cartoon eyes and a frowning mouth, a skinny pale green stalk body, "
    "stubby arms and legs, a tiny purple army helmet and purple boots. " + STYLE_SPRITE + TB)
add("broccoli_spiky", "36128c5c-5089-4195-b66c-d041b7176f12", "20261028_082258", "characters/broccoli_spiky.png", SPRITE_OPS, GPT,
    "Enemy card + tutorial pop-up: Spiky Broccoli",
    "Video game enemy sprite, full body, front facing: an armored Spiky Broccoli Head soldier, a menacing cartoon minion whose dark "
    "green broccoli head is covered in sharp shiny silver metal spikes, glowing red eyes, a gritted-teeth scowl, riveted purple "
    "steel chest armor and shoulder pads, stalk body, purple boots, clearly dangerous to touch. " + STYLE_SPRITE + TB)
add("broccoli_cone", "2423e1b8-e724-46ba-9aaa-c3c29514e5da", "20261028_082259", "characters/broccoli_cone.png", SPRITE_OPS, GPT,
    "Enemy card + tutorial pop-up: Cone Trooper",
    "Video game enemy sprite, full body, front facing: a Broccoli Head soldier minion with a bushy green broccoli head, mischievous "
    "grin and angry eyes, raising a translucent plastic veterinary cone of shame over his head like a weapon, ready to slam it "
    "down, skinny stalk body, purple helmet and boots. " + STYLE_SPRITE + TB)
add("mecha_bird", "90c0f629-2451-4b0d-898a-f83e5bed424f", "20261028_082259", "characters/mecha_bird.png", SPRITE_OPS, GPT,
    "Boss intro card, 3D model color reference",
    "Video game boss sprite: the Mecha Bird, a big flying robotic bird made of riveted purple and silver metal plates, jet-engine "
    "wings spread wide, a sharp yellow drill beak, a glowing red visor eye, metal talons clutching a hanging cargo cage stuffed "
    "with plastic veterinary cones of shame, menacing but cartoony, full body front three-quarter view. " + STYLE_SPRITE +
    " Transparent background, no text.")
add("big_cat", "9b2de447-ec80-4d7e-8911-e0ead0142a9e", "20261028_082258", "characters/big_cat.png", SPRITE_OPS, GPT,
    "Boss intro card, 3D model color reference",
    "Video game boss sprite: the Big Cat, a giant chubby ginger orange tabby cat with a smug evil grin, sharp fangs, narrowed "
    "glowing yellow eyes, claws out, a purple collar with a small cone-shaped tag, crouched low ready to pounce, full body front "
    "three-quarter view. " + STYLE_SPRITE + " Transparent background, no text.")
add("evil_cone", "40893f8d-53c8-4b9e-bf50-28f5abaadf7a", "20261028_082259", "characters/evil_cone.png", SPRITE_OPS, GPT,
    "Boss intro card, 3D model face texture reference",
    "Video game final boss sprite: " + EVIL + ", hovering with a faint purple glow beneath, full body, wide rim on top and narrow "
    "end at the bottom, sneering toothy mouth, three-fingered claw hands. " + STYLE_SPRITE + " Transparent background, no text.")
add("small_cat", "2ad74589-ec48-4ab4-aac7-f5e7c6234ca2", "20261028_082259", "characters/small_cat.png", SPRITE_OPS, GPT,
    "Cat hazard tutorial pop-up",
    "Video game hazard sprite: a small grumpy black-and-white tuxedo cat hissing furiously with its back arched, tail puffed up "
    "like a bottle brush, ears flat, fangs bared, claws out, full body side three-quarter view. " + STYLE_SPRITE +
    " Transparent background, single animal, no text.")
add("rug", "ab4d553f-2890-4f6d-aea9-80c1571c934a", "20261028_082258", "characters/rug.jpg", ["max:1024", "jpg:88"], GPT,
    "Rug hazard top texture (in-game) + tutorial pop-up",
    "Flat top-down view of a rectangular Persian-style rug filling the entire frame edge to edge, bold purple, crimson red and gold "
    "ornamental pattern with a central medallion, small cream tassels on the two short ends, cartoon game texture, evenly lit, no "
    "perspective, no shadows, no background visible, no text.")
add("squirrel", "3056ee6f-d770-4040-8695-8bd86f7bdedb", "20261028_082324", "characters/squirrel.png", SPRITE_OPS, GPT,
    "Enemy card: Nutjob Squirrel (level 1 hopper)",
    "Video game enemy sprite, full body: a hyperactive cartoon squirrel minion mid-hop with wild crazy eyes, big buck teeth, a huge "
    "puffy brown tail, wearing a tiny purple army helmet, arms up. " + STYLE_SPRITE + TB)
add("cone_drone", "4de7bff6-b149-427a-914b-4358167c02e3", "20261028_082325", "characters/cone_drone.png", SPRITE_OPS, GPT,
    "Enemy card: Cone Drone (flyer)",
    "Video game enemy sprite: a Cone Drone, a small hovering robot shaped like an upside-down orange-and-purple plastic cone with a "
    "spinning propeller on top, a single glowing red camera eye, and a little grabber claw dangling below, front view. "
    + STYLE_SPRITE + " Transparent background, no text.")
add("vacuum", "dc02411b-004b-485b-aa14-c4456f81c373", "20261028_082326", "characters/vacuum.png", SPRITE_OPS, GPT,
    "Enemy card: Vacuum Bot (level 3 patroller)",
    "Video game enemy sprite: a menacing round robot vacuum cleaner enemy rolling on wheels, purple and grey plastic shell, angry "
    "glowing LED eyes, a big sucking nozzle mouth with spinning brushes, front three-quarter view. " + STYLE_SPRITE +
    " Transparent background, no text.")
add("mouse", "df72ac7d-dc67-4916-acdf-dc620026d4bd", "20261028_082322", "characters/mouse.png", SPRITE_OPS, GPT,
    "Enemy card: Bandit Mouse (level 2 patroller)",
    "Video game enemy sprite, full body: a sneaky cartoon grey mouse minion running fast on two legs, wearing a tiny purple bandit "
    "eye mask, big round ears, long pink tail, mischievous grin. " + STYLE_SPRITE + TB)

DOG_CONED = ("Video game character sprite, full body, front facing: a sad cartoon {breed} dog sitting, wearing a big translucent "
             "plastic veterinary cone of shame around its head, {face}. " + STYLE_SPRITE + " Transparent background, single dog, no text.")
DOG_FREE = ("The exact same cartoon {breed} dog from the reference image, now freed with no cone at all, jumping for joy {pose}, "
            "huge happy open-mouth smile, tongue out, {extra}, full body, front facing. Same chunky late-1990s console 3D "
            "platformer style, polished PS1-era cartoon game render, bold saturated colors, thin black outline. Transparent "
            "background, single dog, no text.")
dogs = [
    ("shiba", "shiba inu", "fac4f5be-4185-4955-9909-95cdec8ce73a", "20261028_082325", "droopy teary eyes, ears down, tail limp",
     "1da67d21-19a8-4c70-a13d-e565a863bab1", "with all four paws off the ground", "ears perked up, tail wagging"),
    ("corgi", "corgi", "1a14aeb6-51c9-472a-87f7-e999723ea8b3", "20261028_082324", "droopy teary eyes, ears down",
     "964a3f6d-69c4-4e01-9adf-fd90105f8c5a", "with paws in the air", "ears perked up"),
    ("pug", "pug", "49d8fe80-eb10-43bd-8c25-75e8a1b11106", "20261028_082323", "droopy teary bulging eyes, wrinkly face",
     "0a3feb01-3696-4ee5-82d9-a547239717b1", "with paws in the air", "curly tail wagging"),
    ("dalmatian", "dalmatian", "c3f495c2-0371-41d0-9fc7-2f87f1790f7e", "20261028_082322", "droopy teary eyes, ears down",
     "275ab294-db01-4b48-bd15-75665141fd62", "with paws in the air", "ears flapping"),
]
FREE_TS = {"shiba": "20261028_082624", "corgi": "20261028_082625", "pug": "20261028_082624", "dalmatian": "20261028_082625"}
for key, breed, job, ts, face, free_job, pose, extra in dogs:
    add(f"dog_{key}_coned", job, ts, f"characters/dog_{key}_coned.png", SPRITE_OPS, GPT,
        "Trapped dog billboard (in-game)", DOG_CONED.format(breed=breed, face=face))
    add(f"dog_{key}_free", free_job, FREE_TS[key], f"characters/dog_{key}_free.png", SPRITE_OPS, GPT + " + coned sprite as reference",
        "Freed dog billboard (in-game)", DOG_FREE.format(breed=breed, pose=pose, extra=extra))

# ---- Items -------------------------------------------------------------------------------------
add("ticket", "61a4402d-7597-4943-ae1e-12c17e75afc7", "20261028_082326", "items/ticket.png", ["trim", "max:512", "webp:90"], GPT,
    "Golden Ticket collectible (in-game spinning quad) + HUD icon",
    "Video game collectible sprite: a shiny golden ticket with ornate scalloped edges and a decorative border, the text \"$Bitcoin\" "
    "printed boldly in the center in dark brown capital letters, glossy metallic gold with a small sparkle, flat front view filling "
    "the frame. Chunky colorful late-1990s console 3D platformer style, bold saturated colors, thin black outline. Transparent "
    "background, no other text.")
add("backpack", "cf4b0277-b12e-4068-920e-eac32922807a", "20261028_082324", "items/backpack.png", SPRITE_OPS, GPT,
    "Black Backpack front decal (in-game) + level complete icon",
    "Video game breakable item sprite: a chunky cartoon black backpack, zipped and stuffed full, with a front pocket, two padded "
    "shoulder straps, a top grab handle and a small round orange coin patch, front three-quarter view. " + STYLE_SPRITE +
    " Transparent background, no text.")
add("blue_sphere", "c654483d-4533-4673-bcc2-23a108a80495", "20261028_082323", "items/blue_sphere.png", SPRITE_OPS, GPT,
    "Blue Sphere glow billboard + tutorial pop-up",
    "Video game power-up sprite: a glowing magical blue sphere orb, translucent glass with swirling bright cyan light inside, soft "
    "blue glow halo around it, sparkles. Chunky colorful late-1990s console 3D platformer style, polished PS1-era cartoon game "
    "render, bold saturated colors. Transparent background, no text.")
add("trampoline", "05fb7524-0e66-4e43-87f4-2f637dd36b1b", "20261028_082324", "items/trampoline.png", SPRITE_OPS, GPT,
    "Trampoline tutorial pop-up",
    "Video game object sprite: a small round cartoon trampoline with a bouncy purple mat, a thick red padded rim with yellow "
    "stripes and short silver legs, front three-quarter view. " + STYLE_SPRITE + " Transparent background, no text.")
add("snacks", "bc4f2275-49be-420f-8701-cab381cd195a", "20261028_082349", "items/snacks.png", SPRITE_OPS, GPT,
    "Snacks checkpoint billboard (in-game)",
    "Video game checkpoint item sprite: a big paper bag of dog snacks torn open at the top with crunchy bone-shaped dog biscuits "
    "piled up and spilling out, a cartoon paw print logo on the bag, front three-quarter view. " + STYLE_SPRITE +
    " Transparent background, no text.")
add("golden_bone", "9a3ccaeb-b445-44f1-83d8-cd160e457f60", "20261028_082353", "items/golden_bone.png", SPRITE_OPS, GPT,
    "Level reward (100% breakables + dogs), level select map badge",
    "Video game reward sprite: a sparkling Golden Bone gem trophy, a dog bone shape cut from faceted gold crystal like a diamond, "
    "glowing with light rays and sparkles, front view. Chunky colorful late-1990s console 3D platformer style, polished PS1-era "
    "cartoon game render, bold saturated colors. Transparent background, no text.")

# ---- Backgrounds -------------------------------------------------------------------------------
bgs = [
    ("bg_level1", "79a3aa29-c97d-49ba-86a4-8e9b9817178c", "20261028_082347", "Level 1 skybox (Bark Jungle)",
     "a lush tropical jungle valley seen from far away, distant misty blue mountains, waterfalls, giant palm trees and ancient mossy "
     "stone ruins on the horizon, bright blue sky with big fluffy white clouds"),
    ("bg_boss1", "551d8f5f-37ba-4587-bd17-ba2000d5ec8e", "20261028_082353", "Mecha Bird arena skybox",
     "a boss arena on a jungle clifftop at dusk with a dramatic stormy orange and purple sky, a distant smoking volcano, silhouettes "
     "of palm trees, flocks of birds"),
    ("bg_level2", "27acc2e2-f6b2-471d-aadc-346f6697ae6d", "20261028_082348", "Level 2 skybox (Scratchpost Canyon)",
     "a sandy orange desert canyon at sunset, towering striped rock mesas shaped like giant cat scratching posts, warm orange and "
     "pink sky with long streaky clouds"),
    ("bg_boss2", "81e974af-f0b6-4af5-ab35-ce502d5f5172", "20261028_082348", "Big Cat arena skybox",
     "a boss arena canyon at night under a giant glowing full moon, rock formations shaped like pointy cat ears, a dramatic deep "
     "purple and indigo sky full of stars"),
    ("bg_level3", "9cfd49a4-cb67-4d4c-a664-78a953e084bc", "20261028_082348", "Level 3 backdrop (Cone Factory)",
     "the vast interior of an evil cone factory, endless purple riveted steel walls, tangled pipes, smokestacks, conveyor belts "
     "carrying plastic veterinary cones, glowing green vats, hazard stripes, dark moody industrial lighting with purple haze"),
    ("bg_boss3", "5c942ef5-1148-423e-8216-9dcbc92876da", "20261028_082353", "Evil Cone arena skybox",
     "the rooftop throne room at the very top of an evil cone factory, huge shattered windows showing a swirling purple storm with "
     "green lightning, giant cone statues, banners with a cone emblem, ominous red glow"),
]
for id_, job, ts, used, desc in bgs:
    add(id_, job, ts, f"backgrounds/{id_}.jpg", BG_OPS, GPT + " 2k 21:9", used,
        f"Wide panoramic game skybox backdrop: {desc}, horizon line in the lower third, no foreground ground. "
        + STYLE_BACKDROP + " No characters, no text.")
add("bg_title", "e82b931c-225a-416c-9053-e1b1e314ecd7", "20261028_082352", "backgrounds/bg_title.jpg", BG_OPS, GPT + " 2k",
    "Title screen backdrop",
    "Video game title screen backdrop: a tropical island at golden sunset, a giant evil purple cone-shaped factory towering on a "
    "volcano in the far distance with smoke, palm trees framing the left and right edges, a sandy beach and turquoise water in the "
    "foreground, warm vibrant sky with empty space in the upper center for a logo. " + STYLE_BACKDROP + " No characters, no text.")
add("level_map", "9fd8248b-af58-4715-9228-b8e7f37648f6", "20261028_082350", "backgrounds/level_map.jpg", BG_OPS, GPT + " 2k",
    "Level select map",
    "Illustrated overworld level select map of a cartoon tropical island seen from above at an angle, like a treasure map: a lush "
    "green jungle region in the lower left, a sandy orange canyon region in the middle, and a purple cone factory on a smoking "
    "volcano in the upper right, connected by a winding dotted trail, ocean around the island, bright saturated colors, chunky "
    "late-1990s console platformer cartoon style. No text, no labels, no characters.")

# ---- Textures ----------------------------------------------------------------------------------
texs = [
    ("tex_l1_ground", "57a179d2-7934-4669-ac67-3147e3176a75", "20261028_082414", True, "top-down",
     "lush bright green cartoon grass with tiny yellow and white flowers and a few clover patches", "Level 1 ground"),
    ("tex_l1_wall", "cfe2af11-90a9-44c6-9f67-b419e1433c14", "20261028_082414", False, "front",
     "mossy grey-green ancient jungle stone bricks with moss and small vines in the cracks", "Level 1 walls / cliff sides"),
    ("tex_l1_platform", "5b7916f4-b86e-4087-a585-7280385dc766", "20261028_082415", False, "top-down",
     "warm brown wooden planks running horizontally with nail heads and wood grain", "Level 1 platforms / bridges"),
    ("tex_l2_ground", "e393eddb-6700-489a-b495-32641bb2902d", "20261028_082413", True, "top-down",
     "warm golden-orange desert sand with soft ripples and a few small pebbles", "Level 2 ground"),
    ("tex_l2_wall", "68065ee9-8e8e-4396-a0bc-9b92ba8ff2af", "20261028_082416", True, "front",
     "layered red-orange canyon rock wall with horizontal sandstone strata and cracks", "Level 2 canyon walls"),
    ("tex_l2_platform", "6d279aa3-92d3-4d90-9d13-0130615b270d", "20261028_082415", False, "top-down",
     "corrugated tan cardboard like a cat scratching pad with shredded scratch marks", "Level 2 platforms"),
    ("tex_l3_ground", "bec4018b-1384-474b-8f0d-211af9792b4b", "20261028_082414", False, "top-down",
     "purple riveted steel factory floor plates with diamond tread pattern and bolts", "Level 3 floor"),
    ("tex_l3_wall", "c4277c3b-e4d3-4a06-8f60-9247ea2b6ee7", "20261028_082417", False, "front",
     "dark purple industrial metal wall panels with rivets, small pipes and a yellow and black hazard stripe band", "Level 3 walls"),
    ("tex_l3_platform", "b6a3b7cb-c5dd-4866-8502-7b464fe51f97", "20261028_082416", False, "top-down",
     "yellow and black diagonal hazard-striped steel grating platform surface with bolts at the corners", "Level 3 platforms"),
]
for id_, job, ts, blend, view, desc, used in texs:
    ops = ["seamless", "size:512", "jpg:88"] if blend else TEX_OPS
    add(id_, job, ts, f"textures/{id_}.jpg", ops, GPT, used,
        f"Seamless tileable game texture, flat {view} orthographic view, no perspective, no shadows, evenly lit: {desc}, " + STYLE_TEX)

# ---- UI ----------------------------------------------------------------------------------------
add("logo", "acdd1638-468d-4e8e-b1a1-d52873db153c", "20261028_082416", "ui/logo.png", ["trim", "max:1024", "webp:90"], GPT_HI,
    "Title logo",
    "Video game title logo: the word \"NOBU\" in huge chunky bubbly 3D letters with a glossy orange-to-gold gradient and a thick "
    "black outline, and directly beneath it the words \"SAVIOUR DOG\" in bold white letters on a curved purple ribbon banner, a "
    "small dog paw print and a cracked plastic cone icon as decorations, playful late-1990s console platformer game logo style. "
    "Transparent background, no other text.")
add("textbox", "ef94994c-dba9-4b54-b034-d2bad421dba0", "20261028_082415", "ui/textbox.png", ["trim", "max:1400", "webp:90"], GPT,
    "Dialogue text box frame",
    "Empty dialogue text box frame for a cartoon video game UI: a wide rounded rectangle panel with a thick glossy golden-orange "
    "border with small rivets at the corners, a deep purple semi-opaque interior with a subtle gradient, completely empty inside, "
    "chunky late-1990s console platformer UI style. Transparent background, no text, no characters.")
PORTRAIT = ("Dialogue portrait bust of the exact same {who} from the reference image: {pose}, centered and filling the frame. "
            "Same chunky late-1990s console 3D platformer style, polished PS1-era cartoon game render, bold saturated colors, "
            "thin black outline. Transparent background, no text.")
add("portrait_bird", "c3986cb2-bc3a-470c-b644-f1882c42ab4f", "20261028_082625", "ui/portrait_bird.png", SPRITE_OPS, GPT + " + boss sprite as reference",
    "Dialogue portrait: Mecha Bird", PORTRAIT.format(who="Mecha Bird robot",
    pose="head and upper body only, facing slightly to the left, squawking smugly with its drill beak open, red visor eye glaring, menacing but cartoony"))
add("portrait_cat", "ef7b2fe7-7150-42c8-a3ce-31b542c08f39", "20261028_082624", "ui/portrait_cat.png", SPRITE_OPS, GPT + " + boss sprite as reference",
    "Dialogue portrait: Big Cat", PORTRAIT.format(who="giant ginger tabby Big Cat",
    pose="head and shoulders only, facing slightly to the left, smug evil grin showing fangs, one eyebrow raised, purple collar visible"))
add("portrait_cone", "48ac0d0c-a8b2-42bb-9122-4890782853ce", "20261028_082625", "ui/portrait_cone.png", SPRITE_OPS, GPT + " + boss sprite as reference",
    "Dialogue portrait: Evil Cone", PORTRAIT.format(who="Evil Cone villain",
    pose="the upper part of the glossy lavender plastic cone with its glowing red eyes and sneering toothy mouth, one robotic claw raised dramatically, facing slightly to the left"))

# Filled in later: the Sproto Mask (needs the user's reference file) and the 3D Nobu GLB.
EXTRA = Path(__file__).with_name("asset_list_extra.json")
if EXTRA.exists():
    A.extend(json.loads(EXTRA.read_text()))

for e in A:
    if any(op.startswith("webp") for op in e["ops"]) and e["dest"].endswith(".png"):
        e["dest"] = e["dest"][:-4] + ".webp"

out = {
    "style": "Chunky, colorful late-1990s console 3D platformer mascot look (PS1 era): bold saturated colors, smooth clay-like "
             "shapes, simple soft shading, thin black outlines.",
    "nobuElement": "Higgsfield Element 'Nobu' 4c1a2f56-870c-4f6e-8be9-4948f984ed1f (from nobu_master)",
    "assets": A,
}
Path(__file__).with_name("asset_list.json").write_text(json.dumps(out, indent=2) + "\n")
print(f"{len(A)} assets")
