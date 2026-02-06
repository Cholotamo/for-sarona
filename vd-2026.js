import * as THREE from "https://cdn.skypack.dev/three@0.129.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.skypack.dev/three@0.129.0/examples/jsm/loaders/GLTFLoader.js";
import * as CANNON from 'https://cdn.skypack.dev/cannon-es';

// --- Configuration ---
const CONFIG = {
    cameraHeight: 30, // Distance of camera from floor
    viewSize: 20,     // Approximate width of view in world units (calculated later)
    gravityScale: 20,  // Multiplier for tilt-to-gravity force
    floorSize: 100,
    wallThickness: 2,
    objName: 'heart',
    objName2: 'photoframe'
};

// --- Globals ---
let scene, camera, renderer;
let world; // Physics world
let lastTime;
let hearts = []; // Array of { mesh, body }
const timeStep = 1 / 60;

// Materials
let physicsMaterial;

// Screen Bounds (World Units)
let screenBounds = { top: 0, bottom: 0, left: 0, right: 0 };

async function init() {
    // 1. Setup Three.js
    scene = new THREE.Scene();
    scene.background = null; // Transparent background for existing CSS background

    // Top-down camera setup (looking -Y)
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 1000);
    camera.position.set(0, CONFIG.cameraHeight, 0);
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.getElementById("container3D").appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    // Fix shadow clipping by expanding the shadow camera frustum
    const d = 50;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0001; // Reduce shadow acne
    scene.add(dirLight);

    // 2. Setup Cannon.js
    world = new CANNON.World({
        gravity: new CANNON.Vec3(0, -10, 0), // Initial gravity (Earth-like)
    });
    physicsMaterial = new CANNON.Material('physics');

    // Friction/Bounce contact material
    const physics_physics = new CANNON.ContactMaterial(physicsMaterial, physicsMaterial, {
        friction: 0.3,
        restitution: 0.5, // Bounciness
    });
    world.addContactMaterial(physics_physics);

    // 3. Create Objects
    calculateScreenBounds();
    createFloor();
    createWalls();
    await loadModel(); // Load heart

    // 4. Events
    window.addEventListener("resize", onWindowResize);

    // Start loop
    lastTime = performance.now();
    animate();
}

function calculateScreenBounds() {
    // Calculate visible width/height at floor level (y=0) given camera height
    // tan(fov/2) = (height/2) / dist
    const vFOV = THREE.MathUtils.degToRad(camera.fov);
    const visibleHeight = 2 * Math.tan(vFOV / 2) * CONFIG.cameraHeight;
    const visibleWidth = visibleHeight * camera.aspect;

    screenBounds = {
        top: -visibleHeight / 2,
        bottom: visibleHeight / 2,
        left: -visibleWidth / 2,
        right: visibleWidth / 2
    };

    // Adjust config for walls
    console.log("Calculated Bounds:", screenBounds);
}

function createFloor() {
    // Visual Floor (Shadow receiver only)
    const floorGeo = new THREE.PlaneGeometry(CONFIG.floorSize, CONFIG.floorSize);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.3 }); // Only show shadows
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Physics Floor
    const floorBody = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Plane(),
        material: physicsMaterial
    });
    floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(floorBody);
}

function createWalls() {
    // We add 4 static boxes around the screen bounds
    const wallHeight = 10;
    const thickness = CONFIG.wallThickness;

    const walls = [
        // Top (-Z)
        {
            pos: [0, wallHeight / 2, screenBounds.top - thickness / 2],
            size: [screenBounds.right * 2 + 10, wallHeight, thickness]
        },
        // Bottom (+Z)
        {
            pos: [0, wallHeight / 2, screenBounds.bottom + thickness / 2],
            size: [screenBounds.right * 2 + 10, wallHeight, thickness]
        },
        // Left (-X)
        {
            pos: [screenBounds.left - thickness / 2, wallHeight / 2, 0],
            size: [thickness, wallHeight, screenBounds.bottom * 2 + 10]
        },
        // Right (+X)
        {
            pos: [screenBounds.right + thickness / 2, wallHeight / 2, 0],
            size: [thickness, wallHeight, screenBounds.bottom * 2 + 10]
        },
    ];

    walls.forEach(w => {
        const shape = new CANNON.Box(new CANNON.Vec3(w.size[0] / 2, w.size[1] / 2, w.size[2] / 2));
        const body = new CANNON.Body({
            mass: 0, // static
            material: physicsMaterial
        });
        body.addShape(shape);
        body.position.set(...w.pos);
        world.addBody(body);

        // Debug Visuals (Optional - uncomment to see walls)
        // const mesh = new THREE.Mesh(new THREE.BoxGeometry(...w.size), new THREE.MeshBasicMaterial({color: 0xff0000, wireframe: true}));
        // mesh.position.copy(body.position);
        // scene.add(mesh);
    });
}

