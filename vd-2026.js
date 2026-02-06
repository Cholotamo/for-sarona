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
    objName: 'heart'
};

// --- Globals ---
let scene, camera, renderer;
let world; // Physics world
let lastTime;
let heartBody, heartMesh;
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
            const rawMesh = gltf.scene;

            // Normalize scale (heuristic: fit within 2 unit sphere)
            const box = new THREE.Box3().setFromObject(rawMesh);
            const size = new THREE.Vector3();
            box.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 2.0 / maxDim;
            rawMesh.scale.set(scale, scale, scale);

            // Re-calculate box after scale to get correct center
            box.setFromObject(rawMesh);
            const center = new THREE.Vector3();
            box.getCenter(center);

            // Create a Container Group to be our Pivot
            const visualRoot = new THREE.Group();

            // Move rawMesh so its center is at (0,0,0) of the parent Group
            rawMesh.position.x = -center.x;
            rawMesh.position.y = -center.y;
            rawMesh.position.z = -center.z;

            // Enable shadows
            rawMesh.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            visualRoot.add(rawMesh);

            // Add Debug Wireframe Sphere (Visualizing the collider)
            const radius = 1.0;
            // const debugGeo = new THREE.SphereGeometry(radius, 16, 16);
            // const debugMat = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true, transparent: true, opacity: 0.5 });
            // const debugMesh = new THREE.Mesh(debugGeo, debugMat);
            // visualRoot.add(debugMesh);

            scene.add(visualRoot);
            heartMesh = visualRoot; // The animation loop will sync this group to physics

            // Create Physics Body
            const shape = new CANNON.Sphere(radius);

            heartBody = new CANNON.Body({
                mass: 5,
                material: physicsMaterial,
                linearDamping: 0.1,
                angularDamping: 0.1
            });
            heartBody.addShape(shape);
            heartBody.position.set(0, 5, 0); // Start in air
            world.addBody(heartBody);

            resolve();
        });
    });
}

// --- Control Logic ---
function handleDeviceOrientation(e) {
    if (!heartBody) return;

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

    // Step physics
    // fixed time step is better for stability
    world.fixedStep();

    // Sync Visuals
    if (heartBody && heartMesh) {
        heartMesh.position.copy(heartBody.position);
        heartMesh.quaternion.copy(heartBody.quaternion);
    }

    renderer.render(scene, camera);
    lastTime = time;
}

// Start
init();