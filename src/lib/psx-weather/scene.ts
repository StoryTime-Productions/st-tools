import * as THREE from "three";
import type { SceneCondition } from "@/lib/weather-codes";
import { FPS, LOOP_FRAMES, type SceneLayout } from "./config";
import { FALLBACK_SUNRISE, FALLBACK_SUNSET, todFromMinutes, type TimeOfDay } from "./time-of-day";

/*
 * 3D PSX weather scene, drawn live into a tiny canvas. Deterministic: setFrame(i) draws loop frame i
 * of LOOP_FRAMES and setTime(minutes) moves the clock (sun / moon arc, sky palette, light).
 * Real PS1 traits: vertices snapped to the pixel grid, flat low-poly shading, a fixed low-resolution
 * framebuffer, an 8x8 Bayer ordered dither onto a 32-level palette, a choppy frame rate.
 */

export { FPS, LOOP_FRAMES };

export type PsxOptions = {
  condition: SceneCondition;
  /** framing derived from the card's real size and text extent (see sceneLayout) */
  layout: SceneLayout;
  /** minutes since local midnight at the weather location */
  minutes?: number;
  sunrise?: number;
  sunset?: number;
};

export type PsxScene = {
  setFrame: (frame: number) => void;
  setTime: (minutes: number) => TimeOfDay;
  dispose: () => void;
};

const DARK = 0x020617;
const COND_TINT: Record<SceneCondition, number> = {
  clear: 0x2a4f86,
  partly: 0x27456f,
  overcast: 0x2b3648,
  fog: 0x28323d,
  drizzle: 0x1b3a66,
  rain: 0x173a66,
  snow: 0x27445f,
  storm: 0x251752,
};
const CLOUD_COL: Record<SceneCondition, number> = {
  partly: 0x8a98b4,
  clear: 0x7585a5,
  overcast: 0x66728a,
  drizzle: 0x5a6680,
  rain: 0x4f5b74,
  snow: 0x8a98b4,
  storm: 0x4e4773,
  fog: 0x66728a,
};
// solar altitude (-1..1) -> sky tint; the warm band right at the horizon gives dawn and dusk
const SKY_STOPS: ReadonlyArray<readonly [number, number]> = [
  [-1.0, 0x0c1440],
  [-0.35, 0x141c4a],
  [-0.12, 0x2b2866],
  [0.0, 0x8a4a58],
  [0.12, 0x4a5f9a],
  [0.35, 0x2d5590],
  [1.0, 0x2a4f86],
];
const P = 9.5; // cloud pattern period (m): the drift loops seamlessly
// [x, y, size, seed]
const CLOUDS: Record<SceneCondition, ReadonlyArray<readonly [number, number, number, number]>> = {
  clear: [[8.0, 1.55, 0.55, 13]],
  partly: [
    [1.2, -1.9, 1.3, 11],
    [5.4, -2.2, 1.6, 12],
    [8.0, 1.55, 0.85, 13],
  ],
  overcast: [
    [1.0, 1.8, 1.5, 21],
    [5.0, 2.1, 1.7, 22],
    [8.2, -1.9, 1.5, 23],
  ],
  fog: [],
  drizzle: [
    [2.0, 2.2, 1.5, 31],
    [7.2, 2.4, 1.8, 32],
    [4.6, -2.5, 1.3, 33],
  ],
  rain: [
    [2.0, 2.2, 1.5, 31],
    [7.2, 2.4, 1.8, 32],
    [4.6, -2.5, 1.3, 33],
  ],
  snow: [
    [2.5, 2.3, 1.4, 41],
    [7.0, 2.4, 1.6, 42],
  ],
  storm: [
    [1.5, 2.3, 1.7, 51],
    [6.5, 2.5, 2.0, 52],
    [4.0, -2.5, 1.5, 53],
  ],
};

const rng = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const sstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const phase = (frame: number) => frame / LOOP_FRAMES;
const col = (hex: number) => new THREE.Color(hex);

const GLOW_VERTEX =
  "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }";
const WORLD_VERTEX =
  "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }";