function loadModel() {
    return new Promise(resolve => {
        const loader = new GLTFLoader();
        loader.load(`./models/${CONFIG.objName}/scene.gltf`, (gltf) => {
            const rawScene = gltf.scene;

            // Spawn 3 hearts at different positions (spread out for larger size)
            spawnHeart(rawScene, -6, 15, 0);
            spawnHeart(rawScene, 0, 15, 6);
            spawnHeart(rawScene, 6, 15, -6);

            resolve();
        });

        // Load Photoframe
        const loader2 = new GLTFLoader();
        loader2.load(`./models/${CONFIG.objName2}/scene.gltf`, (gltf) => {
            const rawScene = gltf.scene;
            spawnPhotoframe(rawScene, 8, 20, 8);
        });
    });
}

function spawnPhotoframe(sourceScene, x, y, z) {
    const rawMesh = sourceScene.clone(true);

    // Normalize scale
    const box = new THREE.Box3().setFromObject(rawMesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);

    if (maxDim === 0) return;

    // Scale similarly to hearts but maybe slightly different? Let's keep it consistent for now or adjust
    const scale = 8.0 / maxDim; // Slightly larger feel for a frame
    rawMesh.scale.set(scale, scale, scale);

    // Re-calculate box after scale
    box.setFromObject(rawMesh);
    const center = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size); // Get final size for physics

    const visualRoot = new THREE.Group();
    rawMesh.position.x = -center.x;
    rawMesh.position.y = -center.y;
    rawMesh.position.z = -center.z;

    rawMesh.traverse(child => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    visualRoot.add(rawMesh);

    // Debug Wireframe (Box)
    // const debugGeo = new THREE.BoxGeometry(size.x, size.y, size.z);
    // const debugMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true });
    // const debugMesh = new THREE.Mesh(debugGeo, debugMat);
    // visualRoot.add(debugMesh);

    scene.add(visualRoot);

    // Physics Body - Box
    // Cannon Box takes half-extents
    const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));

    const body = new CANNON.Body({
        mass: 5,
        material: physicsMaterial,
        linearDamping: 0.1,
        angularDamping: 0.1
    });
    body.addShape(shape);
    body.position.set(x, y, z);

    // Initial random rotation
    body.quaternion.setFromEuler(Math.random() * Math.PI, Math.random() * Math.PI, 0);

    world.addBody(body);
    hearts.push({ mesh: visualRoot, body: body });
}

function spawnHeart(sourceScene, x, y, z) {
    // Clone logic
    const rawMesh = sourceScene.clone(true); // Is .clone() enough? standard Three.js clone is non-recursive for custom props but works for scene graph.
    // However, we need to re-apply the scale/center logic or do it once on source.
    // Let's do it per instance to be safe and robust.

    // Normalize scale
    const box = new THREE.Box3().setFromObject(rawMesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);

    // Safety check for empty model
    if (maxDim === 0) return;

    // Scale 3x bigger (Base was 2.0 for radius 1, now 6.0 for radius 3)
    const scale = 6.0 / maxDim;
    rawMesh.scale.set(scale, scale, scale);

    // Re-calculate box after scale
    box.setFromObject(rawMesh);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Create Pivot Group
    const visualRoot = new THREE.Group();
    rawMesh.position.x = -center.x;
    rawMesh.position.y = -center.y;
    rawMesh.position.z = -center.z;

    // Shadows
    rawMesh.traverse(child => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            // Materials need to be cloned if we want to change them later, but for unique instances sharing material is fine.
        }
    });

    visualRoot.add(rawMesh);

    // Debug Wireframe
    const radius = 3.0;
    // User requested "3D Hexagon" -> Using Icosahedron (20 sides) for a tumbling effect
    const polyGeo = new THREE.IcosahedronGeometry(radius, 0);
    // const debugMat = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true, transparent: true, opacity: 0.5 });
    // const debugMesh = new THREE.Mesh(polyGeo, debugMat);
    // visualRoot.add(debugMesh);

    scene.add(visualRoot);

    // Physics Body - ConvexPolyhedron
    // We need to convert the Three.js geometry to Cannon.js ConvexPolyhedron
    const shape = createConvexPolyhedron(polyGeo);

    const body = new CANNON.Body({
        mass: 5,
        material: physicsMaterial,
        linearDamping: 0.1,
        angularDamping: 0.1
    });
    body.addShape(shape);
    body.position.set(x, y, z);
    world.addBody(body);

    hearts.push({ mesh: visualRoot, body: body });
}

