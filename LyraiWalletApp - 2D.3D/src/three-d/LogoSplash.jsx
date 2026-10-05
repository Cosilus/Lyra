import { useEffect, useRef, useState } from "react";
import "./logo-splash.css";

// Startup splash: the Lyra logo as a polished 3D model, spinning slowly
// and floating while the app boots, then fading out.
//
// The model lives in public/models/. Either a single .glb or a .gltf
// (with its .bin/textures next to it) works; the first one found wins.
// If none is there or WebGL is unavailable, the flat /logo.svg is shown
// instead so startup never breaks.
const MODEL_URLS = ["/models/lyra-logo.glb", "/models/lyra-logo.gltf"];

const MIN_VISIBLE_MS = 2200;  // splash never flashes by too quickly
const MAX_WAIT_MS = 5000;     // never hold the app back longer than this
const FADE_MS = 600;

export default function LogoSplash() {
  const mountRef = useRef(null);
  const [has3d, setHas3d] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let disposed = false;
    let cleanupScene = () => {};
    const start = performance.now();
    let finishing = false;

    function finish() {
      if (disposed || finishing) return;
      finishing = true;
      const wait = Math.max(0, MIN_VISIBLE_MS - (performance.now() - start));
      setTimeout(() => {
        if (disposed) return;
        setLeaving(true);
        setTimeout(() => !disposed && setGone(true), FADE_MS);
      }, wait);
    }

    const maxTimer = setTimeout(finish, MAX_WAIT_MS);

    // three.js is only fetched for the splash, never bundled into the
    // main chunk.
    startScene(mountRef.current, () => disposed)
      .then(cleanup => {
        if (disposed) { cleanup(); return; }
        cleanupScene = cleanup;
        setHas3d(true);
        // Leave the 3D logo on screen for a couple of seconds once it shows.
        setTimeout(finish, 2000);
      })
      .catch(err => {
        console.warn("[LogoSplash] 3D logo unavailable, using the flat logo:", err?.message || err);
        finish();
      });

    return () => {
      disposed = true;
      clearTimeout(maxTimer);
      cleanupScene();
    };
  }, []);

  if (gone) return null;

  return (
    <div className={`logo-splash${leaving ? " is-leaving" : ""}`} aria-hidden="true">
      <div className="logo-splash-stage">
        <div ref={mountRef} className={`logo-splash-canvas${has3d ? " is-ready" : ""}`} />
        {!has3d && <img className="logo-splash-fallback" src="/logo.svg" alt="" />}
      </div>
      <div className="logo-splash-name">Lyra</div>
    </div>
  );
}

async function startScene(mount, isDisposed) {
  if (!mount) throw new Error("no mount node");

  const [THREE, { GLTFLoader }, { RoomEnvironment }, { mergeVertices }] = await Promise.all([
    import("three"),
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/environments/RoomEnvironment.js"),
    import("three/examples/jsm/utils/BufferGeometryUtils.js"),
  ]);

  const gltf = await loadFirst(new GLTFLoader(), MODEL_URLS);
  if (isDisposed()) return () => {};

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 4.2);

  // Violet rim light to match the app's accent (#A78BFA).
  const rim = new THREE.DirectionalLight(0xa78bfa, 2.2);
  rim.position.set(-2.5, 1.5, -2);
  scene.add(rim);
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(2, 2.5, 3);
  scene.add(key);

  const model = gltf.scene;
  polish(model, THREE, mergeVertices);

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
      pivot.rotation.y = t * 1.6;                    // slow turn
      pivot.rotation.x = Math.sin(t * 1.3) * 0.12;   // slight tilt
      pivot.position.y = Math.sin(t * 2.0) * 0.06;   // gentle float
      mixer?.update(dt);
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  frame();

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    scene.traverse(obj => {
      if (!obj.isMesh) return;
      obj.geometry?.dispose();
      [].concat(obj.material || []).forEach(m => m.dispose());
    });
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

// "Polished, no hard edges": weld duplicated vertices and recompute
// normals so every face blends smoothly into its neighbours, then give
// the surface a glossy clear-coat finish that picks up the environment.
function polish(root, THREE, mergeVertices) {
  root.traverse(obj => {
    if (!obj.isMesh) return;

    let geo = obj.geometry.clone();
    // Normals (and split UVs) are what keep vertices apart along creases;
    // drop the normals so the weld can join them, keep UVs for textures.
    geo.deleteAttribute("normal");
    geo = mergeVertices(geo, 1e-4);
    geo.computeVertexNormals();
    obj.geometry = geo;

    const toPhysical = src => {
      const m = new THREE.MeshPhysicalMaterial({
        color: src.color ?? new THREE.Color(0xffffff),
        map: src.map ?? null,
        emissive: src.emissive ?? new THREE.Color(0x000000),
        emissiveMap: src.emissiveMap ?? null,
        transparent: !!src.transparent,
        opacity: src.opacity ?? 1,
        metalness: Math.max(src.metalness ?? 0.2, 0.2),
        roughness: Math.min(src.roughness ?? 0.2, 0.2),
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        envMapIntensity: 1.2,
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
