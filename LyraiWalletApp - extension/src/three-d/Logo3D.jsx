import { useEffect, useRef, useState } from "react";
import "./logo-3d.css";

// The Lyra logo as a polished 3D model, slowly turning and floating.
// Used on the entry screens (welcome and unlock).
//
// The model lives in public/models/. Either a single .glb or a .gltf
// (with its .bin/textures next to it) works; the first one found wins.
// If none is there or WebGL is unavailable, the flat /logo.svg is shown
// instead, so the entry screens never break.
const MODEL_URLS = ["/models/lyra-logo.glb", "/models/lyra-logo.gltf"];

// Loaded and polished once, then cloned for every mount (the welcome and
// unlock screens share it, and React StrictMode mounts twice in dev).
let templatePromise = null;

export default function Logo3D({ className = "" }) {
  const mountRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    startScene(mountRef.current, () => disposed)
      .then(stop => {
        if (disposed) { stop(); return; }
        cleanup = stop;
        setReady(true);
      })
      .catch(err => {
        console.warn("[Logo3D] 3D logo unavailable, using the flat logo:", err?.message || err);
      });

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return (
    <div className={`logo-3d ${className}`} aria-hidden="true">
      <div ref={mountRef} className={`logo-3d-canvas${ready ? " is-ready" : ""}`} />
      {!ready && <img className="logo-3d-fallback" src="/logo.svg" alt="" />}
    </div>
  );
}

function loadTemplate() {
  if (!templatePromise) {
    // three.js is only fetched for the entry screens, never bundled into
    // the main chunk.
    templatePromise = Promise.all([
      import("three"),
      import("three/examples/jsm/loaders/GLTFLoader.js"),
      import("three/examples/jsm/utils/BufferGeometryUtils.js"),
    ]).then(async ([THREE, { GLTFLoader }, { toCreasedNormals }]) => {
      const gltf = await loadFirst(new GLTFLoader(), MODEL_URLS);
      polish(gltf.scene, THREE, toCreasedNormals);
      return { THREE, gltf };
    });
    // A failed load (no model yet, offline) can be retried on next mount.
    templatePromise.catch(() => { templatePromise = null; });
  }
  return templatePromise;
}

async function startScene(mount, isDisposed) {
  if (!mount) throw new Error("no mount node");

  const { THREE, gltf } = await loadTemplate();
  if (isDisposed()) return () => {};

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pearlEnvironment(THREE, pmrem);
  scene.environment = envTexture;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 4.2);

  // Pearl-white lighting: white from above, soft lilac from below, so the
  // shaded sides read as lilac instead of grey.
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9a6ff, 1.1));
  const rim = new THREE.DirectionalLight(0xd9ccff, 2.4);
  rim.position.set(-2.5, 1.5, -2);
  scene.add(rim);
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(2, 2.5, 3);
  scene.add(key);

  // Clones share geometry and materials with the cached template.
  const model = gltf.scene.clone(true);

  // Centre the model and scale it to a fixed size whatever units it was
  // exported in.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);
  const pivot = new THREE.Group();
  pivot.add(model);
  pivot.scale.setScalar(1.9 / Math.max(size.x, size.y, size.z || 1e-6));
  scene.add(pivot);

  // Play any animation baked into the file as well.
  const mixer = gltf.animations?.length ? new THREE.AnimationMixer(model) : null;
  gltf.animations?.forEach(clip => mixer.clipAction(clip).play());

  mount.appendChild(renderer.domElement);

  function resize() {
    const w = mount.clientWidth || 1;
    const h = mount.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const clock = new THREE.Clock();
  let raf = 0;

  function frame() {
    const dt = clock.getDelta();
    const t = clock.elapsedTime;
    if (!reduceMotion) {
      pivot.rotation.y = t * 1.2;                    // slow turn
      pivot.rotation.x = Math.sin(t * 1.1) * 0.12;   // slight tilt
      pivot.position.y = Math.sin(t * 1.8) * 0.06;   // gentle float
      mixer?.update(dt);
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  frame();

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    mixer?.stopAllAction();
    envTexture.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

async function loadFirst(loader, urls) {
  let lastErr;
  for (const url of urls) {
    try {
      return await loader.loadAsync(url);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("no model found");
}

// Reflections come from a soft white-to-lilac gradient with no dark areas,
// so the edges never pick up black or grey streaks.
function pearlEnvironment(THREE, pmrem) {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.5, "#f1ecff");
  grad.addColorStop(1, "#c9b8ff");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const env = pmrem.fromEquirectangular(tex).texture;
  tex.dispose();
  return env;
}

// "Polished, no hard edges": smooth every edge up to ~110 degrees so faces
// blend into each other. Sharper folds (thin tips, where front and back
// faces would cancel out and render black) keep their own normals. Then a
// pearl-white, softly glossy, non-metallic finish.
function polish(root, THREE, toCreasedNormals) {
  root.traverse(obj => {
    if (!obj.isMesh) return;

    obj.geometry = toCreasedNormals(obj.geometry, Math.PI * 0.6);

    const toPhysical = src => {
      const m = new THREE.MeshPhysicalMaterial({
        color: 0xf7f4ff,
        emissive: 0xffffff,
        emissiveIntensity: 0.12,
        transparent: !!src.transparent,
        opacity: src.opacity ?? 1,
        metalness: 0,
        roughness: 0.3,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
        sheen: 1,
        sheenRoughness: 0.35,
        sheenColor: 0xd6c8ff,
        envMapIntensity: 0.8,
      });
      m.flatShading = false;
      src.dispose?.();
      return m;
    };

    obj.material = Array.isArray(obj.material)
      ? obj.material.map(toPhysical)
      : toPhysical(obj.material);
  });
}
