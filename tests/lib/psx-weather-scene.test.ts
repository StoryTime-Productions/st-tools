import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as THREE from "three";
import { SCENE_CONDITIONS, type SceneCondition } from "@/lib/weather-codes";
import { sceneLayout, type SceneLayout } from "@/lib/psx-weather/config";
import { LOOP_FRAMES, createPsxScene, type PsxOptions } from "@/lib/psx-weather/scene";

type FakeRenderer = {
  params: unknown;
  setPixelRatio: ReturnType<typeof vi.fn>;
  setSize: ReturnType<typeof vi.fn>;
  setClearColor: ReturnType<typeof vi.fn>;
  setRenderTarget: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
};
type Shared = {
  renderers: FakeRenderer[];
  targets: Array<{ dispose: ReturnType<typeof vi.fn> }>;
  lambert: THREE.Material[];
};

const shared = vi.hoisted(() => ({ renderers: [], targets: [], lambert: [] }) as Shared);

// Only the GPU pieces are faked; geometry, materials and math stay real so the whole scene is built.
vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class WebGLRenderer {
    params: unknown;
    outputColorSpace = "";
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    setClearColor = vi.fn();
    setRenderTarget = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
    constructor(params: unknown) {
      this.params = params;
      shared.renderers.push(this as unknown as FakeRenderer);
    }
  }
  class WebGLRenderTarget {
    texture = {};
    dispose = vi.fn();
    constructor() {
      shared.targets.push(this);
    }
  }
  class MeshLambertMaterial extends actual.MeshLambertMaterial {
    constructor(parameters?: ConstructorParameters<typeof actual.MeshLambertMaterial>[0]) {
      super(parameters);
      shared.lambert.push(this);
    }
  }
  return { ...actual, WebGLRenderer, WebGLRenderTarget, MeshLambertMaterial };
});

const canvas = {} as HTMLCanvasElement;
const lastRenderer = () => shared.renderers[shared.renderers.length - 1];
const mainScene = () => lastRenderer().render.mock.calls[0][0] as THREE.Scene;

function visibleMeshesWithColor(scene: THREE.Scene, hex: number) {
  const found: THREE.Mesh[] = [];
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const material = mesh.material as THREE.MeshBasicMaterial | undefined;
    if (mesh.isMesh && material?.color?.getHex() === hex && mesh.visible) found.push(mesh);
  });
  return found;
}

// the real dashboard card at desktop (600x220, heading ends at 360), tablet, a long-text desktop card, phone and small-phone widths
const LAYOUTS: Record<string, SceneLayout> = {
  desktop: sceneLayout(600, 220, 360),
  roomy: sceneLayout(852, 220, 360),
  tight: sceneLayout(600, 220, 430),
  phone: sceneLayout(358, 188, 293),
  small: sceneLayout(328, 188, 293),
};
const halfWidthOf = (layout: SceneLayout) => (layout.pixelWidth * 0.05) / 2;
const freeLeftOf = (layout: SceneLayout) =>
  -halfWidthOf(layout) + 2 * halfWidthOf(layout) * layout.textFraction;

function build(options: Partial<PsxOptions> & { condition: SceneCondition }) {
  return createPsxScene(canvas, { layout: LAYOUTS.desktop, ...options });
}

beforeEach(() => {
  shared.renderers.length = 0;
  shared.targets.length = 0;
  shared.lambert.length = 0;
});