function glowMaterial(hex: number, strength: number, power: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uC: { value: col(hex) }, uS: { value: strength }, uP: { value: power } },
    vertexShader: GLOW_VERTEX,
    fragmentShader:
      "varying vec2 vUv; uniform vec3 uC; uniform float uS; uniform float uP; void main(){ float d = length(vUv*2.-1.); float a = pow(max(0.,1.-d), uP) * uS; gl_FragColor = vec4(uC*a, 1.); }",
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

/** PS1 vertex snapping: positions are rounded to the framebuffer's pixel grid after projection */
function snapped<T extends THREE.Material>(material: T, width: number, height: number): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRes = { value: new THREE.Vector2(width, height) };
    shader.vertexShader =
      "uniform vec2 uRes;\n" +
      shader.vertexShader.replace(
        "#include <project_vertex>",
        `#include <project_vertex>
         vec2 g = uRes * 0.5;
         gl_Position.xy = floor(gl_Position.xy / gl_Position.w * g + 0.5) / g * gl_Position.w;`
      );
  };
  return material;
}

export function createPsxScene(
  canvas: HTMLCanvasElement,
  {
    condition,
    layout,
    minutes = 720,
    sunrise = FALLBACK_SUNRISE,
    sunset = FALLBACK_SUNSET,
  }: PsxOptions
): PsxScene {
  const W = layout.pixelWidth;
  const H = layout.pixelHeight;
  const corner = layout.size !== "wide";
  const compact = layout.size === "compact";
  const px = 0.05; // metres per framebuffer pixel
  const halfW = (W * px) / 2;
  const halfH = (H * px) / 2;
  // everything animated lives in the free area to the right of the text
  const freeLeft = -halfW + 2 * halfW * layout.textFraction;
  const freeWidth = halfW - freeLeft;
  const fx = (f: number) => freeLeft + f * freeWidth;
  // phone-width cards let the clouds and rain run under the text, but the sun, moon and stars stay in the
  // clear top-right corner (card fractions) so they never sit behind the heading
  const cornerSkyLeft = compact ? 0.9 : 0.88;
  const cx = (f: number) => -halfW + 2 * halfW * f;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    preserveDrawingBuffer: false,
    alpha: false,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(DARK);

  // half float: the dark navy only occupies a few 8-bit linear values and would band hard
  const target = new THREE.WebGLRenderTarget(W, H, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
    type: THREE.HalfFloatType,
  });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 60);
  camera.position.set(0, 0, 30);

  // ---- sky: horizontal ramp, lighter toward the horizon, soft glow around the sun / moon ----
  const flash = { value: 0 };
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uDark: { value: col(DARK) },
      uTint: { value: col(COND_TINT[condition]) },
      uFlash: flash,
      uGlowPos: { value: new THREE.Vector2(0, 0) },
      uGlowCol: { value: col(0x000000) },
      uHalfH: { value: halfH },
      uHW: { value: halfW },
    },
    vertexShader: WORLD_VERTEX,
    fragmentShader: `varying vec3 vW; uniform vec3 uDark; uniform vec3 uTint; uniform float uFlash; uniform vec2 uGlowPos; uniform vec3 uGlowCol; uniform float uHalfH; uniform float uHW;
      void main(){
        float tx = smoothstep(.13, 1.18, (vW.x + uHW) / (2. * uHW)); tx = tx * tx * (3. - 2. * tx);
        float v = clamp(vW.y / uHalfH * .5 + .5, 0., 1.);
        float t = tx * mix(1.0, 0.62, v);
        vec3 c = mix(uDark, uTint, t);
        float d = length(vW.xy - uGlowPos);
        c += uGlowCol * exp(-d * d / 14.) * .55;
        c += uFlash * vec3(.35,.3,.6) * tx;
        gl_FragColor = vec4(c,1.); }`,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), skyMaterial);
  sky.position.set(0, 0, -20);
  scene.add(sky);

  const ambient = new THREE.AmbientLight(0x7f90c0, 0.9);
  const keyLight = new THREE.DirectionalLight(0xfff0d0, 2.2);
  keyLight.position.set(6, 4, 8);
  scene.add(ambient, keyLight);

  const animators: Array<(frame: number) => void> = [];
  const clockUpdaters: Array<(tod: TimeOfDay) => void> = [];
  const celestialScale = corner ? 0.5 : Math.min(1, Math.max(0.5, freeWidth / 5));
  const arc = (p: number): [number, number] =>
    corner
      ? [
          cx(lerp(cornerSkyLeft, compact ? 0.97 : 0.956, p)),
          -halfH * (compact ? 0.35 : 0.5) + halfH * (compact ? 1.28 : 1.12) * Math.sin(Math.PI * p),
        ]
      : [fx(lerp(0.35, 0.8, p)), -halfH * 0.71 + halfH * 1.51 * Math.sin(Math.PI * p)];

  // ---- sun and moon (clear and partly cloudy) ----
  const hasCelestial = condition === "clear" || condition === "partly";
  if (hasCelestial) {
    const sunGroup = new THREE.Group();
    const haloMaterial = glowMaterial(0xffd070, 0.32, 2.6);
    const halo2Material = glowMaterial(0xffe9a0, 0.55, 2.0);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), haloMaterial);
    halo.position.z = -10;
    const halo2 = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 4.8), halo2Material);
    halo2.position.z = -9;
    const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    const sunMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), sunMaterial);
    sunMesh.position.z = -8;
    const rays = new THREE.Group();
    rays.position.z = -9.5;
    const rayCount = 15;
    for (let k = 0; k < rayCount; k++) {
      const a = (2 * Math.PI * k) / rayCount;
      const ray = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.max(0.2, px * 1.5), 2.6),
        new THREE.MeshBasicMaterial({
          color: 0xffd98a,
          transparent: true,
          opacity: 0.05,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      ray.position.set(Math.cos(a) * 2.9, Math.sin(a) * 2.9, 0);
      ray.rotation.z = a - Math.PI / 2;
      rays.add(ray);
    }
    sunGroup.add(halo, halo2, sunMesh, rays);
    sunGroup.scale.setScalar(celestialScale);
    scene.add(sunGroup);
    animators.push((frame) => {
      rays.rotation.z = -((2 * Math.PI) / rayCount) * phase(frame);
      const k = 1 + 0.05 * Math.sin(2 * Math.PI * phase(frame));
      halo.scale.setScalar(k);
      halo2.scale.setScalar(k);
    });
    const sunLow = col(0xff8a40);
    const sunHigh = col(0xffe9a8);
    const haloLow = col(0xff7a30);
    const haloHigh = col(0xffd070);
    clockUpdaters.push((tod) => {
      sunGroup.visible = tod.isDay;
      if (!tod.isDay) return;
      const [x, y] = arc(tod.p);
      sunGroup.position.set(x, y, 0);
      const k = sstep(0.0, 0.45, tod.alt);
      sunMaterial.color.copy(sunLow).lerp(sunHigh, k);
      haloMaterial.uniforms.uC.value.copy(haloLow).lerp(haloHigh, k);
      halo2Material.uniforms.uC.value.copy(sunLow).lerp(col(0xffe9a0), k);
      haloMaterial.uniforms.uS.value = lerp(0.5, 0.32, k);
      skyMaterial.uniforms.uGlowPos.value.set(x, y);
      skyMaterial.uniforms.uGlowCol.value.copy(col(0x6a3418)).lerp(col(0x4a3a18), k);
    });

    const moonGroup = new THREE.Group();
    const moon = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.6),
      new THREE.ShaderMaterial({
        vertexShader: GLOW_VERTEX,
        fragmentShader:
          "varying vec2 vUv; void main(){ vec2 p = vUv*2.-1.; float a = step(length(p),.9) * (1. - step(length(p-vec2(.45,.2)),.8)); if(a<.5) discard; float shade = smoothstep(-.9,.9,-p.y+.2); gl_FragColor = vec4(mix(vec3(.80,.85,.93), vec3(.45,.50,.62), shade), 1.); }",
      })
    );
    moon.position.z = -8;
    const moonHalo = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      glowMaterial(0x7f95c8, 0.28, 2.2)
    );
    moonHalo.position.z = -9;
    moonGroup.add(moonHalo, moon);
    moonGroup.scale.setScalar(celestialScale);
    scene.add(moonGroup);
    clockUpdaters.push((tod) => {
      moonGroup.visible = !tod.isDay;
      if (tod.isDay) return;
      const [x, y] = arc(tod.p);
      moonGroup.position.set(x, y, 0);
      skyMaterial.uniforms.uGlowPos.value.set(x, y);
      skyMaterial.uniforms.uGlowCol.value.copy(col(0x1a2548));
    });

    // stars: only after sunset, gone before sunrise
    const starRandom = rng(7);
    const starCount = corner ? 8 : 16;
    const stars: Array<{ mesh: THREE.Mesh; per: number; off: number; k: number }> = [];
    for (let k = 0; k < starCount; k++) {
      const star = new THREE.Mesh(
        new THREE.PlaneGeometry(px * 1.6, px * 1.6),
        new THREE.MeshBasicMaterial({ color: 0xe8eefc })
      );
      star.position.set(
        corner ? cx(lerp(cornerSkyLeft, 0.99, starRandom())) : fx(lerp(0.15, 0.97, starRandom())),
        corner
          ? lerp(halfH * 0.15, halfH * 0.95, starRandom())
          : lerp(-halfH * 0.7, halfH * 0.9, starRandom()),
        -9
      );
      scene.add(star);
      stars.push({
        mesh: star,
        per: 4 + Math.floor(starRandom() * 8),
        off: Math.floor(starRandom() * 12),
        k,
      });
    }
    let starsOn = 0;
    clockUpdaters.push((tod) => {
      starsOn = Math.floor(starCount * clamp01((-tod.alt - 0.03) / 0.4));
    });
    animators.push((frame) =>
      stars.forEach((star) => {
        star.mesh.visible = star.k < starsOn && Math.floor((frame + star.off) / star.per) % 2 === 0;
      })
    );
  }

  // ---- low-poly clouds: flat shading, vertex snapping, seamless drift ----
  const cloudDefs = CLOUDS[condition];
  let cloudMaterial: THREE.MeshLambertMaterial | null = null;
  if (cloudDefs.length) {
    const cloudGroup = new THREE.Group();
    scene.add(cloudGroup);
    cloudMaterial = snapped(
      new THREE.MeshLambertMaterial({ color: col(CLOUD_COL[condition]), flatShading: true }),
      W,
      H
    );
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    for (let tile = -2; tile <= 2; tile++) {
      for (const [x, y, size, seed] of cloudDefs) {
        const random = rng(seed);
        for (let k = 0; k < 5; k++) {
          const t = (k - 2) / 2;
          const blob = new THREE.Mesh(geometry, cloudMaterial);
          blob.position.set(
            tile * P + x + t * 0.95 * size,
            y + 0.3 * (1 - t * t) * size,
            -3 + random() * 0.4
          );
          blob.scale.set(
            0.95 * size * (1 - Math.abs(t) * 0.2),
            0.62 * size * (0.9 + random() * 0.2),
            0.7 * size
          );
          cloudGroup.add(blob);
        }
      }
    }
    animators.push((frame) => {
      cloudGroup.position.x = P * phase(frame);
    });
  }

  // ---- precipitation: positions snap to whole pixels, fall is periodic so the loop is seamless ----
  const random = rng(5);
  const precipitationMinX = fx(corner ? (compact ? 0.5 : 0.15) : 0.236);
  const density = Math.max(0.3, (halfW - precipitationMinX) / 8.1);
  const countFor = (base: number) => Math.max(6, Math.round(base * density));
  const particleMaterials: THREE.MeshBasicMaterial[] = [];
  const baseColors = new Map<THREE.MeshBasicMaterial, THREE.Color>();
  const squares = (count: number, wPx: number, hPx: number, color: number) => {
    const geometry = new THREE.PlaneGeometry(px * wPx, px * hPx);
    const material = new THREE.MeshBasicMaterial({ color });
    particleMaterials.push(material);
    baseColors.set(material, col(color));
    return Array.from({ length: count }, () => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.z = -2;
      scene.add(mesh);
      return {
        mesh,
        x: lerp(precipitationMinX, halfW - 0.2, random()),
        p0: 0,
        ph: random(),
      };
    });
  };
  const fallRange = halfH * 2 + 2;
  if (condition === "rain" || condition === "drizzle" || condition === "storm") {
    const heavy = condition !== "drizzle";
    const drops = squares(countFor(heavy ? 26 : 46), 1, heavy ? 6 : 3, heavy ? 0x7fa6e6 : 0x6a8fcf);
    drops.forEach((drop) => {
      drop.p0 = random() * fallRange;
      drop.mesh.position.x = Math.round(drop.x / px) * px;
    });
    animators.push((frame) =>
      drops.forEach((drop) => {
        const y = halfH + 1 - ((drop.p0 + 3 * fallRange * phase(frame)) % fallRange);
        drop.mesh.position.y = Math.round(y / px) * px;
      })
    );
  }
  if (condition === "snow") {
    const flakes = squares(countFor(22), 2, 2, 0xf1f5f9);
    flakes.forEach((flake) => {
      flake.p0 = random() * fallRange;
    });
    animators.push((frame) =>
      flakes.forEach((flake) => {
        const y = halfH + 1 - ((flake.p0 + 2 * fallRange * phase(frame)) % fallRange);
        flake.mesh.position.y = Math.round(y / px) * px;
        const sway = 0.35 * Math.sin(2 * Math.PI * (2 * phase(frame) + flake.ph));
        flake.mesh.position.x = Math.round((flake.x + sway) / px) * px;
      })
    );
  }

  // ---- fog: soft additive bands and haze, drifting slowly ----
  if (condition === "fog") {
    const bands = (
      [
        [1.2, 3.2, 0.088, 1],
        [-1.2, 3.6, 0.07, -1],
      ] as const
    ).map(([y, h, a, dir]) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(26, h),
        new THREE.ShaderMaterial({
          vertexShader: GLOW_VERTEX,
          fragmentShader: `varying vec2 vUv; void main(){ float v = 1. - abs(vUv.y*2.-1.); gl_FragColor = vec4(vec3(.75,.8,.86) * ${a.toFixed(3)} * smoothstep(0.,.8,v), 1.); }`,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
        })
      );
      mesh.position.set(fx(0.5), y, -5);
      scene.add(mesh);
      return { mesh, dir };
    });
    const blobs = (
      [
        [0.34, 1.4, 3.4],
        [0.67, -0.6, 3.8],
        [0.93, 1.2, 3.0],
        [0.54, -1.6, 2.8],
      ] as const
    ).map(([f, y, size], k) => {
      const x = fx(f);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        glowMaterial(0xaab4c0, 0.095, 1.1)
      );
      mesh.position.set(x, y, -4);
      mesh.scale.set(size * 2.4, size * 0.95, 1);
      scene.add(mesh);
      return { mesh, x, dir: k % 2 ? -1 : 1 };
    });
    animators.push((frame) => {
      const s = Math.sin(2 * Math.PI * phase(frame));
      bands.forEach(({ mesh, dir }) => {
        mesh.position.x = fx(0.5) + dir * 1.6 * s;
      });
      blobs.forEach(({ mesh, x, dir }) => {
        mesh.position.x = x + dir * 1.1 * s;
      });
    });
  }

  // ---- storm: one soft three-frame flash per loop ----
  if (condition === "storm") {
    animators.push((frame) => {
      flash.value = frame === 100 ? 0.1 : frame === 101 ? 0.22 : frame === 102 ? 0.08 : 0;
    });
  }

  // ---- text-safe fade: the scene is dark on the left, where the card text sits ----
  const fadeLength = Math.max(0.5 * freeWidth, 1.5);
  const fadeStart = freeLeft - 0.1 * fadeLength;
  const fadeEnd = freeLeft + 0.9 * fadeLength;
  const fade = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 30),
    new THREE.ShaderMaterial({
      uniforms: { uD: { value: col(DARK) }, e0: { value: fadeStart }, e1: { value: fadeEnd } },
      vertexShader: WORLD_VERTEX,
      fragmentShader:
        "varying vec3 vW; uniform vec3 uD; uniform float e0; uniform float e1; void main(){ float k = smoothstep(e0, e1, vW.x); k = k * k * (3. - 2. * k); gl_FragColor = vec4(uD, 1. - k); }",
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
  );
  fade.position.z = 25;
  fade.renderOrder = 999;
  scene.add(fade);

  // ---- post pass: quantise to 32 levels per channel with an 8x8 Bayer ordered dither ----
  const post = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: { tD: { value: target.texture }, uL: { value: 32 } },
      vertexShader:
        "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }",
      fragmentShader: `varying vec2 vUv; uniform sampler2D tD; uniform float uL;
        void main(){
          vec3 c = texture2D(tD, vUv).rgb; c = pow(c, vec3(1./2.2));
          int x = int(mod(gl_FragCoord.x, 8.)); int y = int(mod(gl_FragCoord.y, 8.));
          int xy = x ^ y;
          int bi = ((y & 1) << 5) | ((xy & 1) << 4) | ((y & 2) << 2) | ((xy & 2) << 1) | ((y & 4) >> 1) | ((xy & 4) >> 2);
          float b = (float(bi) + .5) / 64.;
          vec3 bb = vec3(b, fract(b + .3333), fract(b + .6667));
          vec3 q = floor(c * (uL - 1.) + bb) / (uL - 1.);
          gl_FragColor = vec4(q, 1.);
        }`,
      depthTest: false,
      depthWrite: false,
    })
  );
  const postScene = new THREE.Scene();
  postScene.add(post);
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // ---- clock: sky palette, light and everything that follows the sun ----
  const skyTint = new THREE.Color();
  const conditionColor = col(COND_TINT[condition]);
  function setTime(minutesNow: number): TimeOfDay {
    const tod = todFromMinutes(minutesNow, sunrise, sunset);
    const light = sstep(-0.2, 0.35, tod.alt);
    let from = SKY_STOPS[0];
    let to = SKY_STOPS[SKY_STOPS.length - 1];
    for (let k = 0; k < SKY_STOPS.length - 1; k++) {
      if (tod.alt >= SKY_STOPS[k][0] && tod.alt <= SKY_STOPS[k + 1][0]) {
        from = SKY_STOPS[k];
        to = SKY_STOPS[k + 1];
        break;
      }
    }
    skyTint.copy(col(from[1])).lerp(col(to[1]), (tod.alt - from[0]) / (to[0] - from[0]));
    if (hasCelestial) {
      skyMaterial.uniforms.uTint.value.copy(skyTint);
    } else {
      skyMaterial.uniforms.uTint.value
        .copy(conditionColor)
        .lerp(skyTint, 0.3)
        .multiplyScalar(0.4 + 0.6 * light);
    }
    if (tod.isDay) {
      const k = sstep(0.0, 0.45, tod.alt);
      keyLight.color.copy(col(0xff9a60)).lerp(col(0xfff0d0), k);
      keyLight.intensity = 0.6 + 1.7 * light;
      const [x, y] = arc(tod.p);
      keyLight.position.set(x - 2, y + 2, 8);
    } else {
      keyLight.color.set(0x6f86c8);
      keyLight.intensity = 0.7;
      keyLight.position.set(5, 3, 8);
    }
    ambient.color.copy(col(0x2a3560)).lerp(col(0x7f90c0), light);
    ambient.intensity = lerp(0.55, 0.9, light);
    cloudMaterial?.color.copy(col(CLOUD_COL[condition])).multiplyScalar(0.55 + 0.45 * light);
    particleMaterials.forEach((material) =>
      material.color.copy(baseColors.get(material)!).multiplyScalar(0.55 + 0.45 * light)
    );
    clockUpdaters.forEach((update) => update(tod));
    return tod;
  }
  setTime(minutes);

  function setFrame(frame: number) {
    const i = ((frame % LOOP_FRAMES) + LOOP_FRAMES) % LOOP_FRAMES;
    animators.forEach((animate) => animate(i));
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);
  }

  return {
    setFrame,
    setTime,
    dispose: () => {
      renderer.dispose();
      target.dispose();
    },
  };
}
