# Lyra cinematic site

Static site, no build step. ES modules need HTTP: `npx serve siteweb-cinema`.

## Architecture

```
index.html            markup: room (SVG), two device rigs (laptop, phone), the single app #screen, overlays
data.js               generated site content for the menu pages (from siteweb/index.html)
css/
  base.css            tokens, stage, room animations
  laptop.css          laptop 3D (lid, base, keyboard)
  handheld.css        phone + tablet 3D (body, island/lens, camera), portrait + landscape
  screen.css          the Lyra app UI, device-agnostic, sized in em
  pages.css           menu + detail pages inside the app
  hands.css           opening hand + typing hands (shared)
  overlays.css        hero, dots, CTA, legal, paper sheet
js/
  main.js             bootstrap + scroll loop: scroll -> p -> phases -> modules
  timeline.js         scroll budget (in vh) and p -> named phases (pure, linear)
  chapters.js         chapter plans: virtual timeline of typing/answer/ticket/hold (pure)
  story.js            chapters, tabs, networks (pure data)
  scene.js            room ornaments, cover fit, moon/clouds
  chat.js             conversation as a pure function of the scroll (scrubbed, reversible)
  pages.js            interactive menu + detail pages
  overlay.js          hero, hint, dots, CTA, legal, paper
  devices/
    index.js          picks the device from the viewport, moves #screen into it
    laptop.js         Device implementation
    handheld.js       factory shared by phone and tablet (3D body, hands, pose)
    phone.js          phone spec (sizes, font, camera island)
    tablet.js         tablet spec (4:3 screen, thin bezel, lens)
```

The story is told on ONE `#screen`. `devices/index.js` moves it into the laptop lid or the phone
front when the viewport changes (rotate the phone and the device rotates too, chat state is kept).
A device implements: `mount, layout, pose, keyPress, setTyping, show` (see devices/index.js).

## Device choice (`modeFor`)
- portrait viewport: phone if narrower than 600px, tablet otherwise
- touch + landscape: phone if <= 520px tall, tablet if <= 900px tall
- otherwise: laptop

## Debug
`?p=0.4` freezes the scroll progress, `?device=tablet-landscape` forces a device (laptop, phone-portrait, phone-landscape, tablet-portrait, tablet-landscape), `?open=defi` opens a tab.

## Scroll
The scroll is linear: every scroll distance moves the story. Each chapter gets a scroll length proportional to its
conversation length (`VH_PER_SECOND` in timeline.js), so typing/answering runs at a constant speed per scroll and
scrolling back un-types. Tune the whole page length with the constants at the top of `js/timeline.js`.