describe("createPsxScene", () => {
  it.each(SCENE_CONDITIONS.flatMap((c) => Object.keys(LAYOUTS).map((l) => [c, l] as const)))(
    "builds and draws a full loop for %s on the %s card",
    (condition, layoutName) => {
      const scene = build({ condition, layout: LAYOUTS[layoutName] });
      for (const minutes of [0, 390, 450, 720, 1005, 1050, 1380]) {
        scene.setTime(minutes);
        for (let frame = 0; frame < LOOP_FRAMES; frame += 17) scene.setFrame(frame);
      }
      expect(lastRenderer().render).toHaveBeenCalled();
    }
  );

  it("renders a 90px tall framebuffer whose width follows the card, so pixels stay square", () => {
    build({ condition: "rain" });
    expect(lastRenderer().setSize).toHaveBeenCalledWith(245, 90, false);
    build({ condition: "rain", layout: LAYOUTS.roomy });
    expect(lastRenderer().setSize).toHaveBeenCalledWith(349, 90, false);
    build({ condition: "rain", layout: LAYOUTS.phone });
    expect(lastRenderer().setSize).toHaveBeenCalledWith(171, 90, false);
  });

  it("draws the scene into the low-res target, then the dither pass to the canvas", () => {
    const scene = build({ condition: "clear" });
    scene.setFrame(5);
    const renderer = lastRenderer();
    expect(
      renderer.setRenderTarget.mock.calls.map((c) => (c[0] === null ? "screen" : "target"))
    ).toEqual(["target", "screen"]);
    expect(renderer.render).toHaveBeenCalledTimes(2);
  });

  it("wraps frame numbers so the loop is seamless", () => {
    const scene = build({ condition: "rain" });
    const drops = () => visibleMeshesWithColor(mainScene(), 0x7fa6e6).map((m) => m.position.y);
    scene.setFrame(0);
    const first = drops();
    scene.setFrame(LOOP_FRAMES);
    expect(drops()).toEqual(first);
    scene.setFrame(-LOOP_FRAMES);
    expect(drops()).toEqual(first);
    scene.setFrame(1);
    expect(drops()).not.toEqual(first);
  });

  it("snaps rain to whole pixels", () => {
    const scene = build({ condition: "rain" });
    scene.setFrame(7);
    const px = 19 / 380;
    for (const drop of visibleMeshesWithColor(mainScene(), 0x7fa6e6)) {
      expect(drop.position.y / px).toBeCloseTo(Math.round(drop.position.y / px), 6);
      expect(drop.position.x / px).toBeCloseTo(Math.round(drop.position.x / px), 6);
    }
  });

  it("keeps precipitation in the free area to the right of the text", () => {
    for (const [name, fraction] of [
      ["desktop", 0.236],
      ["roomy", 0.236],
      ["phone", 0.15],
      ["small", 0.5],
    ] as const) {
      const layout = LAYOUTS[name];
      const scene = build({ condition: "snow", layout });
      const minX = freeLeftOf(layout) + fraction * (halfWidthOf(layout) - freeLeftOf(layout));
      for (const frame of [3, 40, 90]) {
        scene.setFrame(frame);
        for (const flake of visibleMeshesWithColor(mainScene(), 0xf1f5f9)) {
          expect(flake.position.x).toBeGreaterThanOrEqual(minX - 0.35 - 0.1);
          expect(flake.position.x).toBeLessThanOrEqual(halfWidthOf(layout) + 0.2);
        }
      }
    }
  });

  it("scales the number of drops to the free area", () => {
    const dropsOn = (layout: SceneLayout) => {
      build({ condition: "rain", layout }).setFrame(0);
      return visibleMeshesWithColor(mainScene(), 0x7fa6e6).length;
    };
    const roomy = dropsOn(LAYOUTS.roomy);
    const desktop = dropsOn(LAYOUTS.desktop);
    const phone = dropsOn(LAYOUTS.phone);
    expect(roomy).toBeGreaterThan(desktop);
    expect(desktop).toBeGreaterThan(phone);
    expect(phone).toBeGreaterThanOrEqual(6);
  });

  it("keeps the sun to the right of the heading and inside the frame on every card", () => {
    for (const name of Object.keys(LAYOUTS)) {
      const layout = LAYOUTS[name];
      const scene = build({ condition: "clear", layout, minutes: 390 });
      scene.setFrame(0);
      const [sun] = mainScene().children.filter((child) => child.type === "Group");
      for (const minutes of [395, 520, 697, 880, 1000]) {
        scene.setTime(minutes);
        expect(sun.position.x).toBeGreaterThanOrEqual(freeLeftOf(layout));
        expect(sun.position.x).toBeLessThanOrEqual(halfWidthOf(layout));
      }
    }
  });

  it("shrinks the sun on cards with little free room", () => {
    const sunScale = (layout: SceneLayout) => {
      const scene = build({ condition: "clear", layout, minutes: 697 });
      scene.setFrame(0);
      return mainScene().children.find((child) => child.type === "Group")!.scale.x;
    };
    expect(sunScale(LAYOUTS.roomy)).toBe(1);
    expect(sunScale(LAYOUTS.tight)).toBeLessThan(1);
    expect(sunScale(LAYOUTS.tight)).toBeGreaterThan(0.5);
    expect(sunScale(LAYOUTS.phone)).toBe(0.5);
    expect(sunScale(LAYOUTS.small)).toBe(0.5);
  });

  it("moves the fog and the fade with the text so the left stays dark", () => {
    for (const name of Object.keys(LAYOUTS)) {
      const layout = LAYOUTS[name];
      build({ condition: "fog", layout }).setFrame(0);
      const fade = mainScene().children.find(
        (child) => (child as THREE.Mesh).renderOrder === 999
      ) as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
      const { e0, e1 } = fade.material.uniforms;
      // dark before the text ends, clear well into the free area
      expect(e0.value).toBeLessThan(freeLeftOf(layout));
      expect(e1.value).toBeGreaterThan(freeLeftOf(layout));
      expect(e1.value).toBeLessThanOrEqual(halfWidthOf(layout) + 1.5);
    }
  });

  it("shows the sun by day and the moon by night, never both", () => {
    const scene = build({ condition: "clear", minutes: 720 });
    scene.setFrame(0);
    const [sun, moon] = mainScene().children.filter((child) => child.type === "Group");
    expect([sun.visible, moon.visible]).toEqual([true, false]);
    scene.setTime(1380);
    expect([sun.visible, moon.visible]).toEqual([false, true]);
  });

  it("moves the sun along its arc from sunrise to noon to sunset", () => {
    const scene = build({ condition: "clear", minutes: 390, sunrise: 390, sunset: 1005 });
    scene.setFrame(0);
    const [sun] = mainScene().children.filter((child) => child.type === "Group");
    const atSunrise = sun.position.clone();
    scene.setTime(697);
    const atNoon = sun.position.clone();
    scene.setTime(1005);
    const atSunset = sun.position.clone();
    expect(atNoon.y).toBeGreaterThan(atSunrise.y);
    expect(atNoon.y).toBeGreaterThan(atSunset.y);
    expect(atSunset.x).toBeGreaterThan(atSunrise.x);
  });

  it("only shows stars after sunset and hides them again before sunrise", () => {
    const scene = build({ condition: "clear", sunrise: 390, sunset: 1005 });
    const starsAt = (minutes: number) => {
      scene.setTime(minutes);
      let most = 0;
      for (let frame = 0; frame < LOOP_FRAMES; frame += 3) {
        scene.setFrame(frame);
        most = Math.max(most, visibleMeshesWithColor(mainScene(), 0xe8eefc).length);
      }
      return most;
    };
    expect(starsAt(720)).toBe(0);
    expect(starsAt(1005)).toBe(0); // the sun has only just set
    expect(starsAt(380)).toBe(0); // ten minutes before sunrise the stars are already gone
    expect(starsAt(300)).toBeGreaterThan(0); // deep in the night they are out
    expect(starsAt(1380)).toBeGreaterThan(0);
  });

  it("follows the sky palette: warm at sunrise, dark at night", () => {
    const scene = build({ condition: "clear" });
    const sky = () =>
      mainScene().children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    scene.setTime(390);
    scene.setFrame(0);
    const sunrise = sky().material.uniforms.uTint.value.clone();
    scene.setTime(1380);
    const night = sky().material.uniforms.uTint.value.clone();
    expect(sunrise.r).toBeGreaterThan(night.r);
    expect(sunrise.r).toBeGreaterThan(sunrise.b * 0.5);
    expect(night.b).toBeGreaterThan(night.r);
  });

  it("tints non-celestial conditions by the clock too and dims them at night", () => {
    const scene = build({ condition: "overcast" });
    scene.setFrame(0);
    const sky = () =>
      mainScene().children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    scene.setTime(720);
    const day = sky().material.uniforms.uTint.value.clone();
    scene.setTime(1380);
    const night = sky().material.uniforms.uTint.value.clone();
    expect(day.r + day.g + day.b).toBeGreaterThan(night.r + night.g + night.b);
  });

  it("flashes the storm sky for three soft frames per loop", () => {
    const scene = build({ condition: "storm" });
    const flash = () =>
      (mainScene().children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>).material
        .uniforms.uFlash.value as number;
    scene.setFrame(50);
    expect(flash()).toBe(0);
    scene.setFrame(100);
    expect(flash()).toBeCloseTo(0.1);
    scene.setFrame(101);
    expect(flash()).toBeCloseTo(0.22);
    scene.setFrame(102);
    expect(flash()).toBeCloseTo(0.08);
    scene.setFrame(103);
    expect(flash()).toBe(0);
  });

  it("snaps cloud vertices to the pixel grid through the shader", () => {
    build({ condition: "overcast" });
    const material = shared.lambert[0];
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: "#include <project_vertex>",
    };
    material.onBeforeCompile(shader as never, null as never);
    expect(shader.uniforms.uRes).toBeDefined();
    expect(shader.vertexShader).toContain("floor(gl_Position.xy");
  });

  it("releases the GPU resources on dispose", () => {
    const scene = build({ condition: "fog" });
    scene.dispose();
    expect(lastRenderer().dispose).toHaveBeenCalled();
    expect(shared.targets[shared.targets.length - 1].dispose).toHaveBeenCalled();
  });
});