function createConvexPolyhedron(geometry) {
    const position = geometry.attributes.position;
    const vertices = []; // CANNON.Vec3[]
    const faces = [];    // number[][]

    // 1. Identify Unique Vertices
    // Map "x_y_z" -> unique index
    const uniqueMap = new Map();
    const indexRemap = []; // Old Index -> New Unique Index

    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);

        // Quantize to avoid floating point issues
        const key = `${Math.round(x * 1000)}_${Math.round(y * 1000)}_${Math.round(z * 1000)}`;

        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, vertices.length);
            vertices.push(new CANNON.Vec3(x, y, z));
        }
        indexRemap.push(uniqueMap.get(key));
    }

    // 2. Build Faces using remapped indices
    // Helper to add face if valid (3 unique vertices)
    const addFace = (a, b, c) => {
        const ia = indexRemap[a];
        const ib = indexRemap[b];
        const ic = indexRemap[c];

        if (ia !== ib && ib !== ic && ia !== ic) {
            faces.push([ia, ib, ic]);
        }
    };

    if (geometry.index) {
        for (let i = 0; i < geometry.index.count; i += 3) {
            addFace(
                geometry.index.array[i],
                geometry.index.array[i + 1],
                geometry.index.array[i + 2]
            );
        }
    } else {
        for (let i = 0; i < position.count; i += 3) {
            addFace(i, i + 1, i + 2);
        }
    }

    return new CANNON.ConvexPolyhedron({ vertices, faces });
}

// --- Control Logic ---
function handleDeviceOrientation(e) {
    // Removed specific body check, gravity is global

    // Beta: Front-to-back tilt [-180, 180] (x-axis)
    // Gamma: Left-to-right tilt [-90, 90] (y-axis)

    // We Map:
    // Beta -> Z Gravity (Tilting phone forward (top away) should roll "up" screen (-Z))
    // Gamma -> X Gravity (Tilting phone right should roll right (+X))

    const beta = e.beta || 0;
    const gamma = e.gamma || 0;

    // Clamp for usability
    const maxTilt = 45;
    const clampedBeta = Math.max(-maxTilt, Math.min(maxTilt, beta));
    const clampedGamma = Math.max(-maxTilt, Math.min(maxTilt, gamma));

    // Normalize -1 to 1
    const xRatio = clampedGamma / maxTilt;
    const zRatio = clampedBeta / maxTilt;

    // Gravity Vector
    // Keep a strong -Y component so it stays on floor
    // User requested "Invert direction of tilting forwards and backwards".
    // Currently code is `-gravityZ`. If we want to invert it, we use `+gravityZ`.
    const gravityY = -15;
    const gravityX = xRatio * CONFIG.gravityScale;
    const gravityZ = zRatio * CONFIG.gravityScale;

    // Invert Z from previous state
    world.gravity.set(gravityX, gravityY, gravityZ);
}

// Enable Motion Permission (iOS 13+)
const btn = document.getElementById("motionBtn");
if (btn) {
    // Only show if needed (handled in HTML/CSS mostly, but logic here)
    if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
        btn.style.display = "block";
        btn.addEventListener("click", async () => {
            try {
                const response = await DeviceMotionEvent.requestPermission();
                if (response === 'granted') {
                    window.addEventListener('deviceorientation', handleDeviceOrientation);
                    btn.style.display = 'none';
                }
            } catch (err) {
                console.error(err);
            }
        });
    } else {
        // Non-iOS or older
        window.addEventListener('deviceorientation', handleDeviceOrientation);
        btn.style.display = 'none';

        // Debug hook for desktop testing (Mouse position -> gravity)
        if (!('ontouchstart' in window)) {
            window.addEventListener('mousemove', (e) => {
                const x = (e.clientX / window.innerWidth) * 2 - 1;
                const y = (e.clientY / window.innerHeight) * 2 - 1;
                // Move Right (x>0) -> Gravity +X
                // Move Up (y<0) -> Beta < 0 -> GravityZ < 0 -> Force +Z (Down) if using +Z mapping
                // If we want inverted: Move Up (y<0) -> Should Roll Up (-Z).
                // If mapping is +gravityZ, and y scales with Beta:
                // y negative (Mouse Up) -> Beta negative -> gravityZ negative.
                // Output: gravity Z negative. Force is -Z. Object rolls Up.
                // So +gravityZ mapping seems to match "Mouse Up -> Roll Up".
                world.gravity.set(x * 25, -15, y * 25);
            });
        }
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    calculateScreenBounds();
}

function animate(time) {
    requestAnimationFrame(animate);

    if (lastTime === undefined) lastTime = time;
    const dt = (time - lastTime) / 1000;

    world.fixedStep();

    // Sync Visuals
    hearts.forEach(item => {
        item.mesh.position.copy(item.body.position);
        item.mesh.quaternion.copy(item.body.quaternion);
    });

    renderer.render(scene, camera);
    lastTime = time;
}

// Start
init();