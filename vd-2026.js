import * as THREE from "https://cdn.skypack.dev/three@0.129.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.skypack.dev/three@0.129.0/examples/jsm/loaders/GLTFLoader.js";
import * as CANNON from "https://cdn.skypack.dev/cannon-es@0.19.0";

// --- Scene Setup ---
const scene = new THREE.Scene();

// 1. CAMERA FIX: Moved Z from 200 to 400 to zoom out (Top-down view feel)
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 1200; 

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById("container3D").appendChild(renderer.domElement);

// Lights
const topLight = new THREE.DirectionalLight(0xffffff, 1.5);
topLight.position.set(100, 100, 200);
topLight.castShadow = true;
scene.add(topLight);

const ambientLight = new THREE.AmbientLight(0x333333, 4);
scene.add(ambientLight);

// --- Physics Setup ---
const world = new CANNON.World();
world.gravity.set(0, 0, 0); // Start with zero gravity (flat table)
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 10;

// Physics Materials
const wallMaterial = new CANNON.Material('wall');
const heartMaterial = new CANNON.Material('heart');
const heartContactMaterial = new CANNON.ContactMaterial(wallMaterial, heartMaterial, {
  friction: 0.1,    
  restitution: 0.4, // Bounciness
});
world.addContactMaterial(heartContactMaterial);

// --- Boundaries (The Box) ---
const walls = {};

function createWall(name) {
    const body = new CANNON.Body({ mass: 0, material: wallMaterial });
    body.addShape(new CANNON.Plane());
    world.addBody(body);
    walls[name] = body;
    return body;
}

createWall('top');
createWall('bottom');
createWall('left');
createWall('right');
createWall('floor'); // The "Table" surface behind the object
createWall('ceiling'); // Invisible glass in front (so it doesn't hit the camera)

function updateBoundaries() {
    // Calculate the visible width/height at the object's depth (0)
    const distance = camera.position.z;
    const vFOV = THREE.MathUtils.degToRad(camera.fov);
    const visibleHeight = 2 * Math.tan(vFOV / 2) * distance;
    const visibleWidth = visibleHeight * camera.aspect;

    const halfW = visibleWidth / 2;
    const halfH = visibleHeight / 2;

    // Position Walls exactly at screen edges
    walls['right'].position.set(halfW, 0, 0);
    walls['right'].quaternion.setFromEuler(0, -Math.PI / 2, 0);

    walls['left'].position.set(-halfW, 0, 0);
    walls['left'].quaternion.setFromEuler(0, Math.PI / 2, 0);

    walls['top'].position.set(0, halfH, 0);
    walls['top'].quaternion.setFromEuler(Math.PI / 2, 0, 0);

    walls['bottom'].position.set(0, -halfH, 0);
    walls['bottom'].quaternion.setFromEuler(-Math.PI / 2, 0, 0);

    // 2. Z-AXIS SANDWICH (The "Glass Panes")
    // This keeps the object from falling "off" the table depth-wise
    
    // Back plane (Table surface) - slightly behind z=0
    walls['floor'].position.set(0, 0, -30);
    walls['floor'].quaternion.setFromEuler(0, 0, 0);

    // Front plane (Glass cover) - slightly in front of z=0
    walls['ceiling'].position.set(0, 0, 30); 
    walls['ceiling'].quaternion.setFromEuler(-Math.PI, 0, 0); 
}

// --- The Heart Object ---
let renderMesh;
let physicsBody;
const loader = new GLTFLoader();

loader.load(`./models/heart/scene.gltf`, (gltf) => {
    renderMesh = gltf.scene;
    // Scale slightly smaller since camera is further back, 
    // but large enough to look good
    renderMesh.scale.set(15, 15, 15); 
    scene.add(renderMesh);

    // Physics Box
    const boxShape = new CANNON.Box(new CANNON.Vec3(10, 10, 5)); 
    
    physicsBody = new CANNON.Body({
        mass: 10,
        material: heartMaterial,
        shape: boxShape,
        angularDamping: 0.6,
        linearDamping: 0.5
    });
    
    physicsBody.position.set(0, 0, 0);
    world.addBody(physicsBody);

    updateBoundaries();
});

// --- Tabletop Motion Logic ---
function enableMotion() {
    window.addEventListener("deviceorientation", (e) => {
        if(!world) return;

        // Gravity Strength
        const G = 150; 

        // 3. TABLETOP MAPPING
        // Gamma (Left/Right tilt): -90 to 90
        // Beta (Front/Back tilt): -180 to 180 (0 is flat on table)

        const xTilt = (e.gamma || 0); // Left/Right
        const yTilt = (e.beta || 0);  // Front/Back

        // Calculate gravity based on tilt
        // If we tilt left (gamma negative), gravity goes left (negative X)
        const gravX = (xTilt / 45) * G;
        
        // If we tilt "Away" (top of phone goes down), Beta usually becomes negative.
        // We want the object to move UP the screen (Positive Y).
        // So we flip the sign of Beta.
        const gravY = -(yTilt / 45) * G;

        // Apply to world
        // We keep Z gravity at 0 (or slight push back) so it slides on the "table"
        world.gravity.set(gravX, gravY, -10); 
    });
}

// Permissions
if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
    const btn = document.getElementById("motionBtn");
    btn.style.display = "block";
    btn.addEventListener("click", async () => {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission === "granted") {
            enableMotion();
            btn.remove();
        }
    });
} else {
    enableMotion();
}

// --- Animate ---
const clock = new THREE.Clock();
let oldElapsedTime = 0;

function animate() {
    requestAnimationFrame(animate);

    const elapsedTime = clock.getElapsedTime();
    const deltaTime = elapsedTime - oldElapsedTime;
    oldElapsedTime = elapsedTime;

    world.step(1 / 60, deltaTime, 3);

    if (renderMesh && physicsBody) {
        renderMesh.position.copy(physicsBody.position);
        renderMesh.quaternion.copy(physicsBody.quaternion);
    }

    renderer.render(scene, camera);
}

// Resize
window.addEventListener("resize", function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    updateBoundaries();
});

animate();