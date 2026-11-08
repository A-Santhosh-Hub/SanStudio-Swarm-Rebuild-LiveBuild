/*
 * SanStudio LiveBuild - Developed by SanStudio (https://a-santhosh-hub.github.io/in/)
 *
 * A fresh visit opens on a blank canvas and a swarm of multiplayer-style cursors
 * rebuilds this page on it: boxes dragged out with a crosshair, typed text, pen-tool
 * lines, ruler guides with snapping and alt-drag duplicates. Scrolling reveals more
 * work. When the page is finished, "Go live" fades the canvas into the real site.
 *
 * The real page keeps running underneath a single overlay, so skipping or finishing
 * only removes the overlay. To take LiveBuild out, delete the two SANSTUDIO LIVEBUILD
 * blocks from this file.
 */
(() => {
  'use strict';

  // Decided by the LiveBuild snippet in <head>.
  if (!window.__liveBuildPlay) return;
  window.__liveBuildMounted = true;

  const phone = innerWidth < 700;
  const SETTINGS = {
    maxCurtainMs: 9000,           // longest we wait for a site's own preloader to lift
    captureDeadlineMs: 4000,      // never wait longer than this for slow images
    minAgents: phone ? 5 : 8,
    maxAgents: phone ? 20 : 48,
    introAgents: phone ? 10 : 18,
    flockAgents: phone ? 14 : 36,
    maxLayers: 4000,
  };
  const SEEN_KEY = 'livebuild-seen';
  const CREDIT_URL = 'https://a-santhosh-hub.github.io/in/';

  const AGENT_NAMES = [
    'React', 'Blender', 'Figma', 'Java', 'Python', 'HTML', 'CSS', 'Node', 'Git', 'Spring',
    'Tailwind', 'Three', 'Vue', 'Docker', 'Linux', 'Mongo', 'MySQL', 'Bootstrap', 'jQuery',
    'Photoshop', 'GSAP', 'Redux', 'Express', 'Vite',
  ];
  const AGENT_COLORS = [
    '#ff007f', '#0ce3e9', '#ff7700', '#a259ff', '#ffcc00', '#0acf83',
    '#d946ef', '#36c5f0', '#ff5c8a', '#84cc16', '#f97316', '#22d3ee',
  ];
  const SELECT = '#0D99FF';
  const GUIDE = '#FF2D6F';
  const RULER = 20;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const round1 = (n) => Math.round(n * 10) / 10;
  const smooth = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(2 - 2 * t, 3) / 2);
  const decel = (t) => 1 - Math.pow(1 - t, 3);
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const nextFrame = () => new Promise((done) => { requestAnimationFrame(done); setTimeout(done, 120); });
  const touch = (layer) => { layer.ver++; };

  // Where the page scrolls. Usually the window; some sites scroll one big inner element.
  // x and y convert between screen and canvas coordinates: canvas = screen + (x, y).
  const view = {
    el: null, x: 0, y: 0, scrollTop: 0, top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0,
    detect() {
      this.el = null;
      const page = document.scrollingElement || document.documentElement;
      if (page.scrollHeight <= innerHeight + 4) {
        let bestArea = 0;
        const all = document.body.getElementsByTagName('*');
        for (let i = 0; i < all.length && i < 20000; i++) {
          const el = all[i];
          if (el.scrollHeight <= el.clientHeight + 40 || el.clientHeight < innerHeight * 0.4) continue;
          if (!/auto|scroll|overlay/.test(getComputedStyle(el).overflowY)) continue;
          const r = el.getBoundingClientRect();
          if (r.width > innerWidth * 0.35 && r.width * r.height > bestArea) {
            bestArea = r.width * r.height;
            this.el = el;
          }
        }
      }
      this.measure();
    },
    measure() {
      if (this.el) {
        const r = this.el.getBoundingClientRect();
        this.top = r.top + this.el.clientTop;
        this.left = r.left + this.el.clientLeft;
        this.width = this.el.clientWidth;
        this.height = this.el.clientHeight;
      } else {
        this.top = 0;
        this.left = 0;
        this.width = document.documentElement.clientWidth;
        this.height = innerHeight;
      }
      this.bottom = this.top + this.height;
      this.right = this.left + this.width;
      this.sync();
    },
    sync() {
      if (this.el) {
        this.scrollTop = this.el.scrollTop;
        this.x = this.el.scrollLeft - this.left;
        this.y = this.scrollTop - this.top;
      } else {
        this.scrollTop = window.scrollY;
        this.x = window.scrollX;
        this.y = this.scrollTop;
      }
    },
    scrollTo(top, left = 0) {
      (this.el || window).scrollTo({ top, left, behavior: 'instant' });
      this.sync();
    },
    scrollBy(top) {
      (this.el || window).scrollBy({ top, behavior: 'instant' });
      this.sync();
    },
    contentWidth() {
      return this.el ? this.el.scrollWidth : document.documentElement.scrollWidth;
    },
    contentHeight() {
      return this.el ? this.el.scrollHeight : Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    },
    maxScroll() {
      return this.contentHeight() - this.height;
    },
  };

  // ------------------------------------------------------------ cursor art

  const POINTER = 'M4 3 L21.6 10.5 L13.3 13.2 L10.5 21.6 Z';
  const HOTSPOT = {
    pointer: [4, 3], clone: [4, 3], pen: [3, 3], 'pen-plus': [3, 3],
    cross: [12, 12], beam: [12, 12], ew: [12, 12], ns: [12, 12],
  };
  const OUTLINE = 'stroke="#fff" stroke-width="1.5" stroke-linejoin="round"';

  function cursorArt(shape, color) {
    if (shape === 'pointer') return `<path d="${POINTER}" fill="${color}" ${OUTLINE}/>`;
    if (shape === 'clone') {
      return `<path d="${POINTER}" transform="translate(4 4)" fill="#fff" stroke="${color}" stroke-width="1.3" stroke-linejoin="round"/>` +
        `<path d="${POINTER}" fill="${color}" ${OUTLINE}/>`;
    }
    if (shape === 'pen' || shape === 'pen-plus') {
      const nib = `<path d="M3 3 L13.5 6.2 L17.6 10.6 L10.6 17.6 L6.2 13.5 Z" fill="${color}" ${OUTLINE}/>` +
        `<path d="M18.2 11.2 L21.2 14.2 L14.2 21.2 L11.2 18.2 Z" fill="${color}" ${OUTLINE}/>` +
        `<path d="M3.6 3.6 L9.4 9.4" stroke="#fff" stroke-width="1.1"/>`;
      if (shape === 'pen') return nib;
      return nib + `<path d="M23 19.5 V26.5 M19.5 23 H26.5" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>` +
        `<path d="M23 19.5 V26.5 M19.5 23 H26.5" stroke="#1E1E1E" stroke-width="1.3" stroke-linecap="round"/>`;
    }
    if (shape === 'cross' || shape === 'beam') {
      const d = shape === 'cross' ? 'M12 3.5 V20.5 M3.5 12 H20.5' : 'M8.5 4.5 H15.5 M12 4.5 V19.5 M8.5 19.5 H15.5';
      return `<g fill="none" stroke-linecap="round"><path d="${d}" stroke="#fff" stroke-width="3.6"/>` +
        `<path d="${d}" stroke="${color}" stroke-width="1.5"/></g>`;
    }
    const spin = shape === 'ns' ? ' transform="rotate(90 12 12)"' : '';
    return `<path d="M2.5 12 L7 7.5 V10.4 H17 V7.5 L21.5 12 L17 16.5 V13.6 H7 V16.5 Z"${spin} fill="${color}" ${OUTLINE}/>`;
  }

  const PICTURE_ICON = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="#8a8a8a" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M4 18 L10 13 L14 16 L17 13.5 L21 17"/></svg>';

  // --------------------------------------------------------- style copying

  const eachSide = (make) => ['top', 'right', 'bottom', 'left'].map(make);
  const BORDER_PROPS = [
    ...eachSide((s) => `border-${s}-width`), ...eachSide((s) => `border-${s}-style`), ...eachSide((s) => `border-${s}-color`),
    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  ];
  const BACKGROUND_PROPS = [
    'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat',
    'background-origin', 'background-clip', '-webkit-background-clip',
  ];
  const TEXT_PROPS = [
    'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch', 'font-variant', 'font-feature-settings',
    'line-height', 'letter-spacing', 'word-spacing', 'text-transform', 'text-align', 'text-indent', 'text-decoration-line',
    'text-decoration-color', 'text-decoration-style', 'text-shadow', 'white-space', 'word-break', 'overflow-wrap', 'direction',
    '-webkit-text-fill-color', '-webkit-text-stroke-width', '-webkit-text-stroke-color', 'list-style-type', 'list-style-position',
    '-webkit-font-smoothing',
  ];
  const INNER_PROPS = [
    ...TEXT_PROPS, ...BORDER_PROPS, ...BACKGROUND_PROPS,
    ...eachSide((s) => `padding-${s}`), ...eachSide((s) => `margin-${s}`),
    'display', 'box-sizing', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'box-shadow', 'opacity',
    'vertical-align', 'position', 'top', 'right', 'bottom', 'left', 'flex-direction', 'flex-wrap', 'align-items',
    'justify-content', 'gap', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-self', 'object-fit', 'object-position',
    'overflow-x', 'overflow-y', 'text-overflow', 'visibility', 'transform', 'filter', 'float', 'z-index',
  ];
  const BOX_PROPS = [...BACKGROUND_PROPS, ...BORDER_PROPS, 'box-shadow', 'backdrop-filter', '-webkit-backdrop-filter', 'filter', 'clip-path'];
  const SVG_OUTER_PROPS = [
    ...eachSide((s) => `margin-${s}`), 'vertical-align', 'display', 'position', 'top', 'right', 'bottom', 'left',
    'transform', 'transform-origin', 'flex-shrink', 'flex-grow', 'align-self', 'overflow',
  ];
  const SVG_PROPS = [
    'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset',
    'fill-opacity', 'stroke-opacity', 'fill-rule', 'clip-rule', 'opacity', 'color', 'display', 'stop-color', 'stop-opacity',
    'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline',
  ];

  const copyStyle = (cs, props) => {
    let css = '';
    for (const p of props) {
      const v = cs.getPropertyValue(p);
      if (v !== '') css += `${p}:${v};`;
    }
    return css;
  };

  function alphaOf(color) {
    if (!color || color === 'transparent') return 0;
    const m = color.match(/rgba?\(([^)]+)\)/);
    if (!m) return 1;
    const parts = m[1].split(/[,/\s]+/).filter(Boolean);
    return parts.length > 3 ? parseFloat(parts[3]) : 1;
  }
  const sameColor = (a, b) => (a || '').replace(/\s/g, '') === (b || '').replace(/\s/g, '');

  function looksBoxy(style) {
    if (alphaOf(style.backgroundColor) > 0.02) return true;
    if (style.backgroundImage && style.backgroundImage !== 'none') return true;
    if (style.boxShadow && style.boxShadow !== 'none') return true;
    return eachSide((s) => parseFloat(style.getPropertyValue(`border-${s}-width`)) > 0).some(Boolean);
  }

  const gradientText = (cs) => (cs.webkitBackgroundClip || cs.backgroundClip) === 'text';
  const glyphOf = (el, which) => {
    const m = getComputedStyle(el, which).content.match(/^"((?:[^"\\]|\\.)*)"$/);
    return m ? m[1].replace(/\\(.)/g, '$1') : '';
  };

  // ::before / ::after become real spans inside text clones (icon fonts rely on this).
  function pseudoSpan(el, which) {
    const ps = getComputedStyle(el, which);
    if (!ps.content || ps.content === 'none' || ps.content === 'normal' || ps.display === 'none') return null;
    const span = document.createElement('span');
    span.textContent = glyphOf(el, which);
    span.setAttribute('style', copyStyle(ps, INNER_PROPS));
    return span;
  }

  function addPseudos(src, dst) {
    const before = pseudoSpan(src, '::before');
    if (before) dst.insertBefore(before, dst.firstChild);
    const after = pseudoSpan(src, '::after');
    if (after) dst.appendChild(after);
  }

  // Clones are built in a document with no custom-element registry, so a site's components never run on them.
  let inertDoc = null;
  const inertClone = (el) => {
    if (!inertDoc) inertDoc = document.implementation.createHTMLDocument('');
    return inertDoc.importNode(el, true);
  };
  const DROPPED_IN_CLONES = new Set(['script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed', 'audio', 'video', 'canvas']);

  function dressClone(src, dst) {
    const tag = src.localName;
    const cs = getComputedStyle(src);
    if (cs.display === 'none' || DROPPED_IN_CLONES.has(tag)) {
      dst.remove();
      return null;
    }
    const isSvg = src instanceof SVGElement;
    let style = copyStyle(cs, isSvg ? SVG_PROPS : INNER_PROPS);
    if (tag === 'svg' && !src.ownerSVGElement) {
      const r = src.getBoundingClientRect();
      dst.setAttribute('width', r.width);
      dst.setAttribute('height', r.height);
      style += copyStyle(cs, SVG_OUTER_PROPS);
    }
    dst.setAttribute('style', style);
    for (const attr of [...dst.attributes]) {
      const name = attr.name;
      if (name.startsWith('on') || (name === 'id' && !isSvg) || ['tabindex', 'data-aos', 'contenteditable', 'autofocus', 'srcset', 'sizes', 'loading'].includes(name)) {
        dst.removeAttribute(name);
      }
    }
    if (tag === 'img') dst.setAttribute('src', src.currentSrc || src.src || '');
    let node = dst;
    if (!isSvg && tag.includes('-')) {
      node = document.createElement('span');
      node.setAttribute('style', style);
      while (dst.firstChild) node.appendChild(dst.firstChild);
      dst.replaceWith(node);
    }
    if (!isSvg && tag !== 'img') addPseudos(src, node);
    return node;
  }

  // A shadow root can't see the page's <symbol> or gradient ids, so copy what a clone refers to.
  function inlineSvgRefs(root) {
    const within = (selector) => [...(root.matches && root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)];
    for (const use of within('use')) {
      const href = use.getAttribute('href') || use.getAttribute('xlink:href');
      const target = href && href[0] === '#' ? document.getElementById(href.slice(1)) : null;
      if (!target) continue;
      const symbol = target.localName === 'symbol';
      const group = document.createElementNS(SVG_NS, symbol ? 'svg' : 'g');
      if (symbol) {
        for (const a of ['viewBox', 'preserveAspectRatio']) if (target.getAttribute(a)) group.setAttribute(a, target.getAttribute(a));
        group.setAttribute('width', use.getAttribute('width') || '100%');
        group.setAttribute('height', use.getAttribute('height') || '100%');
        group.setAttribute('overflow', 'visible');
      }
      if (use.getAttribute('style')) group.setAttribute('style', use.getAttribute('style'));
      // Plain copies: a symbol's content takes its colour from where it is used, not from the hidden sprite.
      for (const kid of target.childNodes) group.appendChild(inertClone(kid));
      use.replaceWith(group);
    }
    for (const svg of within('svg')) {
      const ids = new Set([...svg.outerHTML.matchAll(/url\(\s*["']?#([^"')\s]+)/g)].map((m) => m[1]));
      let defs = null;
      for (const id of ids) {
        if (svg.querySelector(`[id="${CSS.escape(id)}"]`)) continue;
        const ref = document.getElementById(id);
        if (!ref) continue;
        if (!defs) {
          defs = document.createElementNS(SVG_NS, 'defs');
          svg.insertBefore(defs, svg.firstChild);
        }
        defs.appendChild(inertClone(ref));
      }
    }
  }

  function dressedClone(src) {
    const dst = inertClone(src);
    const from = [src, ...src.querySelectorAll('*')];
    const to = [dst, ...dst.querySelectorAll('*')];
    let root = dst;
    from.forEach((node, i) => {
      const made = dressClone(node, to[i]);
      if (i === 0 && made) root = made;
    });
    inlineSvgRefs(root);
    return root;
  }

  const kidsOf = (el) => {
    if (el.shadowRoot) return [...el.shadowRoot.childNodes];
    if (el.localName === 'slot') {
      const assigned = el.assignedNodes({ flatten: true });
      if (assigned.length) return assigned;
    }
    return [...el.childNodes];
  };

  // The background the page paints behind everything, read where it will settle (themes often fade).
  function pageBackground() {
    const read = (el, from) => {
      const inline = el.style.transition;
      el.style.transition = 'none';
      const cs = getComputedStyle(el);
      const value = {
        from, color: cs.backgroundColor, image: cs.backgroundImage, size: cs.backgroundSize,
        position: cs.backgroundPosition, repeat: cs.backgroundRepeat, attachment: cs.backgroundAttachment,
      };
      el.style.transition = inline;
      return value;
    };
    const paints = (bg) => alphaOf(bg.color) > 0.01 || bg.image !== 'none';
    const html = read(document.documentElement, 'html');
    if (paints(html)) return html;
    const body = read(document.body, 'body');
    if (paints(body)) return body;
    const dark = /dark/.test(getComputedStyle(document.documentElement).colorScheme) && matchMedia('(prefers-color-scheme: dark)').matches;
    return { from: null, color: dark ? 'rgb(18, 18, 18)' : 'rgb(255, 255, 255)', image: 'none' };
  }

  // ------------------------------------------------------------- blueprint

  const IGNORED = new Set(['script', 'style', 'noscript', 'template', 'head', 'meta', 'link', 'title', 'base', 'datalist', 'map', 'source', 'track', 'param']);
  const MEDIA_TAGS = new Set(['img', 'svg', 'picture', 'canvas', 'video', 'model-viewer', 'iframe', 'embed', 'object']);
  const FIELD_TAGS = new Set(['input', 'textarea', 'select']);

  /** Read the live page into a list of layers plus the work needed to redraw them. */
  function takeBlueprint(host, curtain) {
    const root = document.documentElement;
    const body = document.body;
    view.sync();
    const sx = view.x;
    const sy = view.y;
    const vw = view.width;
    const vh = view.height;
    const docW = Math.max(view.contentWidth(), vw);
    const docH = Math.min(Math.max(view.contentHeight(), vh), 40000);
    const backdrop = pageBackground();
    const pageColor = backdrop.color;
    let portKey = null;
    const layers = [];
    const treeRoots = [];
    let seq = 0;

    const styles = new Map();
    const css = (el) => {
      let cs = styles.get(el);
      if (!cs) { cs = getComputedStyle(el); styles.set(el, cs); }
      return cs;
    };

    const NO_CLIP = { l: -1e9, t: -1e9, r: 1e9, b: 1e9, rad: 0, none: true };
    const SCREEN = { l: 0, t: 0, r: innerWidth, b: innerHeight, rad: 0, none: true };
    const overlaps = (r, c) => r.right > c.l && r.left < c.r && r.bottom > c.t && r.top < c.b;
    const toPlane = (r, plane) => (plane === 'page'
      ? { x: r.left + sx, y: r.top + sy, w: r.width, h: r.height }
      : { x: r.left, y: r.top, w: r.width, h: r.height });
    const clipToPlane = (c, plane) => {
      if (c.none) return null;
      return plane === 'page' ? { l: c.l + sx, t: c.t + sy, r: c.r + sx, b: c.b + sy, rad: c.rad } : { ...c };
    };
    const onCanvas = (b, plane) => (plane === 'page'
      ? b.x + b.w > 0 && b.x < docW && b.y + b.h > 0 && b.y < docH
      : b.x + b.w > 0 && b.x < innerWidth && b.y + b.h > 0 && b.y < innerHeight);

    const addLayer = (props) => {
      const layer = {
        id: layers.length, ver: 1, painted: 0, shown: false, dx: 0, dy: 0, zoom: 1, borrowed: false,
        draft: null, styled: false, done: false, ...props,
      };
      layers.push(layer);
      return layer;
    };

    // ---- layer makers

    function addLine(points, color, width, dash, ctx, key) {
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      return addLayer({
        kind: 'line', x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
        points, color, width, dash, placed: 0, plane: ctx.plane, key, alpha: ctx.alpha, clip: null, parent: ctx.box, sig: points.length + color,
      });
    }

    function addBox(tag, cs, rect, ctx, key) {
      const bg = cs.backgroundColor;
      const image = cs.backgroundImage;
      if (gradientText(cs)) return null;
      const paintsBg = (alphaOf(bg) > 0.01 && !sameColor(bg, pageColor)) || image !== 'none';
      const edges = eachSide((side) => {
        const width = parseFloat(cs.getPropertyValue(`border-${side}-width`)) || 0;
        const style = cs.getPropertyValue(`border-${side}-style`);
        const color = cs.getPropertyValue(`border-${side}-color`);
        return width > 0 && style !== 'none' && style !== 'hidden' && alphaOf(color) > 0.02 ? { side, width, style, color } : null;
      });
      const edgeCount = edges.filter(Boolean).length;
      const shadow = cs.boxShadow !== 'none';
      const backdrop = cs.backdropFilter && cs.backdropFilter !== 'none';
      const b = toPlane(rect, ctx.plane);

      if (tag === 'hr') {
        const color = edges[0] ? edges[0].color : alphaOf(bg) > 0.01 ? bg : 'rgb(120,120,120)';
        addLine([{ x: b.x, y: b.y + b.h / 2 }, { x: b.x + b.w, y: b.y + b.h / 2 }], color, clamp(b.h, 1, 2), null, ctx, key);
        return null;
      }
      if (!paintsBg && !shadow && !backdrop) {
        if (edgeCount === 0) return null;
        if (edgeCount < 4) {
          for (const e of edges) {
            if (!e) continue;
            const half = e.width / 2;
            const pts = {
              top: [{ x: b.x, y: b.y + half }, { x: b.x + b.w, y: b.y + half }],
              bottom: [{ x: b.x, y: b.y + b.h - half }, { x: b.x + b.w, y: b.y + b.h - half }],
              left: [{ x: b.x + half, y: b.y }, { x: b.x + half, y: b.y + b.h }],
              right: [{ x: b.x + b.w - half, y: b.y }, { x: b.x + b.w - half, y: b.y + b.h }],
            }[e.side];
            const dash = e.style === 'dashed' ? `${e.width * 3} ${e.width * 2}` : e.style === 'dotted' ? `${e.width} ${e.width * 1.5}` : null;
            addLine(pts, e.color, e.width, dash, ctx, key);
          }
          return null;
        }
      }
      const style = copyStyle(cs, BOX_PROPS);
      return addLayer({
        kind: 'box', ...b, big: b.w * b.h > vw * vh * 0.4, css: style, radius: cs.borderRadius,
        plane: ctx.plane, key, alpha: ctx.alpha, clip: clipToPlane(ctx.clip, ctx.plane), parent: ctx.box, sig: style,
      });
    }

    function addPseudoBox(el, cs, rect, ctx, which, ownKey) {
      const ps = getComputedStyle(el, which);
      if (!ps.content || ps.content === 'none' || ps.content === 'normal' || ps.display === 'none' || ps.visibility !== 'visible') return;
      if (ps.position !== 'absolute' || (cs.position === 'static' && cs.transform === 'none')) return;
      if (glyphOf(el, which)) return;
      const alpha = ctx.alpha * parseFloat(ps.opacity);
      if (!(alpha > 0.03)) return;
      const n = (v) => parseFloat(v) || 0;
      const contentBox = ps.boxSizing !== 'border-box';
      const w = n(ps.width) + (contentBox ? n(ps.paddingLeft) + n(ps.paddingRight) + n(ps.borderLeftWidth) + n(ps.borderRightWidth) : 0);
      const h = n(ps.height) + (contentBox ? n(ps.paddingTop) + n(ps.paddingBottom) + n(ps.borderTopWidth) + n(ps.borderBottomWidth) : 0);
      if (!(w > 0 && h > 0)) return;
      let left = rect.left + n(cs.borderLeftWidth) + n(ps.left);
      let top = rect.top + n(cs.borderTopWidth) + n(ps.top);
      const m = ps.transform.match(/^matrix\(([^)]+)\)$/);
      if (m) {
        const k = m[1].split(',').map(Number);
        left += k[4];
        top += k[5];
      }
      const fake = { left, top, right: left + w, bottom: top + h, width: w, height: h };
      // A negative z-index paints behind the element's content, just above its own background.
      const behind = parseInt(ps.zIndex, 10) < 0;
      const key = behind ? ownKey + (which === '::before' ? 0.25 : 0.5) : ctx.nextKey();
      if (overlaps(fake, ctx.clip)) addBox('pseudo', ps, fake, { ...ctx, alpha }, key);
    }

    function textRootStyle(cs, isRun) {
      let style = copyStyle(cs, TEXT_PROPS);
      if (gradientText(cs)) style += copyStyle(cs, BACKGROUND_PROPS);
      const common = 'margin:0;box-sizing:border-box;width:100%;height:100%;position:relative;isolation:isolate;';
      if (isRun) return `${style}display:block;padding:0;${common}`;
      const pad = (side) => (parseFloat(cs.getPropertyValue(`padding-${side}`)) || 0) + (parseFloat(cs.getPropertyValue(`border-${side}-width`)) || 0);
      let display = 'block';
      if (cs.display.includes('flex')) {
        display = 'flex';
        style += copyStyle(cs, ['flex-direction', 'flex-wrap', 'align-items', 'justify-content', 'align-content', 'row-gap', 'column-gap']);
      } else if (cs.display.includes('grid')) {
        display = 'grid';
        style += copyStyle(cs, ['grid-template-columns', 'grid-template-rows', 'grid-auto-flow', 'align-items', 'justify-items', 'justify-content', 'align-content', 'row-gap', 'column-gap']);
      } else if (cs.display === 'list-item' || cs.display === '-webkit-box') display = cs.display;
      if (cs.textOverflow === 'ellipsis' || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none')) {
        style += copyStyle(cs, ['overflow-x', 'overflow-y', 'text-overflow', '-webkit-line-clamp', '-webkit-box-orient']);
      }
      return `${style}display:${display};padding:${pad('top')}px ${pad('right')}px ${pad('bottom')}px ${pad('left')}px;${common}`;
    }

    const lineHeightOf = (cs) => {
      const v = parseFloat(cs.lineHeight);
      return Number.isNaN(v) ? (parseFloat(cs.fontSize) || 16) * 1.2 : v;
    };

    function addText(base, content, textBox, cs) {
      // The typewriter line is mid-animation whenever we look at it: build its first full word.
      const typed = content.querySelector && content.querySelector('.typewriter-text');
      if (typed && typeof texts !== 'undefined' && Array.isArray(texts) && texts[0]) {
        typed.textContent = texts[0];
        textBox = { ...textBox, w: base.w };
      }
      const plain = content.textContent.replace(/\s+/g, ' ').trim();
      return addLayer({
        kind: 'text', ...base, tb: textBox, source: content, size: parseFloat(cs.fontSize) || 16, lh: lineHeightOf(cs),
        align: cs.textAlign, text: plain, sig: plain,
      });
    }

    function addLeaf(el, cs, rect, ctx, key) {
      const content = document.createElement('div');
      content.setAttribute('style', textRootStyle(cs, false));
      const copy = inertClone(el);
      const from = [...el.querySelectorAll('*')];
      const to = [...copy.querySelectorAll('*')];
      from.forEach((node, i) => dressClone(node, to[i]));
      inlineSvgRefs(copy);
      while (copy.firstChild) content.appendChild(copy.firstChild);
      addPseudos(el, content);
      const range = document.createRange();
      range.selectNodeContents(el);
      const inner = range.getBoundingClientRect();
      const box = toPlane(rect, ctx.plane);
      if (inner.height && inner.height < lineHeightOf(cs) * 1.6 && !cs.display.includes('flex')) content.style.whiteSpace = 'nowrap';
      const tb = inner.width > 0 && inner.height > 0 ? toPlane(inner, ctx.plane) : { ...box };
      tb.x = clamp(tb.x, box.x - 4, box.x + box.w);
      tb.y = clamp(tb.y, box.y - 4, box.y + box.h);
      addText({ ...box, plane: ctx.plane, key, alpha: ctx.alpha, clip: clipToPlane(ctx.clip, ctx.plane), parent: ctx.box }, content, tb, cs);
    }

    function addRun(cs, nodes, ctx) {
      const range = document.createRange();
      range.setStartBefore(nodes[0]);
      range.setEndAfter(nodes[nodes.length - 1]);
      const r = range.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || !overlaps(r, ctx.clip)) return;
      const box = toPlane(r, ctx.plane);
      if (!onCanvas(box, ctx.plane)) return;
      box.w += 1;
      const content = document.createElement('div');
      content.setAttribute('style', textRootStyle(cs, true));
      if (r.height < lineHeightOf(cs) * 1.6) content.style.whiteSpace = 'nowrap';
      for (const n of nodes) content.appendChild(n.nodeType === 3 ? document.createTextNode(n.data) : dressedClone(n));
      addText({ ...box, plane: ctx.plane, key: ctx.nextKey(), alpha: ctx.alpha, clip: clipToPlane(ctx.clip, ctx.plane), parent: ctx.box }, content, { ...box }, cs);
    }

    function stand_in(label) {
      const box = document.createElement('div');
      box.setAttribute('style', 'display:flex;align-items:center;justify-content:center;background:var(--ph);color:#777;font:500 12px/1.2 system-ui,sans-serif;');
      box.textContent = label;
      return box;
    }

    function addMedia(el, cs, rect, ctx, key) {
      const tag = el.localName;
      const fit = `object-fit:${cs.objectFit};object-position:${cs.objectPosition};display:block;`;
      let media = null;
      let sig = tag;
      let live = null;
      const source = tag === 'picture' ? el.querySelector('img') : el;
      if (!source) return;
      if (source.localName === 'img') {
        const url = source.currentSrc || source.src;
        if (!url) return;
        media = new Image();
        media.src = url;
        media.draggable = false;
        media.setAttribute('style', fit);
        sig = url;
      } else if (tag === 'svg') {
        media = dressedClone(el);
        media.setAttribute('width', '100%');
        media.setAttribute('height', '100%');
        media.style.display = 'block';
        media.style.margin = '0';
        media.style.position = 'static';
        // The box we draw already includes any transform: keep only a pure rotation or flip.
        const m = cs.transform.match(/^matrix\(([^)]+)\)$/);
        const k = m ? m[1].split(',').map(Number) : null;
        const rigid = k && Math.abs(Math.hypot(k[0], k[1]) - 1) < 0.02 && Math.abs(Math.hypot(k[2], k[3]) - 1) < 0.02;
        media.style.transform = rigid ? `matrix(${k[0]},${k[1]},${k[2]},${k[3]},0,0)` : 'none';
        media.style.transformOrigin = '50% 50%';
        sig = media.outerHTML.slice(0, 200);
      } else if (tag === 'model-viewer') {
        // A WebGL canvas can't be cloned: show a still frame, taken when an agent gets here.
        media = new Image();
        media.setAttribute('style', 'display:block;object-fit:contain;');
        live = el;
      } else if (tag === 'canvas') {
        try {
          media = new Image();
          media.src = el.toDataURL();
          media.setAttribute('style', fit);
        } catch (_) {
          media = stand_in('');
        }
      } else if (tag === 'video') {
        const urls = [el.currentSrc, el.getAttribute('src'), ...[...el.querySelectorAll('source')].map((c) => c.getAttribute('src'))];
        const url = urls.find((u) => u && !/^(blob|mediasource):/i.test(u));
        if (url) {
          media = document.createElement('video');
          media.setAttribute('src', new URL(url, location.href).href);
          for (const a of ['muted', 'playsinline', 'loop']) media.setAttribute(a, '');
          if (!el.paused || el.autoplay) media.setAttribute('data-play', '');
          if (el.poster) media.setAttribute('poster', el.poster);
          media.setAttribute('style', fit);
          sig = url;
        } else if (el.poster) {
          media = new Image();
          media.src = el.poster;
          media.setAttribute('style', fit);
          sig = el.poster;
        } else media = stand_in('video');
      } else {
        let label = 'embed';
        try {
          label = new URL(el.src || el.data || '', location.href).hostname.replace(/^www\./, '') || label;
        } catch (_) { /* keep the generic label */ }
        media = stand_in(label);
        sig = label;
      }
      const b = toPlane(rect, ctx.plane);
      addLayer({
        kind: 'media', ...b, media, live, radius: cs.borderRadius, shadow: cs.boxShadow !== 'none' ? cs.boxShadow : '',
        fill: alphaOf(cs.backgroundColor) > 0.01 ? cs.backgroundColor : '', frame: copyStyle(cs, BORDER_PROPS.slice(0, 12)),
        plane: ctx.plane, key, alpha: ctx.alpha, clip: clipToPlane(ctx.clip, ctx.plane), parent: ctx.box, sig,
      });
    }

    function addField(el, cs, rect, ctx, key) {
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (type === 'hidden') return;
      if (type === 'checkbox' || type === 'radio') {
        const accent = cs.accentColor && cs.accentColor !== 'auto' ? cs.accentColor : '#0B6CFF';
        const on = el.checked;
        const mark = document.createElementNS(SVG_NS, 'svg');
        mark.setAttribute('viewBox', '0 0 16 16');
        mark.setAttribute('width', '100%');
        mark.setAttribute('height', '100%');
        mark.innerHTML = type === 'radio'
          ? `<circle cx="8" cy="8" r="7" fill="#fff" stroke="${on ? accent : '#767676'}" stroke-width="1.2"/>${on ? `<circle cx="8" cy="8" r="4" fill="${accent}"/>` : ''}`
          : `<rect x="1" y="1" width="14" height="14" rx="2.5" fill="${on ? accent : '#fff'}" stroke="${on ? accent : '#767676'}" stroke-width="1.2"/>${on ? '<path d="M4.2 8.3 L7 11 L12 5.4" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' : ''}`;
        addLayer({
          kind: 'media', ...toPlane(rect, ctx.plane), media: mark, live: null, radius: '0px', shadow: '', fill: '', frame: '',
          plane: ctx.plane, key, alpha: ctx.alpha, clip: null, parent: ctx.box, sig: type + on,
        });
        return;
      }
      const box = addBox(el.localName, cs, rect, ctx, key);
      const usesButtonText = ['submit', 'button', 'reset'].includes(type);
      let text = el.localName === 'select'
        ? (el.selectedOptions[0] && el.selectedOptions[0].text) || ''
        : type === 'password' ? '•'.repeat(el.value.length) : el.value || '';
      let isPlaceholder = false;
      if (!text && el.placeholder) { text = el.placeholder; isPlaceholder = true; }
      if (!text.trim()) return;
      const pad = (side) => (parseFloat(cs.getPropertyValue(`padding-${side}`)) || 0) + (parseFloat(cs.getPropertyValue(`border-${side}-width`)) || 0);
      let style = copyStyle(cs, TEXT_PROPS) + `padding:${pad('top')}px ${pad('right')}px ${pad('bottom')}px ${pad('left')}px;margin:0;box-sizing:border-box;width:100%;height:100%;overflow:hidden;`;
      style += el.localName === 'textarea' ? 'display:block;white-space:pre-wrap;' : `display:flex;align-items:center;white-space:pre;${usesButtonText ? 'justify-content:center;' : ''}`;
      if (isPlaceholder) {
        const color = getComputedStyle(el, '::placeholder').color;
        style += `color:${color};-webkit-text-fill-color:${color};`;
      }
      const content = document.createElement('div');
      content.setAttribute('style', style);
      content.textContent = text;
      const b = toPlane(rect, ctx.plane);
      addText({ ...b, plane: ctx.plane, key: key + 0.5, alpha: ctx.alpha, clip: clipToPlane(ctx.clip, ctx.plane), parent: box || ctx.box }, content, { ...b }, cs);
    }

    // ---- page walk

    function flowsInline(el) {
      if (el.shadowRoot) return false;
      for (const kid of el.children) {
        const tag = kid.localName;
        if (IGNORED.has(tag) || tag === 'br' || tag === 'wbr' || kid instanceof SVGElement) continue;
        const d = css(kid).display;
        if (d === 'none') continue;
        if (d === 'inline') {
          if (!flowsInline(kid)) return false;
        } else if (!d.startsWith('inline')) return false;
      }
      return true;
    }

    function visit(el, ctx, treeParent) {
      if (layers.length >= SETTINGS.maxLayers) return;
      const tag = el.localName;
      if (IGNORED.has(tag) || el === host || el === curtain) return;
      const cs = css(el);
      if (cs.display === 'none') return;
      if (cs.display === 'contents') {
        for (const kid of kidsOf(el)) if (kid.nodeType === 1) visit(kid, ctx, treeParent);
        return;
      }
      const alpha = ctx.alpha * parseFloat(cs.opacity);
      if (!(alpha > 0.03)) return;
      const rect = el.getBoundingClientRect();

      let { plane, clip, stackTop, lifted } = ctx;
      if (cs.position === 'fixed' && plane !== 'fixed') {
        plane = 'fixed';
        clip = SCREEN;
      } else if (cs.position === 'sticky' && plane === 'page') {
        // Stuck to the top of the scroller, or sitting exactly where it will stick.
        const stick = parseFloat(cs.top);
        if (!Number.isNaN(stick) && Math.abs(rect.top - view.top - stick) < 2 && rect.height < vh * 0.4) {
          plane = 'fixed';
          clip = SCREEN;
        }
      }
      const parentEl = el.parentElement;
      const stackable = cs.position !== 'static' || (parentEl && /flex|grid/.test(css(parentEl).display));
      if (stackable) {
        if (cs.zIndex !== 'auto') {
          if (stackTop == null) stackTop = parseInt(cs.zIndex, 10) || 0;
        } else if (cs.position !== 'static') lifted = true;
      }
      const nextKey = () => (stackTop || 0) * 1e7 + (lifted ? 5e6 : 0) + seq++;

      const visible = cs.visibility === 'visible';
      const sized = rect.width >= 1 && rect.height >= 1;
      const paintable = visible && sized && overlaps(rect, clip) && onCanvas(toPlane(rect, plane), plane);
      const node = { tag, cls: el.getAttribute('class') || '', plane, start: layers.length, end: layers.length, kids: [], box: toPlane(rect, plane) };
      (treeParent ? treeParent.kids : treeRoots).push(node);
      const here = { alpha, plane, clip, stackTop, lifted, box: ctx.box, nextKey };

      if (MEDIA_TAGS.has(tag) || FIELD_TAGS.has(tag)) {
        if (paintable) (FIELD_TAGS.has(tag) ? addField : addMedia)(el, cs, rect, here, nextKey());
        node.end = layers.length;
        return;
      }

      let parentBox = ctx.box;
      const ownKey = nextKey();
      if (paintable && el !== root && !(el === body && backdrop.from === 'body')) {
        const made = addBox(tag, cs, rect, here, ownKey);
        if (made) parentBox = made;
      }

      let innerClip = clip;
      if (el !== root && el !== body && el !== view.el && (cs.overflowX !== 'visible' || cs.overflowY !== 'visible')) {
        const n = (v) => parseFloat(v) || 0;
        const area = {
          l: Math.max(clip.l, rect.left + n(cs.borderLeftWidth)), t: Math.max(clip.t, rect.top + n(cs.borderTopWidth)),
          r: Math.min(clip.r, rect.right - n(cs.borderRightWidth)), b: Math.min(clip.b, rect.bottom - n(cs.borderBottomWidth)),
        };
        if (area.r <= area.l || area.b <= area.t) {
          node.end = layers.length;
          return;
        }
        const raw = cs.borderTopLeftRadius;
        const rad = raw.includes('%') ? (parseFloat(raw) / 100) * Math.min(rect.width, rect.height) : parseFloat(raw) || 0;
        innerClip = { ...area, rad };
      }
      const isScroller = el === view.el;
      if (isScroller) portKey = nextKey();
      const inner = { alpha, plane: isScroller ? 'page' : plane, clip: isScroller ? NO_CLIP : innerClip, stackTop, lifted, box: parentBox, nextKey };

      const kids = kidsOf(el);
      const directText = kids.some((n) => n.nodeType === 3 && /\S/.test(n.data));
      let anyText = directText;
      let allInline = !el.shadowRoot;
      const kinds = kids.map((n) => {
        if (n.nodeType === 3) return 1;
        if (n.nodeType !== 1 || IGNORED.has(n.localName)) return 0;
        const d = css(n).display;
        if (d === 'none') return 0;
        const t = n.localName;
        let inline = false;
        if (n.shadowRoot || t === 'slot') inline = false;
        else if (t === 'br' || t === 'wbr') inline = true;
        else if (MEDIA_TAGS.has(t) || FIELD_TAGS.has(t)) inline = directText && d.startsWith('inline');
        else if (d === 'inline') inline = flowsInline(n);
        else if (directText && d.startsWith('inline')) inline = true;
        if (inline && /\S/.test(n.textContent)) anyText = true;
        if (!inline) allInline = false;
        return inline ? 1 : 2;
      });
      if (!anyText && allInline && (glyphOf(el, '::before') || glyphOf(el, '::after'))) anyText = true;

      if (allInline && anyText && !isScroller) {
        if (paintable) addLeaf(el, cs, rect, inner, nextKey());
        node.end = layers.length;
        return;
      }

      if (paintable) addPseudoBox(el, cs, rect, { ...inner, plane, clip }, '::before', ownKey);
      let run = [];
      const flush = () => {
        if (!run.length) return;
        if (run.some((n) => /\S/.test(n.nodeType === 3 ? n.data : n.textContent))) {
          if (visible) addRun(cs, run, inner);
        } else {
          for (const n of run) if (n.nodeType === 1) visit(n, inner, node);
        }
        run = [];
      };
      kids.forEach((n, i) => {
        if (kinds[i] === 1) run.push(n);
        else if (kinds[i] === 2) {
          flush();
          visit(n, inner, node);
        }
      });
      flush();
      if (paintable) addPseudoBox(el, cs, rect, { ...inner, plane, clip }, '::after', ownKey);
      node.end = layers.length;
    }

    visit(root, { alpha: 1, plane: view.el ? 'fixed' : 'page', clip: view.el ? SCREEN : NO_CLIP, stackTop: null, lifted: false, box: null }, null);

    // ---- repeated components become alt-drag duplicates

    const groups = [];
    const kindsIn = (node) => {
      let s = '';
      for (let i = node.start; i < node.end; i++) s += layers[i].kind[0];
      return s;
    };
    const alike = (a, b, loose) => a.w > 0 && b.w > 0 && a.h > 0 && b.h > 0 &&
      a.h / b.h < 1.8 && b.h / a.h < 1.8 && (loose || (a.w / b.w < 1.6 && b.w / a.w < 1.6));

    (function findGroups(list, insideCopy) {
      for (const node of list) {
        if (insideCopy) continue;
        const buckets = new Map();
        for (const kid of node.kids) {
          const count = kid.end - kid.start;
          if (count < 1 || count > 48) continue;
          if (count === 1 && layers[kid.start].kind === 'text' && layers[kid.start].text.length > 40) continue;
          const sig = `${kid.tag}|${kid.cls}|${kid.plane}|${kindsIn(kid)}`;
          if (!buckets.has(sig)) buckets.set(sig, []);
          buckets.get(sig).push(kid);
        }
        const copies = new Set();
        for (const bucket of buckets.values()) {
          if (bucket.length < 2) continue;
          const first = bucket[0];
          const loose = first.end - first.start === 1 && layers[first.start].kind === 'text';
          const members = bucket.filter((k) => alike(k.box, first.box, loose));
          if (members.length < 2) continue;
          const group = { master: members[0], copies: members.slice(1) };
          groups.push(group);
          for (const copy of group.copies) copies.add(copy);
        }
        for (const kid of node.kids) findGroups([kid], copies.has(kid));
      }
    })(treeRoots, false);

    for (const group of groups) {
      for (const copy of group.copies) {
        for (let i = copy.start; i < copy.end; i++) {
          const layer = layers[i];
          if (layer.twin) continue;
          layer.twin = layers[group.master.start + (i - copy.start)];
          layer.group = group;
        }
      }
    }

    // ---- work list

    const jobs = [];
    const addJob = (y, spec, needs, plane) => {
      const job = { id: jobs.length, y, spec, needs, state: 'waiting', finishedAt: 0, plane };
      jobs.push(job);
      return job;
    };
    const topOf = (layer) => (layer.kind === 'text' ? layer.tb.y : layer.y);

    for (const layer of layers) {
      if (layer.twin) continue;
      const needs = layer.parent && layer.parent.finishes ? layer.parent.finishes : [];
      layer.job = addJob(topOf(layer), { type: layer.kind, layer }, needs, layer.plane);
      layer.finishes = [layer.job];
    }
    for (let i = groups.length - 1; i >= 0; i--) {
      const group = groups[i];
      const masterLayers = layers.slice(group.master.start, group.master.end);
      const masterDone = [];
      for (const layer of masterLayers) if (layer.finishes) masterDone.push(...layer.finishes);
      const firstParent = masterLayers[0] && masterLayers[0].parent;
      if (firstParent && firstParent.finishes) masterDone.push(...firstParent.finishes);
      group.source = { layers: masterLayers, box: group.master.box };
      group.targets = group.copies.map((copy, index) => {
        const members = layers.slice(copy.start, copy.end).filter((l) => l.group === group);
        const job = addJob(Math.min(...members.map(topOf)), { type: 'clone', group, index }, masterDone, copy.plane);
        for (const layer of members) {
          layer.cloneJob = job;
          layer.finishes = [job];
          if (layer.sig !== layer.twin.sig && layer.kind !== 'line') {
            const type = layer.kind === 'text' ? 'retype' : 'reskin';
            layer.followUp = addJob(topOf(layer), { type, layer }, [job], layer.plane);
            layer.finishes = [job, layer.followUp];
          }
        }
        return { layers: members, box: copy.box, job };
      });
    }

    // ---- ruler guides: left edges and baselines several texts in a region share

    const guides = [];
    const BAND = 900;
    const bands = new Map();
    for (const layer of layers) {
      if (layer.kind !== 'text' || !layer.job || layer.plane !== 'page' || layer.size < 13 || layer.tb.w <= 30) continue;
      const band = Math.floor(layer.tb.y / BAND);
      if (!bands.has(band)) bands.set(band, []);
      bands.get(band).push(layer);
    }
    const tally = (list, read) => {
      const seen = new Map();
      for (const layer of list) {
        const at = Math.round(read(layer));
        if (!seen.has(at)) seen.set(at, []);
        seen.get(at).push(layer);
      }
      let best = null;
      for (const [at, members] of seen) if (members.length >= 2 && (!best || members.length > best[1].length)) best = [at, members];
      return best;
    };
    for (const band of [...bands.keys()].sort((a, b) => a - b)) {
      if (guides.length >= 18) break;
      const list = bands.get(band);
      const column = tally(list, (l) => l.tb.x);
      if (column) {
        const top = Math.min(...column[1].map((l) => l.tb.y));
        const members = column[1].filter((l) => l.tb.y < top + 450).sort((a, b) => b.size - a.size).slice(0, 2);
        const guide = { axis: 'x', pos: column[0], at: column[0], fade: 1, flash: 0, dragging: false, shown: false, needs: members.map((l) => l.job) };
        guide.job = addJob(Math.min(...members.map((l) => l.tb.y)) - 30, { type: 'guide', guide }, [], 'page');
        for (const layer of members) layer.job.spec.snapTo = guide;
        guides.push(guide);
      }
      const row = tally(list, (l) => l.tb.y);
      const rowLayer = row && row[1].find((l) => !l.job.spec.snapTo);
      if (rowLayer) {
        const guide = { axis: 'y', pos: row[0], at: row[0], fade: 1, flash: 0, dragging: false, shown: false, needs: [rowLayer.job] };
        guide.job = addJob(row[0] - 30, { type: 'guide', guide }, [], 'page');
        rowLayer.job.spec.snapTo = guide;
        guides.push(guide);
      }
    }
    for (const layer of layers) if (layer.kind === 'text' && layer.job && layer.size >= 28 && layer.tb.h < 400) layer.job.spec.grow = true;

    // A parent has to exist as soon as anything that sits on it comes into view.
    for (const job of jobs) job.gate = job.y;
    for (let i = jobs.length - 1; i >= 0; i--) {
      for (const need of jobs[i].needs) if (jobs[i].gate < need.gate) need.gate = jobs[i].gate;
    }

    return { layers, jobs, groups, guides, docW, docH, portKey };
  }

  // ------------------------------------------------------------ text typing

  function prepareTyping(layer) {
    const live = layer.source.cloneNode(true);
    const units = [];
    const boxes = [];
    let all = '';
    (function scan(parent, wrapper) {
      for (const n of [...parent.childNodes]) {
        if (n.nodeType === 3) {
          const s = n.data.replace(/[\t\n\r ]+/g, ' ');
          if (!s.length) { n.remove(); continue; }
          units.push({ node: n, s, len: s.length, wrapper });
          all += s;
        } else if (n.nodeType === 1) {
          const tag = n.localName;
          if (tag === 'img' || tag === 'svg' || (!/\S/.test(n.textContent) && n.style && looksBoxy(n.style))) {
            units.push({ el: n, len: 1, wrapper });
            all += '#';
          } else {
            const own = n.style && looksBoxy(n.style) ? n : wrapper;
            if (own === n) boxes.push(n);
            scan(n, own);
          }
        }
      }
    })(live, null);
    for (const u of units) {
      if (u.node) u.node.data = '';
      else u.el.style.visibility = 'hidden';
    }
    for (const b of boxes) { b.style.visibility = 'hidden'; b.__on = false; }
    layer.live = live;
    layer.units = units;
    layer.chars = all;
    layer.total = all.length;
    layer.typed = 0;
    layer.typedPainted = -1;
  }

  function paintTyped(layer, count) {
    let left = count;
    let lastNode = null;
    for (const u of layer.units) {
      const take = clamp(left, 0, u.len);
      left -= take;
      if (u.node) {
        const want = take === u.len ? u.s : u.s.slice(0, take);
        if (u.node.data !== want) u.node.data = want;
        if (take) lastNode = u.node;
      } else {
        u.el.style.visibility = take ? '' : 'hidden';
        if (take) lastNode = u.el;
      }
      if (take && u.wrapper && u.wrapper.__on === false) {
        for (let b = u.wrapper; b && b !== layer.live; b = b.parentNode) {
          if (b.__on === false) { b.style.visibility = ''; b.__on = true; }
        }
      }
    }
    return lastNode;
  }

  // ------------------------------------------------------------------ sound

  /** Small synth, off until the visitor asks for it: placed pieces ring a pentatonic scale. */
  class Chime {
    constructor() {
      this.on = false;
      this.ctx = null;
      this.bpm = 96;
      this.lastSlot = -1;
      this.voices = 0;
    }

    toggle() {
      this.on = !this.on;
      if (this.on && !this.ctx) this.build();
      if (this.ctx) {
        if (this.on) this.ctx.resume().catch(() => {});
        this.out.gain.setTargetAtTime(this.on ? 0.9 : 0, this.ctx.currentTime, 0.04);
      }
    }

    build() {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) { this.on = false; return; }
      const ctx = (this.ctx = new AudioCtx());
      this.out = ctx.createGain();
      this.out.gain.value = 0.9;
      const limiter = ctx.createDynamicsCompressor();
      this.out.connect(limiter);
      limiter.connect(ctx.destination);
      const room = ctx.createConvolver();
      const length = Math.floor(ctx.sampleRate * 2.4);
      const tail = ctx.createBuffer(2, length, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = tail.getChannelData(ch);
        for (let i = 0; i < length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3) * 0.5;
      }
      room.buffer = tail;
      const wet = ctx.createGain();
      wet.gain.value = 0.35;
      room.connect(wet);
      wet.connect(this.out);
      this.room = room;
      const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const n = noise.getChannelData(0);
      for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
      this.noise = noise;
      this.start = ctx.currentTime;
    }

    live() { return this.on && this.ctx && this.ctx.state === 'running'; }

    pan(x) { return clamp((x / Math.max(1, innerWidth)) * 1.6 - 0.8, -0.8, 0.8); }

    note(midi, when, level, pan, ring) {
      if (this.voices > 22) return;
      this.voices++;
      const { ctx } = this;
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      panner.connect(this.out);
      panner.connect(this.room);
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      let last;
      for (const [ratio, amount, decay] of [[1, 1, 1], [2, 0.32, 0.5], [3.01, 0.1, 0.3]]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq * ratio;
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(level * amount, when + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0005, when + ring * decay);
        osc.connect(gain);
        gain.connect(panner);
        osc.start(when);
        osc.stop(when + ring * decay + 0.05);
        last = osc;
      }
      last.onended = () => { this.voices--; panner.disconnect(); };
    }

    tick(x, freq, level, length) {
      if (!this.live()) return;
      const { ctx } = this;
      const when = ctx.currentTime + 0.003;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = freq;
      band.Q.value = 2.5;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(level, when);
      gain.gain.exponentialRampToValueAtTime(0.0004, when + length);
      const panner = ctx.createStereoPanner();
      panner.pan.value = this.pan(x);
      src.connect(band);
      band.connect(gain);
      gain.connect(panner);
      panner.connect(this.out);
      src.start(when, Math.random() * 0.8);
      src.stop(when + length + 0.02);
    }

    key(x) { this.tick(x, rand(1400, 3800), 0.09, rand(0.012, 0.03)); }
    press(x) { this.tick(x, rand(2000, 2800), 0.16, 0.014); }
    snap(x) { this.tick(x, 4200, 0.22, 0.02); }

    placed(x, screenW, area) {
      if (!this.live()) return;
      const step = 60 / this.bpm / 2;
      const slot = Math.ceil((this.ctx.currentTime + 0.015 - this.start) / step);
      if (slot === this.lastSlot) return;
      this.lastSlot = slot;
      const octave = area > 0.08 ? 1 : area > 0.015 ? 2 : area > 0.002 ? 3 : 4;
      const degree = [0, 2, 4, 7, 9][Math.floor(clamp(x / Math.max(1, screenW), 0, 0.999) * 5)];
      this.note(38 + octave * 12 + degree, this.start + slot * step, 0.09, this.pan(x), octave <= 1 ? 3 : 1.8);
    }

    finale() {
      if (!this.live()) return;
      const when = this.ctx.currentTime + 0.05;
      [38, 45, 50, 54, 57, 62, 66, 69, 74].forEach((m, i) => this.note(m, when + i * 0.04, 0.12, -0.6 + (i / 9) * 1.2, 4.5));
    }

    close() {
      if (!this.ctx) return;
      const { ctx } = this;
      this.out.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
      setTimeout(() => ctx.close().catch(() => {}), 1400);
    }
  }

  // ------------------------------------------------------------------ stage

  const STAGE_CSS = `
:host{all:initial}
*{box-sizing:border-box}
.blank,.page,.pinned,.badges,.cursors,.rulers{position:absolute;inset:0;pointer-events:none}
.blank{transition:opacity .5s ease}
.blank.wipe{opacity:0}
.page,.pinned,.badges,.cursors{overflow:hidden}
.world{position:absolute;left:0;top:0;will-change:transform}
.it{position:absolute;left:0;top:0;transform-origin:0 0}
.it.settle{transition:transform .3s cubic-bezier(.2,.8,.2,1)}
.box{background-color:var(--ph);transition:background-color .22s ease,border-radius .22s ease}
.box.styled{background-color:transparent}
.box>.skin{position:absolute;inset:0;opacity:0;transition:opacity .22s ease}
.box.styled>.skin{opacity:1}
.pic{background-color:var(--ph);overflow:hidden}
.pic>.ic{position:absolute;left:50%;top:50%;width:22px;height:22px;transform:translate(-50%,-50%);opacity:.7;transition:opacity .2s}
.pic>.shot{position:absolute;inset:0;width:100%;height:100%;opacity:0;clip-path:inset(0 0 100% 0);transition:opacity .35s ease,clip-path .6s cubic-bezier(.2,.75,.2,1)}
.pic.styled{background-color:transparent;transition:background-color .3s ease .3s}
.pic.styled>.ic{opacity:0}
.pic.styled>.shot{opacity:1;clip-path:inset(0 0 0 0)}
.pic>.shot.swap{animation:swap .45s ease}
@keyframes swap{from{opacity:0;filter:blur(6px)}}
.pic>.frame{position:absolute;inset:0}
.ln svg{position:absolute;left:0;top:0;overflow:visible}
.caret{display:inline-block;width:1.5px;height:1.1em;margin-left:1px;margin-right:-2.5px;vertical-align:text-bottom;background:currentColor;animation:blink 1s steps(1) infinite}
@keyframes blink{50%{opacity:0}}
.all-selected{background-color:rgba(13,153,255,.28)!important}
.marks{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.badge{position:absolute;transform:translate(-50%);padding:1px 4px;border-radius:2px;color:#fff;font:600 11px/16px var(--ui-font,system-ui),sans-serif;white-space:nowrap;font-variant-numeric:tabular-nums}
.cursor{position:absolute;left:0;top:0;will-change:transform}
.cursor svg{position:absolute;overflow:visible;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.35))}
.ruler{position:absolute;background:#2c2c2c}
.ruler svg{display:block}
.ruler-x{top:0;left:0;right:0;height:20px;border-bottom:1px solid #3a3a3a}
.ruler-y{top:0;left:0;bottom:0;width:20px;border-right:1px solid #3a3a3a}
.ruler-corner{position:absolute;top:0;left:0;width:20px;height:20px;background:#2c2c2c}
.num{font:500 9px var(--ui-font,system-ui),sans-serif;fill:#8c8c8c}
.num.sel{fill:${SELECT}}
.logo{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(.92);opacity:0;transition:opacity .35s ease,transform .45s cubic-bezier(.2,.8,.2,1);pointer-events:none}
.logo.on{opacity:1;transform:translate(-50%,-50%)}
.logo.gone{opacity:0;transform:translate(-50%,-50%) scale(.9)}
.logo img{display:block;width:64px;height:64px;object-fit:cover;filter:grayscale(1);opacity:.5;border-radius:16px}
.mono{width:64px;height:64px;border-radius:16px;background:var(--ph);color:#fff;font:700 30px/64px var(--ui-font,system-ui),sans-serif;text-align:center}
.hud{position:absolute;left:50%;bottom:20px;transform:translate(-50%,18px);opacity:0;display:flex;align-items:center;justify-content:center;gap:10px;padding:6px 6px 6px 10px;max-width:calc(100% - 16px);background:rgba(30,30,30,.94);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);color:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.28),inset 0 0 0 1px rgba(255,255,255,.07);font:500 12px/1 var(--ui-font,system-ui),sans-serif;transition:opacity .45s ease,transform .45s cubic-bezier(.2,.8,.2,1);white-space:nowrap;user-select:none;-webkit-user-select:none;pointer-events:auto}
.hud.on{opacity:1;transform:translate(-50%,0)}
.dots{display:flex;padding-left:5px}
.dots:empty{display:none}
.dots i{display:block;width:18px;height:18px;margin-left:-5px;border-radius:50%;border:2px solid #1e1e1e;font:700 9px/14px var(--ui-font,system-ui),sans-serif;text-align:center;color:#fff}
.status{display:flex;align-items:center;gap:7px;color:#cfcfcf;font-variant-numeric:tabular-nums}
.status b{color:#fff;font-weight:600}
.sep{width:1px;height:12px;background:#444}
.bar{width:64px;height:3px;border-radius:2px;background:#3a3a3a;overflow:hidden;flex:none}
.bar i{display:block;height:100%;width:0;background:${SELECT};transition:width .35s ease}
button{all:unset;box-sizing:border-box;cursor:pointer;padding:7px 10px;border-radius:8px;background:#2c2c2c;color:#fff;font:500 12px/1 var(--ui-font,system-ui),sans-serif;transition:background .15s}
button:hover{background:#3a3a3a}
button:focus-visible{outline:2px solid ${SELECT};outline-offset:1px}
button[hidden]{display:none}
.go{background:${SELECT}}
.go:hover{background:#2aa6ff}
.touring{background:rgba(13,153,255,.22);color:#8fd0ff}
.nudge{animation:nudge 1.6s ease-in-out infinite}
@keyframes nudge{50%{box-shadow:0 0 0 4px rgba(13,153,255,.28)}}
.quiet{color:#aaa}
.snd{display:flex;align-items:center;padding:6px 8px}
.snd.off{color:#8a8a8a}
.credit{color:#9a9a9a;font-size:11px;text-decoration:none;padding:0 6px;white-space:nowrap}
.credit:hover{color:#fff;text-decoration:underline}
.credit:focus-visible{outline:2px solid ${SELECT};outline-offset:2px;border-radius:4px}
@media (max-width:640px){
  .hud{flex-wrap:wrap;bottom:10px;gap:6px 8px;padding:6px;width:calc(100% - 16px);white-space:normal}
  .status{flex:1 1 100%;justify-content:center;padding:3px 0}
  .bar{flex:1 1 100%;width:auto}
  .dots{display:none}
  .credit{flex:1 1 100%;text-align:center;padding:1px 0 2px}
}
`;

  class Stage {
    constructor(backdrop, firstRun, zIndex) {
      const host = (this.host = document.createElement('div'));
      host.id = 'livebuild-host';
      // Under the site's preloader when it has one, so the preloader lifts to reveal the blank canvas.
      host.style.cssText = `all:initial !important;position:fixed !important;inset:0 !important;z-index:${zIndex} !important;display:block !important;contain:strict !important;opacity:1;transition:opacity .6s ease;`;
      const shadow = (this.shadow = host.attachShadow({ mode: 'open' }));
      shadow.innerHTML = `<style>${STAGE_CSS}</style>
<div class="blank${firstRun ? '' : ' wipe'}" aria-hidden="true"></div>
<div class="page" aria-hidden="true"><div class="world"></div></div>
<div class="pinned" aria-hidden="true"></div>
<div class="logo" aria-hidden="true"></div>
<div class="rulers" aria-hidden="true"></div>
<svg class="marks" aria-hidden="true"></svg>
<div class="badges" aria-hidden="true"></div>
<div class="cursors" aria-hidden="true"></div>
<div class="hud" role="toolbar" aria-label="Portfolio build intro">
  <div class="dots" aria-hidden="true"></div>
  <div class="status" role="status">Scanning page…</div>
  <div class="bar" aria-hidden="true"><i></i></div>
  <button data-do="tour" title="Auto-scroll while the swarm builds">Tour</button>
  <button data-do="speed" title="Build speed">1×</button>
  <button data-do="sound" class="snd off" title="Sound (M)" aria-label="Toggle sound"></button>
  <button data-do="live" class="go" hidden title="Fade into the real site">Go live</button>
  <button data-do="replay" hidden title="Wipe and rebuild again">Replay</button>
  <button data-do="skip" class="quiet" title="Go straight to the site (Esc)">Skip</button>
  <a class="credit" href="${CREDIT_URL}" target="_blank" rel="noopener noreferrer">Developed by SanStudio</a>
</div>`;
      const $ = (s) => shadow.querySelector(s);
      this.blank = $('.blank');
      this.page = $('.page');
      this.world = $('.world');
      this.pinned = $('.pinned');
      this.logo = $('.logo');
      this.rulers = $('.rulers');
      this.marks = $('.marks');
      this.badges = $('.badges');
      this.cursorsEl = $('.cursors');
      this.hud = $('.hud');
      this.status = $('.status');
      this.barFill = $('.bar i');
      this.dots = $('.dots');
      this.cursorNodes = new Map();
      this.marksHtml = '';
      this.badgesHtml = '';
      this.rulersOn = false;

      this.blank.style.backgroundColor = backdrop.color;
      if (backdrop.image && backdrop.image !== 'none') {
        this.blank.style.backgroundImage = backdrop.image;
        this.blank.style.backgroundSize = backdrop.size;
        this.blank.style.backgroundPosition = backdrop.position;
        this.blank.style.backgroundRepeat = backdrop.repeat;
      }
      const rgb = (backdrop.color.match(/[\d.]+/g) || [255, 255, 255]).map(Number);
      const lightness = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
      host.style.setProperty('--ph', lightness < 0.4 ? '#3B3D42' : '#D9D9D9');
      host.style.setProperty('--ui-font', getComputedStyle(document.body).fontFamily);
      this.paintSoundButton(false);
      this.makeLogo();
      document.documentElement.appendChild(host);
    }

    makeLogo() {
      const links = [...document.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"]')].filter((l) => l.href);
      const monogram = () => {
        this.logo.innerHTML = '';
        const mono = document.createElement('div');
        mono.className = 'mono';
        mono.textContent = ((document.title || location.hostname || '?').trim()[0] || '?').toUpperCase();
        this.logo.appendChild(mono);
      };
      if (!links.length) {
        monogram();
        return;
      }
      const icon = new Image();
      icon.alt = '';
      icon.onerror = monogram;
      icon.src = links[links.length - 1].href;
      this.logo.appendChild(icon);
    }

    paintSoundButton(on) {
      const button = this.shadow.querySelector('[data-do="sound"]');
      button.classList.toggle('off', !on);
      const tail = on ? '<path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.6a6 6 0 0 1 0 8.8"/>' : '<path d="M11 6l4 4M15 6l-4 4"/>';
      button.innerHTML = `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6v4h2.5l3.5 3V3L5 6z" fill="currentColor"/>${tail}</svg>`;
    }

    // On a page wider than the phone, the layout is bigger than the screen: keep the toolbar on the screen.
    keepHudInView() {
      const vv = window.visualViewport;
      if (!vv) return;
      const key = [vv.offsetLeft, vv.offsetTop, vv.width, vv.height, innerWidth, innerHeight].join();
      if (key === this.hudKey) return;
      this.hudKey = key;
      const fits = vv.width >= innerWidth - 1 && vv.height >= innerHeight - 1 && !vv.offsetLeft && !vv.offsetTop;
      const { style } = this.hud;
      style.left = fits ? '' : `${vv.offsetLeft + vv.width / 2}px`;
      style.bottom = fits ? '' : `${Math.max(8, innerHeight - vv.offsetTop - vv.height + 10)}px`;
      style.maxWidth = fits ? '' : `${vv.width - 16}px`;
      style.width = fits || vv.width > 640 ? '' : `${vv.width - 16}px`;
    }

    syncScroll() {
      this.world.style.transform = `translate(${-view.x}px,${-view.y}px)`;
    }

    mount(plan) {
      this.world.style.width = `${plan.docW}px`;
      this.world.style.height = `${plan.docH}px`;
      const inOrder = (plane) => plan.layers.filter((l) => l.plane === plane).sort((a, b) => a.key - b.key);
      const pageFrag = document.createDocumentFragment();
      for (const layer of inOrder('page')) pageFrag.appendChild(this.makeNode(layer));
      this.world.appendChild(pageFrag);
      const fixedFrag = document.createDocumentFragment();
      // An inner scroller sits at its own place among the screen-fixed pieces, clipped to its box.
      let portPlaced = plan.portKey == null;
      for (const layer of inOrder('fixed')) {
        if (!portPlaced && layer.key > plan.portKey) {
          fixedFrag.appendChild(this.page);
          portPlaced = true;
        }
        fixedFrag.appendChild(this.makeNode(layer));
      }
      if (!portPlaced) fixedFrag.appendChild(this.page);
      this.pinned.appendChild(fixedFrag);
      if (plan.portKey != null) {
        this.page.style.clipPath = `inset(${view.top}px ${innerWidth - view.right}px ${innerHeight - view.bottom}px ${view.left}px)`;
      }
    }

    makeNode(layer) {
      const n = document.createElement('div');
      n.style.display = 'none';
      layer.node = n;
      if (layer.kind === 'box') {
        n.className = 'it box';
        const skin = document.createElement('div');
        skin.className = 'skin';
        n.appendChild(skin);
      } else if (layer.kind === 'media') {
        n.className = 'it pic';
        n.innerHTML = PICTURE_ICON;
      } else if (layer.kind === 'text') {
        n.className = 'it';
        prepareTyping(layer);
      } else {
        n.className = 'it ln';
        n.innerHTML = '<svg width="1" height="1"><path fill="none"/></svg>';
      }
      if (layer.alpha < 0.999) n.style.opacity = layer.alpha;
      return n;
    }

    paintLayer(layer) {
      if (layer.painted === layer.ver) return;
      layer.painted = layer.ver;
      const n = layer.node;
      if (!layer.shown) {
        n.style.display = 'none';
        return;
      }
      if (n.style.display === 'none') n.style.display = '';
      if (layer.settle) {
        layer.settle = false;
        n.classList.add('settle');
        clearTimeout(n._settle);
        n._settle = setTimeout(() => n.classList.remove('settle'), 340);
      }
      if (layer.kind === 'line') {
        n.style.transform = `translate(${layer.dx}px,${layer.dy}px)`;
        const path = n.firstChild.firstChild;
        path.setAttribute('d', layer.points.slice(0, layer.placed).map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' '));
        path.setAttribute('stroke', layer.color);
        path.setAttribute('stroke-width', layer.width);
        path.setAttribute('stroke-linecap', 'square');
        if (layer.dash) path.setAttribute('stroke-dasharray', layer.dash);
        return;
      }
      const w = layer.draft ? layer.draft.w : layer.w;
      const h = layer.draft ? layer.draft.h : layer.h;
      n.style.transform = `translate(${layer.x + layer.dx}px,${layer.y + layer.dy}px)${layer.zoom !== 1 ? ` scale(${layer.zoom})` : ''}`;
      n.style.width = `${w}px`;
      n.style.height = `${h}px`;
      const c = layer.clip;
      // Negative insets are fine: this draws the clipping ancestor's rounded rectangle in local space.
      n.style.clipPath = layer.done && c
        ? `inset(${c.t - layer.y}px ${layer.x + layer.w - c.r}px ${layer.y + layer.h - c.b}px ${c.l - layer.x}px${c.rad ? ` round ${c.rad}px` : ''})`
        : '';
      const look = layer.borrowed ? layer.twin : layer;
      if (layer.kind === 'box') {
        if (n._look !== look.css) {
          n.firstChild.setAttribute('style', look.css);
          n._look = look.css;
        }
        n.classList.toggle('styled', layer.styled);
        n.style.borderRadius = layer.styled ? look.radius : '0px';
      } else if (layer.kind === 'media') {
        this.paintMedia(layer, look, n);
      } else {
        this.paintText(layer, n);
      }
    }

    paintMedia(layer, look, n) {
      if (n._shown !== look) {
        const old = n.querySelector('.shot');
        const shot = look.media.cloneNode(true);
        shot.classList.add('shot');
        if (old) {
          shot.classList.add('swap');
          old.replaceWith(shot);
        } else n.appendChild(shot);
        if (shot.localName === 'video') {
          shot.muted = true;
          if (shot.hasAttribute('data-play')) shot.play().catch(() => {});
        }
        n._shown = look;
        if (look.frame && !n.querySelector('.frame')) {
          const frame = document.createElement('div');
          frame.className = 'frame';
          frame.setAttribute('style', `${look.frame}border-radius:${look.radius};`);
          n.appendChild(frame);
        }
      }
      n.classList.toggle('styled', layer.styled);
      n.style.borderRadius = layer.styled ? look.radius : '0px';
      n.style.boxShadow = layer.styled ? look.shadow : '';
      n.style.backgroundColor = layer.styled && look.fill ? look.fill : '';
      if (layer.styled && layer.live && !layer.liveHooked) {
        layer.liveHooked = true;
        const still = () => {
          try {
            if (layer.live.loaded) n.querySelector('.shot').src = layer.live.toDataURL('image/png');
          } catch (_) { /* keep the placeholder */ }
        };
        still();
        layer.live.addEventListener('load', still);
      }
    }

    paintText(layer, n) {
      let content;
      if (layer.borrowed) {
        if (!layer.twinView) layer.twinView = layer.twin.source.cloneNode(true);
        content = layer.twinView;
      } else content = layer.live;
      if (n.firstChild !== content) {
        n.textContent = '';
        n.appendChild(content);
      }
      if (!layer.borrowed && layer.typedPainted !== layer.typed) {
        layer.lastTyped = paintTyped(layer, layer.typed);
        layer.typedPainted = layer.typed;
      }
      content.classList.toggle('all-selected', !!layer.selectAll);
      if (layer.editing && !layer.selectAll && !layer.borrowed) {
        if (!layer.caret) {
          layer.caret = document.createElement('span');
          layer.caret.className = 'caret';
        }
        const after = layer.lastTyped;
        if (after && after.parentNode) after.parentNode.insertBefore(layer.caret, after.nextSibling);
        else content.insertBefore(layer.caret, content.firstChild);
      } else if (layer.caret && layer.caret.parentNode) layer.caret.remove();
      if (layer.zoom !== 1) {
        const ox = layer.tb.x - layer.x + (layer.align === 'center' ? layer.tb.w / 2 : layer.align === 'right' || layer.align === 'end' ? layer.tb.w : 0);
        n.style.transformOrigin = `${ox}px ${layer.tb.y - layer.y}px`;
      }
    }

    paintCursors(crew) {
      const alive = new Set();
      for (const c of crew.agents) {
        let el = this.cursorNodes.get(c.id);
        if (!el) {
          el = document.createElement('div');
          el.className = 'cursor';
          el.innerHTML = '<svg width="28" height="28" viewBox="0 0 28 28"></svg>';
          this.cursorsEl.appendChild(el);
          this.cursorNodes.set(c.id, el);
        }
        alive.add(c.id);
        const x = c.pinned ? c.x : c.x - view.x;
        const y = c.pinned ? c.y : c.y - view.y;
        el.style.transform = `translate(${round1(x)}px,${round1(y)}px)`;
        const svg = el.firstChild;
        if (el._shape !== c.shape) {
          el._shape = c.shape;
          svg.innerHTML = cursorArt(c.shape, c.color);
          [el._hx, el._hy] = HOTSPOT[c.shape];
          svg.style.transformOrigin = `${el._hx}px ${el._hy}px`;
        }
        svg.style.transform = `translate(${-el._hx}px,${-el._hy}px) rotate(${round1(c.angle)}deg) scale(${1 - c.press * 0.12})`;
      }
      for (const [id, el] of this.cursorNodes) {
        if (!alive.has(id)) {
          el.remove();
          this.cursorNodes.delete(id);
        }
      }
    }

    paintMarks(crew) {
      const W = innerWidth;
      const H = innerHeight;
      const X = (x, pinned) => round1(pinned ? x : x - view.x);
      const Y = (y, pinned) => round1(pinned ? y : y - view.y);
      let svg = '';
      let tags = '';
      for (const g of crew.guides) {
        if (!g.shown || g.fade <= 0) continue;
        const width = 1 + g.flash;
        const glow = g.flash > 0 ? ` style="filter:drop-shadow(0 0 ${round1(2 + g.flash * 3)}px ${GUIDE})"` : '';
        svg += g.axis === 'x'
          ? `<line x1="${X(g.at)}" x2="${X(g.at)}" y1="0" y2="${H}" stroke="${GUIDE}" stroke-width="${width}" opacity="${round1(g.fade)}"${glow}/>`
          : `<line x1="0" x2="${W}" y1="${Y(g.at)}" y2="${Y(g.at)}" stroke="${GUIDE}" stroke-width="${width}" opacity="${round1(g.fade)}"${glow}/>`;
      }
      for (const line of crew.openLines) {
        const pin = line.plane !== 'page';
        const pts = line.points.slice(0, line.placed).map((p) => [X(p.x + line.dx, pin), Y(p.y + line.dy, pin)]);
        const trail = line.pen ? [...pts, [X(line.pen.x, line.pen.pinned), Y(line.pen.y, line.pen.pinned)]] : pts;
        svg += `<polyline points="${trail.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${SELECT}" stroke-width="1.5"/>`;
        for (const p of pts) svg += `<circle cx="${p[0]}" cy="${p[1]}" r="3.6" fill="#fff" stroke="${SELECT}" stroke-width="1.5"/>`;
      }
      const rulerLevel = crew.rulers.level;
      for (const c of crew.agents) {
        if (!c.marks) continue;
        const pin = c.pinned;
        for (const m of c.marks()) {
          if (m.type === 'box') {
            const x = X(m.b.x, pin);
            const y = Y(m.b.y, pin);
            const w = round1(m.b.w);
            const h = round1(m.b.h);
            const color = m.red ? GUIDE : SELECT;
            svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${color}"/>`;
            if (m.underline && m.underline.w > 0) {
              const u = m.underline;
              svg += `<line x1="${X(u.x, pin)}" x2="${X(u.x + u.w, pin)}" y1="${Y(u.y, pin)}" y2="${Y(u.y, pin)}" stroke="${SELECT}" stroke-width="1.5"/>`;
            }
            if (m.toRulers && rulerLevel > 0.05) {
              svg += `<g stroke="${SELECT}" stroke-dasharray="2 2" opacity="${round1(rulerLevel)}"><line x1="${RULER}" x2="${x}" y1="${round1(y + h / 2)}" y2="${round1(y + h / 2)}"/><line x1="${round1(x + w / 2)}" x2="${round1(x + w / 2)}" y1="${RULER}" y2="${y}"/></g>`;
            }
            if (m.handles) {
              for (const [hx, hy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
                svg += `<rect x="${round1(hx - 3.5)}" y="${round1(hy - 3.5)}" width="7" height="7" fill="#fff" stroke="${color}"/>`;
              }
            }
            if (m.size && w > 0) tags += `<div class="badge" style="left:${round1(x + w / 2)}px;top:${round1(y + h + 8)}px;background:${color}">${m.size}</div>`;
          } else {
            const ax = X(m.a.x, pin);
            const ay = Y(m.a.y, pin);
            const bx = X(m.b.x, pin);
            const by = Y(m.b.y, pin);
            const flat = ay === by;
            svg += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${GUIDE}"/>`;
            tags += `<div class="badge" style="left:${round1(flat ? (ax + bx) / 2 : ax + 18)}px;top:${round1(flat ? ay + 8 : (ay + by) / 2 - 9)}px;background:${GUIDE}">${m.label}</div>`;
          }
        }
      }
      if (svg !== this.marksHtml) this.marks.innerHTML = this.marksHtml = svg;
      if (tags !== this.badgesHtml) this.badges.innerHTML = this.badgesHtml = tags;
    }

    paintRulers(crew) {
      const level = crew.rulers.level;
      if (level <= 0.001) {
        if (this.rulersOn) {
          this.rulers.innerHTML = '';
          this.rulersOn = false;
        }
        return;
      }
      this.rulersOn = true;
      const W = innerWidth;
      const H = innerHeight;
      const px = view.x;
      const py = view.y;
      const major = W < 700 ? 200 : 100;
      let across = '';
      let down = '';
      for (let v = Math.floor(px / major) * major; v - px < W; v += major / 2) {
        const x = round1(v - px);
        const big = v % major === 0;
        across += `<line x1="${x}" x2="${x}" y1="${big ? 12 : 16}" y2="${RULER}" stroke="#5E5E5E"/>`;
        if (big) across += `<text x="${round1(x + 3)}" y="11" class="num">${v}</text>`;
      }
      for (let v = Math.floor(py / major) * major; v - py < H; v += major / 2) {
        const y = round1(v - py);
        const big = v % major === 0;
        down += `<line y1="${y}" y2="${y}" x1="${big ? 12 : 16}" x2="${RULER}" stroke="#5E5E5E"/>`;
        if (big) down += `<text x="11" y="${round1(y - 3)}" class="num" transform="rotate(-90 11 ${round1(y - 3)})">${v}</text>`;
      }
      for (const c of crew.agents) {
        if (!c.marks || c.pinned) continue;
        for (const m of c.marks()) {
          if (m.type !== 'box' || !m.handles) continue;
          const left = round1(m.b.x - px);
          const top = round1(m.b.y - py);
          across = `<rect x="${left}" y="0" width="${round1(m.b.w)}" height="${RULER}" fill="rgba(13,153,255,.22)"/>${across}<text x="${round1(left + 3)}" y="11" class="num sel">${Math.round(m.b.x)}</text>`;
          down = `<rect y="${top}" x="0" height="${round1(m.b.h)}" width="${RULER}" fill="rgba(13,153,255,.22)"/>${down}`;
        }
      }
      for (const g of crew.guides) {
        if (!g.dragging) continue;
        if (g.axis === 'x') {
          const x = round1(g.at - px);
          across += `<line x1="${x}" x2="${x}" y1="0" y2="${RULER}" stroke="${GUIDE}"/><text x="${round1(x + 4)}" y="11" class="num" style="fill:${GUIDE}">${Math.round(g.at)}</text>`;
        } else {
          const y = round1(g.at - py);
          down += `<line y1="${y}" y2="${y}" x1="0" x2="${RULER}" stroke="${GUIDE}"/>`;
        }
      }
      const shift = round1((level - 1) * 100);
      this.rulers.innerHTML =
        `<div class="ruler ruler-x" style="transform:translateY(${shift}%)"><svg width="${W}" height="${RULER}">${across}</svg></div>` +
        `<div class="ruler ruler-y" style="transform:translateX(${shift}%)"><svg width="${RULER}" height="${H}">${down}</svg></div>` +
        `<div class="ruler-corner" style="opacity:${round1(level)}"></div>`;
    }

    paint(crew) {
      this.syncScroll();
      if (crew.layers) for (const layer of crew.layers) this.paintLayer(layer);
      this.paintRulers(crew);
      this.paintMarks(crew);
      this.paintCursors(crew);
    }
  }

  // ------------------------------------------------------------------- crew

  class Crew {
    constructor(chime) {
      this.chime = chime;
      this.layers = null;
      this.jobs = [];
      this.guides = [];
      this.guideless = true;
      this.openLines = new Set();
      this.agents = [];
      this.nextId = 0;
      this.clock = 0;
      this.ready = false;
      this.building = false;
      this.finished = false;
      this.releasing = false;
      this.frontier = 0;
      this.scrollSpeed = 0;
      this.lastScroll = null;
      this.pace = 1;
      this.speed = 1;
      this.spawnWait = 0;
      this.mouse = null;
      this.retired = 0;
      this.doneJobs = 0;
      this.openJobs = 0;
      this.rulers = { demand: 0, level: 0, lastNeeded: -10 };
    }

    spawnIntro() {
      for (let i = 0; i < SETTINGS.introAgents; i++) {
        const fromLeft = i % 2 === 0;
        const agent = this.newAgent(
          view.x + (fromLeft ? -40 - rand(0, 200) : innerWidth + 40 + rand(0, 200)),
          view.y + rand(0.05, 0.95) * innerHeight,
          i < SETTINGS.minAgents,
        );
        agent.flying = true;
        this.agents.push(agent);
      }
    }

    load(plan) {
      this.layers = plan.layers;
      this.jobs = plan.jobs;
      this.guides = plan.guides;
      this.openJobs = plan.jobs.length;
      this.ready = true;
    }

    newAgent(x, y, permanent = false) {
      const id = this.nextId++;
      const quick = Math.random() < 0.25;
      return {
        id, x, y, permanent,
        name: AGENT_NAMES[id % AGENT_NAMES.length],
        color: AGENT_COLORS[id % AGENT_COLORS.length],
        shape: 'pointer', press: 0, angle: 0, vx: 0, vy: 0,
        job: null, script: null, marks: null, pinned: false, flying: false,
        idle: 0, leaving: false, worked: false,
        topSpeed: quick ? rand(1000, 1500) : rand(300, 750),
        grip: quick ? rand(3500, 6000) : rand(700, 1800),
        spin: quick ? rand(2.2, 3.4) : rand(0.8, 1.8),
        drift: rand(-1, 1),
        lane: rand(70, 170),
      };
    }

    begin() {
      if (this.building || !this.ready) return;
      this.building = true;
      this.startedAt = this.clock;
      for (const agent of this.agents) {
        agent.flying = false;
        agent.script = null;
        agent.angle = ((((agent.angle + 180) % 360) + 360) % 360) - 180;
      }
      if (this.onBegin) this.onBegin();
    }

    get viewTop() { return view.y + view.top; }
    get viewBottom() { return view.y + view.bottom; }

    screenX(agent) { return agent.pinned ? agent.x : agent.x - view.x; }

    ringPlaced(layer) {
      const b = this.bounds(layer);
      const x = b.x + b.w / 2 - (layer.plane === 'page' ? view.x : 0);
      this.chime.placed(x, innerWidth, (b.w * b.h) / Math.max(1, innerWidth * innerHeight));
    }

    bounds(layer) {
      if (layer.kind === 'text') {
        let h = layer.tb.h;
        if (layer.editing && !layer.selectAll && layer.total) {
          const lines = Math.max(1, Math.round(layer.tb.h / layer.lh));
          h = Math.min(layer.tb.h, Math.max(layer.lh, Math.ceil((layer.typed / layer.total) * lines) * layer.lh));
        }
        const z = layer.zoom;
        const shift = layer.align === 'center' ? (layer.tb.w * (1 - z)) / 2 : layer.align === 'right' || layer.align === 'end' ? layer.tb.w * (1 - z) : 0;
        return { x: layer.tb.x + layer.dx + shift, y: layer.tb.y + layer.dy, w: layer.tb.w * z, h: h * z };
      }
      return {
        x: layer.x + layer.dx,
        y: layer.y + layer.dy,
        w: layer.draft ? layer.draft.w : layer.w,
        h: layer.draft ? layer.draft.h : layer.h,
      };
    }

    boundsOfAll(list) {
      const all = list.map((l) => this.bounds(l));
      const x = Math.min(...all.map((b) => b.x));
      const y = Math.min(...all.map((b) => b.y));
      return { x, y, w: Math.max(...all.map((b) => b.x + b.w)) - x, h: Math.max(...all.map((b) => b.y + b.h)) - y };
    }

    selection(layer) {
      const b = this.bounds(layer);
      return {
        type: 'box', b, handles: true, toRulers: true, size: `${Math.round(b.w)} × ${Math.round(b.h)}`,
        underline: layer.kind === 'text' ? { x: b.x, y: b.y + (layer.lh * 0.5 + layer.size * 0.42) * layer.zoom, w: Math.min(b.w, layer.tb.w * layer.zoom) } : undefined,
      };
    }

    // ---- scheduling

    openWork() {
      const ready = [];
      for (const job of this.jobs) {
        if (job.state !== 'waiting' || (job.plane === 'page' && job.gate > this.frontier)) continue;
        if (job.needs.every((need) => need.state === 'finished')) ready.push(job);
      }
      return ready;
    }

    choose(agent, ready) {
      let best = null;
      let bestScore = Infinity;
      const top = this.viewTop - 40;
      const bottom = this.viewBottom;
      const agentY = agent.pinned ? agent.y + this.viewTop : agent.y;
      for (const job of ready) {
        const y = job.plane === 'page' ? job.y : this.viewTop + job.y;
        const where = y >= top && y <= bottom ? 0 : y < top ? 1 : 2;
        const score = where * 1e6 + Math.abs(where === 1 ? top - y : y) * 0.6 + Math.abs(y - agentY) * 0.4 - (job.spec.type === 'guide' ? 5e5 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = job;
        }
      }
      return best;
    }

    unfinishedInReach() {
      let n = 0;
      for (const job of this.jobs) if (job.state !== 'finished' && (job.plane !== 'page' || job.gate <= this.frontier)) n++;
      return n;
    }

    workBelowFold() {
      return this.jobs.some((job) => job.state === 'waiting' && job.plane === 'page' && job.gate > this.frontier);
    }

    step(rawDt) {
      const dt = Math.min(rawDt, 0.05);
      this.clock += dt;
      const moved = Math.abs(view.y - (this.lastScroll == null ? view.y : this.lastScroll)) / Math.max(dt, 0.001);
      this.lastScroll = view.y;
      this.scrollSpeed = Math.max(this.scrollSpeed * Math.exp(-dt * 1.2), this.scrollSpeed * 0.7 + moved * 0.3);
      if (this.building) this.frontier = Math.max(this.frontier, this.viewBottom);
      const ready = this.building ? this.openWork() : [];
      this.pace = clamp(2.1 + this.scrollSpeed / 900 + (ready.length / Math.max(1, this.agents.length)) * 0.5, 2.1, 4.5) * this.speed;

      if (this.rulers.demand > 0) this.rulers.lastNeeded = this.clock;
      const rulerGoal = this.clock - this.rulers.lastNeeded < 2 ? 1 : 0;
      this.rulers.level += (rulerGoal - this.rulers.level) * Math.min(1, dt * 10);
      if (Math.abs(rulerGoal - this.rulers.level) < 0.002) this.rulers.level = rulerGoal;

      for (const g of this.guides) this.ageGuide(g, dt);

      if (!this.finished && this.building && this.openJobs === 0) {
        for (const a of this.agents) {
          if (!a.job && !a.flying) {
            a.flying = true;
            a.script = null;
            a.leaving = false;
            a.marks = null;
            a.shape = 'pointer';
          }
        }
        if (this.agents.every((a) => a.flying)) {
          this.finished = true;
          this.endedAt = this.clock;
          if (this.onFinish) this.onFinish();
        }
      }
      if (this.finished) {
        this.finale(dt);
        return;
      }
      if (!this.building) {
        const center = { x: view.x + innerWidth / 2, y: view.y + innerHeight / 2 };
        this.swirl(dt, this.agents, center, 0.7);
        return;
      }
      if (this.agents.some((a) => a.flying)) this.swirl(dt, this.agents.filter((a) => a.flying));
      this.staff(dt, ready);
      this.runAgents(dt);
    }

    ageGuide(g, dt) {
      if (!g.shown) return;
      if (g.flash > 0) g.flash = Math.max(0, g.flash - dt * 1.5);
      if (g.shownAt == null) g.shownAt = this.clock;
      if (g.dragging || g.fade <= 0) return;
      const stale = this.clock - g.shownAt > 7 && !g.needs.some((j) => j.state === 'active');
      const settled = g.needs.every((j) => j.state === 'finished') && this.clock - Math.max(0, ...g.needs.map((j) => j.finishedAt)) > 1.2;
      if (stale || settled) g.fade = Math.max(0, g.fade - dt * 1.2);
    }

    staff(dt, ready) {
      this.spawnWait -= dt;
      const want = clamp(SETTINGS.minAgents + Math.floor(this.scrollSpeed / 40) + Math.floor(ready.length / 2), SETTINGS.minAgents, SETTINGS.maxAgents);
      const active = this.agents.filter((a) => !a.leaving).length;
      const busy = this.agents.filter((a) => a.job).length;
      if (active < want && ready.length > active - busy && this.spawnWait <= 0) {
        const x = Math.random() < 0.5 ? -40 : innerWidth + 40;
        this.agents.push(this.newAgent(view.x + x, view.y + rand(0.2, 0.8) * innerHeight));
        this.spawnWait = 0.035;
      }
      for (const agent of this.agents) {
        if (agent.job || agent.leaving || agent.flying) continue;
        const job = this.choose(agent, ready);
        if (!job) continue;
        ready.splice(ready.indexOf(job), 1);
        job.state = 'active';
        this.openJobs--;
        agent.job = job;
        agent.worked = true;
        agent.idle = 0;
        if (job.plane !== 'page') {
          agent.pinned = true;
          agent.x -= view.x;
          agent.y -= view.y;
        }
        agent.script = this.scriptFor(agent, job);
      }
    }

    runAgents(dt) {
      for (const agent of [...this.agents]) {
        if (agent.flying) continue;
        agent.press = Math.max(0, agent.press - dt * 6);
        if (agent.angle !== 0) agent.angle = Math.abs(agent.angle) < 0.5 ? 0 : agent.angle * (1 - Math.min(1, dt * 10));
        if (!agent.job) {
          agent.idle += dt;
          const crewSize = this.agents.filter((a) => !a.leaving).length;
          if (!agent.leaving && agent.idle > 2.5 && crewSize > SETTINGS.minAgents && !agent.permanent) {
            agent.leaving = true;
            agent.script = this.exit(agent);
          }
          if (!agent.script) agent.script = this.wander(agent);
        }
        if (!agent.script.next(dt).done) continue;
        if (agent.job) {
          agent.job.state = 'finished';
          agent.job.finishedAt = this.clock;
          this.doneJobs++;
          agent.job = null;
          agent.marks = null;
          agent.shape = 'pointer';
          if (agent.pinned) {
            agent.pinned = false;
            agent.x += view.x;
            agent.y += view.y;
          }
        }
        agent.script = null;
        if (agent.leaving) {
          if (agent.worked) this.retired++;
          this.agents.splice(this.agents.indexOf(agent), 1);
        }
      }
    }

    finale(dt) {
      this.spawnWait -= dt;
      if (this.releasing) {
        for (const agent of [...this.agents]) {
          if (!agent.script) agent.script = this.exit(agent);
          if (agent.script.next(dt).done) this.agents.splice(this.agents.indexOf(agent), 1);
        }
        return;
      }
      if (this.agents.length < SETTINGS.flockAgents && this.spawnWait <= 0) {
        const x = Math.random() < 0.5 ? -30 : innerWidth + 30;
        const agent = this.newAgent(view.x + x, view.y + rand(0.1, 0.9) * innerHeight);
        agent.flying = true;
        this.agents.push(agent);
        this.spawnWait = 0.04;
      }
      this.swirl(dt, this.agents);
    }

    // ---- flocking: the group orbits a moving point and gets out of the mouse's way

    swirl(dt, flock, anchor, scale = 1) {
      const t = this.clock;
      const mouse = this.mouse ? { x: this.mouse.x + view.x, y: this.mouse.y + view.y } : null;
      const center = anchor || mouse || {
        x: view.x + innerWidth * (0.5 + 0.28 * Math.sin(t * 0.37)),
        y: view.y + innerHeight * (0.5 + 0.25 * Math.sin(t * 0.53 + 1)),
      };
      const baseRadius = 135 * scale * (1 + 0.18 * Math.sin(t * 0.55));
      const direction = Math.tanh(Math.cos(t * 0.11) * 3);

      for (const a of flock) {
        const rx = a.x - center.x;
        const ry = a.y - center.y;
        const dist = Math.hypot(rx, ry) || 0.01;
        const ux = rx / dist;
        const uy = ry / dist;
        const ring = baseRadius * (1 + 0.3 * Math.sin(3 * Math.atan2(ry, rx) + t * 0.7)) + (a.lane - 120) * 0.55 * scale;
        const around = 300 * (0.7 + a.spin * 0.2) * direction;
        const toRing = clamp((ring - dist) * 4, -2600, 1400);
        const curve = a.drift * 400 * clamp((dist - ring) / 600, 0, 1);
        a.wantX = -uy * (around + curve) + ux * toRing;
        a.wantY = ux * (around + curve) + uy * toRing;
      }
      for (const a of flock) {
        let sumX = 0;
        let sumY = 0;
        let weight = 0;
        for (const other of flock) {
          if (other === a) continue;
          const d = Math.hypot(other.x - a.x, other.y - a.y);
          if (d > 90) continue;
          const w = 1 - d / 90;
          sumX += other.vx * w;
          sumY += other.vy * w;
          weight += w;
        }
        let fx = a.wantX;
        let fy = a.wantY;
        if (weight > 0) {
          fx = fx * 0.7 + (sumX / weight) * 0.3;
          fy = fy * 0.7 + (sumY / weight) * 0.3;
        }
        const far = Math.max(0, Math.hypot(a.x - center.x, a.y - center.y) - 180 * scale);
        const limit = a.topSpeed * (1.3 + Math.min(3.2, far / 90));
        const speed = Math.hypot(fx, fy);
        if (speed > limit) {
          fx *= limit / speed;
          fy *= limit / speed;
        }
        let ax = (fx - a.vx) * 6;
        let ay = (fy - a.vy) * 6;
        const maxForce = a.grip * (1.4 + Math.min(5, far / 50));
        const force = Math.hypot(ax, ay);
        if (force > maxForce) {
          ax *= maxForce / force;
          ay *= maxForce / force;
        }
        a.vx += ax * dt;
        a.vy += ay * dt;
        a.x += a.vx * dt;
        a.y += a.vy * dt;
      }
      if (mouse) {
        for (const a of flock) {
          const rx = a.x - mouse.x;
          const ry = a.y - mouse.y;
          const d = Math.hypot(rx, ry) || 0.01;
          if (d >= 48) continue;
          a.x = mouse.x + (rx / d) * 48;
          a.y = mouse.y + (ry / d) * 48;
          a.vx += (rx / d) * 260;
          a.vy += (ry / d) * 260;
        }
      }
      for (const a of flock) {
        if (Math.hypot(a.vx, a.vy) < 30) continue;
        // The arrow's tip points about 131° away from "east", so heading + 131 aims it.
        const turn = ((((Math.atan2(a.vy, a.vx) * 180) / Math.PI + 131 - a.angle + 540) % 360) + 360) % 360 - 180;
        a.angle += turn * Math.min(1, dt * 8);
        a.press = Math.max(0, a.press - dt * 6);
      }
    }

    // ---- gestures (generators: each frame hands them the elapsed seconds)

    *pause(seconds) {
      let t = 0;
      while (t < seconds) t += (yield) * this.pace;
    }

    *glide(agent, target, { pace = 1, bend = null, drag = false, onMove = null } = {}) {
      const where = typeof target === 'function' ? target : () => target;
      const fromX = agent.x;
      const fromY = agent.y;
      const first = where();
      const dist = Math.hypot(first.x - fromX, first.y - fromY);
      if (dist < 0.5) {
        agent.x = first.x;
        agent.y = first.y;
        if (onMove) onMove();
        return;
      }
      const duration = clamp(0.12 + Math.sqrt(dist) * 0.021, 0.14, 0.9) / pace;
      const arc = (bend != null ? bend : (Math.random() < 0.5 ? -1 : 1) * rand(0.04, 0.14)) * Math.min(dist, 600);
      let t = 0;
      while (t < duration) {
        t += (yield) * this.pace;
        const k = Math.min(1, t / duration);
        const e = drag || k < 0.15 ? smooth(k) : decel(k);
        const goal = where();
        const dx = goal.x - fromX;
        const dy = goal.y - fromY;
        const len = Math.hypot(dx, dy) || 1;
        const off = Math.sin(Math.PI * e) * arc;
        agent.x = fromX + dx * e - (dy / len) * off;
        agent.y = fromY + dy * e + (dx / len) * off;
        if (onMove) onMove();
      }
      const goal = where();
      agent.x = goal.x;
      agent.y = goal.y;
      if (onMove) onMove();
    }

    *tap(agent) {
      agent.press = 1;
      this.chime.press(this.screenX(agent));
      yield* this.pause(0.07);
    }

    *typeInto(layer, agent) {
      const total = layer.total;
      const rush = clamp(70 / Math.max(1, total), 0.06, 1);
      let credit = 0;
      let i = layer.typed;
      while (i < total) {
        credit += (yield) * this.pace;
        while (i < total && credit > 0) {
          const ch = layer.chars[i];
          let cost = rand(0.012, 0.04);
          if (ch === ' ') cost += rand(0, 0.03);
          if (Math.random() < 0.025) cost += rand(0.08, 0.2);
          credit -= cost * rush;
          i++;
        }
        if (i > layer.typed) this.chime.key(this.screenX(agent));
        layer.typed = i;
        touch(layer);
      }
    }

    *wander(agent) {
      for (;;) {
        const top = this.viewTop;
        const span = this.viewBottom - top;
        const spot = { x: rand(view.x + innerWidth * 0.17, view.x + innerWidth * 0.83), y: rand(top + span * 0.2, top + span * 0.8) };
        yield* this.glide(agent, spot, { pace: 0.35 });
        let wait = rand(0.4, 1.4);
        while (wait > 0) {
          wait -= yield;
          if (agent.y < this.viewTop || agent.y > this.viewBottom) break;
        }
      }
    }

    *exit(agent) {
      const right = agent.x > view.x + innerWidth / 2;
      const offset = agent.y - this.viewTop;
      yield* this.glide(agent, () => ({ x: view.x + (right ? innerWidth + 60 : -60), y: this.viewTop + offset }), { pace: 0.8 });
    }

    scriptFor(agent, job) {
      const s = job.spec;
      switch (s.type) {
        case 'box': return this.dragBox(agent, s.layer, false);
        case 'media': return this.dragBox(agent, s.layer, true);
        case 'line': return this.penLine(agent, s.layer);
        case 'text': return this.writeText(agent, s.layer, s.snapTo || null, !!s.grow);
        case 'guide': return this.pullGuide(agent, s.guide);
        case 'clone': return this.cloneGroup(agent, s.group, s.index);
        case 'retype': return this.retype(agent, s.layer);
        default: return this.reskin(agent, s.layer);
      }
    }

    // Stop dragging at the screen edge when a box is bigger than the view.
    dragStop(agent, layer) {
      const right = (agent.pinned ? 0 : view.x) + innerWidth;
      const bottom = agent.pinned ? innerHeight : this.viewBottom;
      const x = layer.x + layer.w > right - 16 ? Math.max(layer.x + Math.min(layer.w, 40), right - 30) : layer.x + layer.w;
      const y = layer.y + layer.h > bottom - 16 ? Math.max(layer.y + Math.min(layer.h, 40), bottom - 40) : layer.y + layer.h;
      return { x: Math.min(x, layer.x + layer.w), y: Math.min(y, layer.y + layer.h) };
    }

    *dragBox(agent, layer, isMedia) {
      agent.shape = 'cross';
      yield* this.glide(agent, { x: layer.x, y: layer.y });
      agent.press = 1;
      layer.shown = true;
      if (layer.big) layer.styled = true;
      layer.draft = { w: 0, h: 0 };
      touch(layer);
      agent.marks = () => [this.selection(layer)];
      const stop = this.dragStop(agent, layer);
      yield* this.glide(agent, stop, {
        pace: 0.75, drag: true, bend: 0,
        onMove: () => {
          layer.draft = { w: Math.max(0, agent.x - layer.x), h: Math.max(0, agent.y - layer.y) };
          touch(layer);
        },
      });
      if (stop.x < layer.x + layer.w - 0.5 || stop.y < layer.y + layer.h - 0.5) {
        const w0 = layer.draft.w;
        const h0 = layer.draft.h;
        let k = 0;
        while (k < 1) {
          k = Math.min(1, k + ((yield) * this.pace) / 0.5);
          const e = decel(k);
          layer.draft = { w: w0 + (layer.w - w0) * e, h: h0 + (layer.h - h0) * e };
          touch(layer);
        }
      }
      layer.draft = null;
      touch(layer);
      agent.shape = 'pointer';
      yield* this.pause(rand(0.18, 0.3));
      layer.styled = true;
      touch(layer);
      this.ringPlaced(layer);
      yield* this.pause(isMedia ? 0.5 : 0.35);
      agent.marks = null;
      layer.done = true;
      touch(layer);
    }

    *penLine(agent, layer) {
      agent.shape = 'pen-plus';
      yield* this.glide(agent, layer.points[0]);
      yield* this.tap(agent);
      layer.shown = true;
      layer.placed = 1;
      layer.pen = agent;
      touch(layer);
      this.openLines.add(layer);
      agent.shape = 'pen';
      for (let i = 1; i < layer.points.length; i++) {
        yield* this.glide(agent, layer.points[i], { bend: rand(-0.03, 0.03) });
        yield* this.tap(agent);
        layer.placed = i + 1;
        touch(layer);
        yield* this.pause(rand(0.04, 0.12));
      }
      layer.pen = null;
      touch(layer);
      yield* this.glide(agent, { x: agent.x + rand(14, 30), y: agent.y + rand(10, 24) }, { pace: 1.4 });
      yield* this.pause(0.3);
      this.openLines.delete(layer);
      layer.done = true;
      touch(layer);
    }

    *writeText(agent, layer, guide, grow) {
      if (guide) {
        if (guide.axis === 'x') {
          layer.dx = rand(28, 64);
          layer.dy = rand(-8, 8);
        } else {
          layer.dx = rand(-8, 8);
          layer.dy = rand(18, 34) * (Math.random() < 0.5 ? -1 : 1);
        }
      }
      if (grow) layer.zoom = Math.min(1, 18 / layer.size);
      const start = this.bounds(layer);
      agent.shape = 'cross';
      yield* this.glide(agent, { x: start.x, y: start.y });
      const firstLine = Math.min(start.h, layer.lh * layer.zoom);
      if (start.w < 140 && layer.tb.h < layer.lh * 1.6) {
        yield* this.tap(agent);
      } else {
        agent.press = 1;
        const outline = { x: start.x, y: start.y, w: 0, h: 0 };
        agent.marks = () => [{ type: 'box', b: outline, handles: true, toRulers: true, size: `${Math.round(outline.w)} × ${Math.round(outline.h)}` }];
        yield* this.glide(agent, { x: start.x + start.w, y: start.y + firstLine }, {
          pace: 0.9, drag: true, bend: 0,
          onMove: () => {
            outline.w = Math.max(0, agent.x - start.x);
            outline.h = Math.max(0, agent.y - start.y);
          },
        });
      }
      layer.shown = true;
      layer.editing = true;
      layer.typed = 0;
      touch(layer);
      agent.shape = 'beam';
      agent.marks = () => [{ type: 'box', b: this.bounds(layer) }];
      yield* this.glide(agent, { x: agent.x + rand(-30, 10), y: agent.y + rand(10, 30) }, { pace: 1.5 });
      yield* this.typeInto(layer, agent);
      yield* this.pause(0.12);
      layer.editing = false;
      touch(layer);
      this.ringPlaced(layer);
      agent.shape = 'pointer';
      agent.marks = () => [this.selection(layer)];
      if (grow) {
        const sizes = [24, 32, 40, 48, 56, 64, 72, 88, 104].filter((s) => s < layer.size && s > 18);
        for (const s of [...sizes, layer.size]) {
          yield* this.pause(0.06);
          layer.zoom = s / layer.size;
          touch(layer);
          this.chime.tick(this.screenX(agent), 2400 + s * 12, 0.07, 0.01);
        }
        layer.zoom = 1;
        touch(layer);
        yield* this.pause(0.15);
      }
      if (guide) {
        // Give the guide a moment to land, but never hold a cursor up for it.
        let waited = 0;
        while (guide.job.state !== 'finished' && waited < 1.6) waited += (yield) * this.pace;
        if (guide.job.state !== 'finished') guide = null;
      }
      if (guide) yield* this.snapToGuide(agent, layer, guide);
      else if (layer.dx || layer.dy) {
        const dx0 = layer.dx;
        const dy0 = layer.dy;
        let k = 0;
        while (k < 1) {
          k = Math.min(1, k + ((yield) * this.pace) / 0.3);
          const e = smooth(k);
          layer.dx = dx0 * (1 - e);
          layer.dy = dy0 * (1 - e);
          touch(layer);
        }
        yield* this.pause(0.15);
      } else yield* this.pause(0.2);
      agent.marks = null;
      layer.done = true;
      touch(layer);
    }

    *snapToGuide(agent, layer, guide) {
      const b = this.bounds(layer);
      const grab = { x: b.x + Math.min(b.w * 0.4, 60) + rand(-6, 6), y: b.y + Math.min(b.h * 0.5, 22) };
      yield* this.glide(agent, grab);
      agent.press = 1;
      const home = { x: grab.x - layer.dx, y: grab.y - layer.dy };
      const past = {
        x: home.x + (guide.axis === 'x' ? -rand(2, 5) : rand(-6, 6)),
        y: home.y + (guide.axis === 'y' ? -rand(2, 5) : rand(-3, 3)),
      };
      const follow = () => {
        let h = agent.x - home.x;
        let v = agent.y - home.y;
        const snapped = (offset, current) => {
          if (Math.abs(offset) >= 9) return offset;
          if (offset !== 0 && current !== 0) {
            if (guide.flash < 0.5) this.chime.snap(this.screenX(agent));
            guide.flash = 1;
          }
          return 0;
        };
        if (guide.axis === 'x') h = snapped(h, layer.dx);
        else v = snapped(v, layer.dy);
        layer.dx = h;
        layer.dy = v;
        touch(layer);
      };
      yield* this.glide(agent, past, { pace: 0.6, drag: true, onMove: follow });
      yield* this.pause(0.1);
      yield* this.glide(agent, home, { pace: 2, onMove: follow });
      layer.dx = 0;
      layer.dy = 0;
      touch(layer);
      yield* this.pause(0.25);
    }

    *pullGuide(agent, guide) {
      this.rulers.demand++;
      try {
        const jitter = rand(-0.15, 0.15);
        const origin = () => (guide.axis === 'x'
          ? { x: view.x + 10, y: view.y + innerHeight * (0.45 + jitter) }
          : { x: view.x + innerWidth * 0.3 + jitter * 200, y: view.y + 10 });
        agent.shape = 'pointer';
        yield* this.glide(agent, origin);
        while (this.rulers.level < 0.95) yield;
        yield* this.glide(agent, origin, { pace: 3 });
        agent.press = 1;
        agent.shape = guide.axis === 'x' ? 'ew' : 'ns';
        guide.shown = true;
        guide.dragging = true;
        guide.fade = 1;
        const track = () => { guide.at = guide.axis === 'x' ? agent.x : agent.y; };
        track();
        const landing = () => {
          const o = origin();
          return guide.axis === 'x' ? { x: guide.pos, y: o.y + 40 } : { x: o.x + 30, y: guide.pos };
        };
        yield* this.glide(agent, landing, { pace: 0.55, drag: true, onMove: track });
        guide.at = guide.pos;
        guide.dragging = false;
        this.chime.snap(this.screenX(agent));
        agent.shape = 'pointer';
        yield* this.pause(0.25);
      } finally {
        this.rulers.demand--;
      }
    }

    *cloneGroup(agent, group, index) {
      const target = group.targets[index];
      const distance = (s) => Math.hypot(s.box.x - target.box.x, s.box.y - target.box.y);
      let source = group.source;
      for (const other of group.targets) if (other.job.state === 'finished' && distance(other) < distance(source)) source = other;
      const sourceBounds = this.boundsOfAll(source.layers);
      agent.shape = 'pointer';
      const grab = { x: sourceBounds.x + Math.min(sourceBounds.w * 0.45, 70) + rand(-8, 8), y: sourceBounds.y + Math.min(sourceBounds.h * 0.45, 30) + rand(-4, 4) };
      yield* this.glide(agent, grab);
      yield* this.tap(agent);
      agent.marks = () => [{ type: 'box', b: sourceBounds, handles: true, size: `${Math.round(sourceBounds.w)} × ${Math.round(sourceBounds.h)}` }];
      yield* this.pause(rand(0.15, 0.3));
      agent.shape = 'clone';
      yield* this.pause(0.12);
      agent.press = 1;
      const ox = source.box.x - target.box.x;
      const oy = source.box.y - target.box.y;
      for (const layer of target.layers) {
        layer.shown = true;
        layer.borrowed = true;
        layer.dx = ox;
        layer.dy = oy;
        if (layer.kind === 'box' || layer.kind === 'media') {
          layer.styled = true;
          layer.draft = null;
        }
        if (layer.kind === 'line') layer.placed = layer.points.length;
        touch(layer);
      }
      agent.marks = () => {
        const now = this.boundsOfAll(target.layers);
        const marks = [{ type: 'box', b: sourceBounds, red: true }, { type: 'box', b: now, red: true }];
        const gap = this.measureGap(sourceBounds, now);
        if (gap) marks.push(gap);
        return marks;
      };
      yield* this.glide(agent, { x: grab.x - ox, y: grab.y - oy }, {
        pace: 0.6, drag: true,
        onMove: () => {
          for (const layer of target.layers) {
            layer.dx = ox + (agent.x - grab.x);
            layer.dy = oy + (agent.y - grab.y);
            touch(layer);
          }
        },
      });
      this.ringPlaced(target.layers[0]);
      for (const layer of target.layers) {
        layer.dx = 0;
        layer.dy = 0;
        layer.settle = true;
        if (!layer.followUp) {
          layer.borrowed = false;
          if (layer.kind === 'text') layer.typed = layer.total;
        }
        touch(layer);
      }
      yield* this.pause(0.1);
      agent.shape = 'pointer';
      agent.marks = () => {
        const now = this.boundsOfAll(target.layers);
        return [{ type: 'box', b: now, handles: true, size: `${Math.round(now.w)} × ${Math.round(now.h)}` }];
      };
      yield* this.pause(0.35);
      for (const layer of target.layers) {
        if (!layer.followUp) {
          layer.done = true;
          touch(layer);
        }
      }
    }

    measureGap(a, b) {
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      if (overlapY > 0) {
        const y = Math.max(a.y, b.y) + overlapY / 2;
        const [left, right] = a.x < b.x ? [a, b] : [b, a];
        const gap = right.x - (left.x + left.w);
        if (gap > 0) return { type: 'gap', a: { x: left.x + left.w, y }, b: { x: right.x, y }, label: String(Math.round(gap)) };
      } else if (overlapX > 0) {
        const x = Math.max(a.x, b.x) + overlapX / 2;
        const [top, bottom] = a.y < b.y ? [a, b] : [b, a];
        const gap = bottom.y - (top.y + top.h);
        if (gap > 0) return { type: 'gap', a: { x, y: top.y + top.h }, b: { x, y: bottom.y }, label: String(Math.round(gap)) };
      }
      return null;
    }

    *retype(agent, layer) {
      agent.shape = 'pointer';
      const b = this.bounds(layer);
      yield* this.glide(agent, { x: b.x + Math.min(b.w * 0.5, 50) + rand(-5, 5), y: b.y + Math.min(layer.lh, b.h) * 0.55 });
      yield* this.tap(agent);
      yield* this.pause(0.08);
      yield* this.tap(agent);
      layer.selectAll = true;
      layer.editing = true;
      touch(layer);
      agent.shape = 'beam';
      agent.marks = () => [{ type: 'box', b: this.bounds(layer) }];
      yield* this.pause(rand(0.2, 0.35));
      layer.borrowed = false;
      layer.selectAll = false;
      layer.typed = 0;
      touch(layer);
      yield* this.typeInto(layer, agent);
      yield* this.pause(0.12);
      layer.editing = false;
      touch(layer);
      agent.shape = 'pointer';
      agent.marks = () => [this.selection(layer)];
      yield* this.pause(0.3);
      agent.marks = null;
      layer.done = true;
      touch(layer);
    }

    *reskin(agent, layer) {
      agent.shape = 'pointer';
      const b = this.bounds(layer);
      yield* this.glide(agent, { x: b.x + Math.min(b.w * 0.5, 60) + rand(-6, 6), y: b.y + Math.min(b.h * 0.5, 30) + rand(-4, 4) });
      yield* this.tap(agent);
      agent.marks = () => [this.selection(layer)];
      yield* this.pause(rand(0.15, 0.3));
      layer.borrowed = false;
      touch(layer);
      this.ringPlaced(layer);
      yield* this.pause(0.4);
      agent.marks = null;
      layer.done = true;
      touch(layer);
    }
  }

  // ------------------------------------------------------------------- show

  // Scroll animations and transitions are paused for the instant we read the page,
  // so every section is captured in its final state. A site's preloader is left alone.
  const OUTSIDE_CURTAIN = 'body>*:not([data-lb-curtain])';
  const FREEZE_CSS = `
[data-aos],.wow,[data-sr-id]{opacity:1!important;transform:none!important;visibility:visible!important}
body{transition:none!important}
${OUTSIDE_CURTAIN},${OUTSIDE_CURTAIN} *,${OUTSIDE_CURTAIN}::before,${OUTSIDE_CURTAIN}::after,${OUTSIDE_CURTAIN} *::before,${OUTSIDE_CURTAIN} *::after{transition:none!important;animation:none!important}`;

  function readPage(host, curtain) {
    const freeze = document.createElement('style');
    freeze.textContent = FREEZE_CSS;
    document.head.appendChild(freeze);
    try {
      return takeBlueprint(host, curtain);
    } finally {
      freeze.remove();
    }
  }

  // Scroll through once behind the blank canvas: reveal-on-scroll effects and lazy images run now.
  async function scanPage() {
    const total = view.contentHeight();
    if (total <= view.height * 1.25) return;
    const steps = Math.min(28, Math.ceil(total / (view.height * 0.85)));
    for (let i = 1; i <= steps; i++) {
      view.scrollTo(Math.min(total, (total / steps) * i));
      await nextFrame();
      await sleep(30);
    }
    view.scrollTo(0, 0);
    await nextFrame();
    await sleep(400);
  }

  // A site's own loading screen: full-window, on top, and either named like one or opaque with a high z-index.
  function findCurtain() {
    const named = new Set(document.querySelectorAll('[id*="load" i],[class*="load" i],[id*="splash" i],[class*="splash" i],[id*="spinner" i],[class*="spinner" i]'));
    for (const el of [...named, ...document.body.children]) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
      if (cs.display === 'none' || cs.visibility !== 'visible' || parseFloat(cs.opacity) < 0.5) continue;
      const r = el.getBoundingClientRect();
      if (r.width < innerWidth * 0.9 || r.height < innerHeight * 0.9) continue;
      const z = parseInt(cs.zIndex, 10) || 0;
      if (named.has(el) ? z >= 0 : z >= 1000 && alphaOf(cs.backgroundColor) > 0.9) return el;
    }
    return null;
  }

  function curtainIsDown(el) {
    if (!el.isConnected) return true;
    const cs = getComputedStyle(el);
    return cs.display === 'none' || cs.visibility !== 'visible' || parseFloat(cs.opacity) < 0.98;
  }

  function settleImages(timeoutMs) {
    const waiting = [];
    for (const img of document.images) {
      if (img.loading === 'lazy') img.loading = 'eager';
      if (!img.complete) waiting.push(new Promise((done) => {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      }));
    }
    return Promise.race([Promise.all(waiting), sleep(timeoutMs)]);
  }

  let current = null;

  class Show {
    constructor(firstRun) {
      this.firstRun = firstRun;
      this.dead = false;
      this.tour = false;
      this.tourSpeed = 0;
      this.tourCarry = 0;
      this.speedIndex = 0;
      this.complete = false;
      this.width = innerWidth;
      this.unbind = [];
      this.chime = new Chime();
      this.curtain = firstRun ? findCurtain() : null;
      let z = 2147483647;
      if (this.curtain) {
        this.curtain.setAttribute('data-lb-curtain', '');
        z = Math.max(1, (parseInt(getComputedStyle(this.curtain).zIndex, 10) || 1) - 1);
      }
      this.stage = new Stage(pageBackground(), firstRun, z);
      document.documentElement.classList.remove('lb-pending');
      this.crew = new Crew(this.chime);
      this.crew.onBegin = () => this.stage.logo.classList.add('gone');
      this.crew.onFinish = () => this.finish();
      document.body.inert = true;
    }

    async play() {
      try {
        await this.prepare();
      } catch (err) {
        console.error('[livebuild]', err);
        this.close(false);
      }
    }

    async prepare() {
      const { stage } = this;
      this.bindEvents();
      if (this.firstRun) {
        if (document.readyState !== 'complete') await new Promise((done) => window.addEventListener('load', done, { once: true }));
        if (this.dead) return;
        view.detect();
        if (!this.curtain) stage.hud.classList.add('on');
      } else {
        await nextFrame();
        stage.blank.classList.remove('wipe');
        await sleep(520);
        view.detect();
        view.scrollTo(0, 0);
      }
      if (this.dead) return;

      const scanned = this.firstRun ? scanPage() : Promise.resolve();
      const captured = scanned.then(() => this.capture());
      captured.catch(() => {}); // reported below, where it is awaited
      await scanned;
      await this.curtainLifted();
      if (this.dead) return;
      this.startFlight();
      await captured;
      if (this.dead) return;
      const wait = 1300 - (performance.now() - this.flownInAt);
      if (wait > 0) await sleep(wait);
      if (!this.dead) this.crew.begin();
    }

    async capture() {
      await settleImages(SETTINGS.captureDeadlineMs);
      await Promise.race([document.fonts.ready, sleep(1200)]);
      await nextFrame();
      if (this.dead) return;
      const plan = readPage(this.stage.host, this.curtain);
      if (!plan.layers.length) throw new Error('nothing to rebuild');
      this.stage.mount(plan);
      this.crew.load(plan);
      this.plan = plan;
    }

    async curtainLifted() {
      if (!this.curtain) return;
      const giveUpAt = performance.now() + SETTINGS.maxCurtainMs;
      while (!this.dead && !curtainIsDown(this.curtain)) {
        if (performance.now() > giveUpAt) {
          // It never lifted (or isn't really a preloader): bring the canvas above it.
          this.stage.host.style.setProperty('z-index', '2147483647', 'important');
          return;
        }
        await sleep(50);
      }
    }

    startFlight() {
      view.sync();
      this.crew.spawnIntro();
      this.lastFrame = performance.now();
      this.flownInAt = this.lastFrame;
      this.frameHandle = requestAnimationFrame((t) => this.frame(t));
      this.stage.logo.classList.add('on');
      this.stage.hud.classList.add('on');
    }

    bindEvents() {
      const on = (target, type, fn, options) => {
        target.addEventListener(type, fn, options);
        this.unbind.push(() => target.removeEventListener(type, fn, options));
      };
      on(window, 'scroll', () => {
        view.sync();
        this.stage.syncScroll();
      }, { passive: true, capture: true });
      // The overlay only passes scrolling on to the window by itself, so forward it to an inner scroller.
      const { host } = this.stage;
      on(host, 'wheel', (e) => {
        if (!view.el) return;
        e.preventDefault();
        view.el.scrollBy({ top: e.deltaY, left: e.deltaX, behavior: 'instant' });
      }, { passive: false });
      let touchY = null;
      on(host, 'touchstart', (e) => { touchY = e.touches[0].clientY; }, { passive: true });
      on(host, 'touchmove', (e) => {
        if (!view.el || touchY == null) return;
        view.el.scrollBy({ top: touchY - e.touches[0].clientY, behavior: 'instant' });
        touchY = e.touches[0].clientY;
      }, { passive: true });
      on(window, 'resize', () => {
        // The canvas is a snapshot of one layout; a width change invalidates it.
        // (Height changes are ignored: mobile address bars resize constantly.)
        if (Math.abs(innerWidth - this.width) > 2) this.close(true);
        else view.measure();
      });
      on(window, 'wheel', () => { if (this.crew.ready) this.crew.begin(); }, { passive: true });
      on(window, 'pointermove', (e) => { this.crew.mouse = { x: e.clientX, y: e.clientY }; }, { passive: true });
      on(document.documentElement, 'pointerleave', () => { this.crew.mouse = null; });
      on(window, 'keydown', (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          this.close(this.complete);
        } else if ((e.key === 'm' || e.key === 'M') && !e.metaKey && !e.ctrlKey && !e.altKey) {
          this.toggleSound();
        } else if (view.el) {
          const page = view.height * 0.9;
          const by = { PageDown: page, PageUp: -page, ArrowDown: 80, ArrowUp: -80, ' ': page }[e.key];
          if (by) view.el.scrollBy({ top: by, behavior: 'instant' });
        }
      }, true);
      on(this.stage.hud, 'click', (e) => {
        const button = e.target.closest('button');
        if (!button) return;
        const action = button.dataset.do;
        if (action === 'skip') this.close(false);
        else if (action === 'live') this.close(true);
        else if (action === 'replay') replay();
        else if (action === 'sound') this.toggleSound();
        else if (action === 'tour') {
          this.tour = !this.tour;
          button.classList.toggle('touring', this.tour);
          button.textContent = this.tour ? 'Touring' : 'Tour';
          if (this.tour) this.crew.begin();
        } else if (action === 'speed') {
          const speeds = [1, 2, 3];
          this.speedIndex = (this.speedIndex + 1) % speeds.length;
          this.crew.speed = speeds[this.speedIndex];
          button.textContent = `${speeds[this.speedIndex]}×`;
        }
      });
    }

    toggleSound() {
      this.chime.toggle();
      this.stage.paintSoundButton(this.chime.on);
    }

    frame(now) {
      if (this.dead) return;
      const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      try {
        view.sync();
        this.stage.keepHudInView();
        this.crew.step(dt);
        if (this.tour) this.stepTour(dt);
        this.stage.paint(this.crew);
        if (!this.hudAt || now - this.hudAt > 200) {
          this.hudAt = now;
          this.updateHud();
        }
      } catch (err) {
        // A visitor must never be stuck behind a broken canvas: hand them the real page.
        console.error('[livebuild]', err);
        this.close(false);
        return;
      }
      this.frameHandle = requestAnimationFrame((t) => this.frame(t));
    }

    stepTour(dt) {
      const { crew } = this;
      if (!crew.building) return;
      if (view.scrollTop >= view.maxScroll() - 1) {
        this.tourSpeed = 0;
        return;
      }
      const workers = Math.max(SETTINGS.minAgents, crew.agents.filter((a) => !a.leaving).length);
      const backlog = crew.unfinishedInReach();
      const goal = backlog <= Math.max(4, workers * 0.6) ? 230 : backlog <= workers * 1.5 ? 80 : 0;
      this.tourSpeed += (goal - this.tourSpeed) * Math.min(1, dt * 2.5);
      this.tourCarry += this.tourSpeed * dt;
      if (this.tourCarry >= 1) {
        const step = Math.floor(this.tourCarry);
        this.tourCarry -= step;
        view.scrollBy(step);
      }
    }

    updateHud() {
      const { crew, stage } = this;
      if (!crew.ready || this.complete) return;
      const total = crew.jobs.length;
      const done = crew.doneJobs;
      const SEP = '<span class="sep"></span>';
      const tourButton = stage.shadow.querySelector('[data-do="tour"]');
      if (!crew.building) {
        stage.status.innerHTML = `<b>${crew.agents.length}</b> agents ready${SEP}${total.toLocaleString()} layers`;
      } else {
        const workers = crew.agents.filter((a) => a.worked).length + crew.retired;
        const stalled = !this.tour && crew.workBelowFold() && crew.unfinishedInReach() === 0;
        stage.status.innerHTML = stalled
          ? 'Scroll down to keep building'
          : `<b>${workers}</b> agents${SEP}<b>${done.toLocaleString()}</b> / ${total.toLocaleString()} layers`;
        tourButton.classList.toggle('nudge', stalled);
      }
      stage.barFill.style.width = total ? `${(done / total) * 100}%` : '0%';
      const busy = crew.agents.filter((a) => a.job).slice(-5);
      const key = busy.map((a) => a.id).join();
      if (key !== this.dotsKey) {
        this.dotsKey = key;
        stage.dots.innerHTML = busy.map((a) => `<i style="background:${a.color}" title="${a.name}">${a.name[0]}</i>`).join('');
      }
    }

    finish() {
      this.complete = true;
      const { crew, stage } = this;
      this.chime.finale();
      const workers = crew.agents.filter((a) => a.worked).length + crew.retired;
      stage.status.innerHTML = `Built by <b>${workers}</b> agents in <b>${(crew.endedAt - crew.startedAt).toFixed(1)}s</b>`;
      stage.barFill.style.width = '100%';
      stage.dots.innerHTML = '';
      const button = (name) => stage.shadow.querySelector(`[data-do="${name}"]`);
      button('live').hidden = false;
      button('replay').hidden = false;
      button('tour').hidden = true;
      button('speed').hidden = true;
      button('skip').hidden = true;
      this.tour = false;
      button('live').focus({ preventScroll: true });
    }

    teardown() {
      this.dead = true;
      cancelAnimationFrame(this.frameHandle);
      for (const off of this.unbind) off();
      this.unbind = [];
    }

    /** reveal: agents leave and the canvas fades. Otherwise a quick cut to the site. */
    close(reveal) {
      if (this.closing) return;
      this.closing = true;
      if (current === this) current = null;
      document.body.inert = false;
      try { sessionStorage.setItem(SEEN_KEY, '1'); } catch (_) { /* private mode */ }
      this.chime.close();
      const { host, hud } = this.stage;
      if (reveal && this.crew.building) {
        this.crew.releasing = true;
        this.crew.finished = true;
        for (const agent of this.crew.agents) {
          agent.script = null;
          agent.flying = false;
          agent.marks = null;
        }
        hud.classList.remove('on');
        setTimeout(() => host.style.setProperty('opacity', '0', 'important'), 450);
        setTimeout(() => {
          this.teardown();
          host.remove();
        }, 1150);
      } else {
        this.teardown();
        host.style.setProperty('transition', 'opacity .25s ease', 'important');
        host.style.setProperty('opacity', '0', 'important');
        setTimeout(() => host.remove(), 260);
      }
    }
  }

  function replay() {
    if (current) {
      const old = current;
      current = null;
      old.closing = true;
      old.teardown();
      old.chime.close();
      old.stage.host.remove();
    }
    current = new Show(false);
    current.play();
  }

  // Always build from the top of the page, including after a reload.
  history.scrollRestoration = 'manual';

  current = new Show(true);
  current.play();
  window.liveBuild = {
    replay,
    skip: () => { if (current) current.close(false); },
    get show() { return current; },
  };
})();
