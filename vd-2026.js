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
            const debugGeo = new THREE.SphereGeometry(radius, 16, 16);
            const debugMat = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true, transparent: true, opacity: 0.5 });
            const debugMesh = new THREE.Mesh(debugGeo, debugMat);
            visualRoot.add(debugMesh);

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
    const gravityY = -15;
    const gravityX = xRatio * CONFIG.gravityScale;

    // Inverted Z based on user feedback
    // "Tilt Away" (Positive Beta) was rolling "Down" (+Z) -> We want it to roll "Up" (-Z)
    // So Positive Beta should produce -Z Gravity. 
    // Previous Code: `world.gravity.set(..., -gravityZ)` where gravityZ = zRatio*Scale.
    // If zRatio is +, gravity is -Z. This SHOULD have worked for "Up".
    // If user says "it rolls to bottom" (+Z), then my previous logic resulted in +Z force.
    // So let's flip the sign of the Z component passed to set().
    // If Beta is +, we want -Z force.
    // Let's try flipping the sign.
    const gravityZ = zRatio * CONFIG.gravityScale;

    // If "Tilt Away" (Beta > 0) -> we want -Z force.
    // If "Tilt Inward" (Beta < 0) -> we want +Z force.
    // Let's explicitly set the signs to avoid confusion.

    // User reported: "Tilting phone away... rolls to bottom (+Z)".
    // So currently Beta > 0 => Force +Z. 
    // We want Beta > 0 => Force -Z.
    // So simply flipping the sign of the Z argument fix it.

    world.gravity.set(gravityX, gravityY, gravityZ);
    // Wait, if gravityZ is positive (Beta > 0), passing it as +Z moves it to Bottom.
    // Wait, previous code was `world.gravity.set(gravityX, gravityY, -gravityZ);`
    // So Beta > 0 -> -Gravity -> Force -Z (Up).
    // User said that rolled to Bottom. That implies either Beta IS NEGATIVE when tilting away (Android vs iOS difference?) or Camera is flipped.
    // Regardless, if it was going wrong way, we just flip the sign.
    // Previous: -gravityZ. New: +gravityZ.
    // Let's just use `gravityZ` directly if it was inverted before.

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
                // Move Up (y<0) -> Gravity -Z (Roll Up)
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
    world.fixedStep();

    // Sync Visuals
    if (heartBody && heartMesh) {
        // heartMesh is now our visualRoot group
        heartMesh.position.copy(heartBody.position);
        heartMesh.quaternion.copy(heartBody.quaternion);
    }

}

// Start
init();