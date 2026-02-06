import * as THREE from "https://cdn.skypack.dev/three@0.129.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.skypack.dev/three@0.129.0/examples/jsm/loaders/GLTFLoader.js";
import * as CANNON from "https://cdn.skypack.dev/cannon-es@0.19.0";

// --- Setup Scene ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 200; // Moved closer for better look

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById("container3D").appendChild(renderer.domElement);

// Lights
const topLight = new THREE.DirectionalLight(0xffffff, 1);
topLight.position.set(50, 50, 200);
scene.add(topLight);
const ambientLight = new THREE.AmbientLight(0x333333, 4);
scene.add(ambientLight);

// --- Physics Setup ---
const world = new CANNON.World();
world.gravity.set(0, -30, 0); 
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 10;

// Materials
const wallMaterial = new CANNON.Material('wall');
const heartMaterial = new CANNON.Material('heart');
const heartContactMaterial = new CANNON.ContactMaterial(wallMaterial, heartMaterial, {
  friction: 0.1,      // Low friction so it slides
  restitution: 0.5,   // Bounciness (0 = no bounce, 1 = super bouncy)
});
world.addContactMaterial(heartContactMaterial);

// --- 1. The Dynamic Walls ---
// We create 4 walls (Left, Right, Top, Bottom) and update them on resize
const walls = {};

function createWall(name) {
    const body = new CANNON.Body({ mass: 0, material: wallMaterial });
    body.addShape(new CANNON.Plane());
    world.addBody(body);
    walls[name] = body;
    return body;
}

createWall('left');
createWall('right');
createWall('top');
createWall('bottom');
createWall('back'); // A backboard so it doesn't fly away into Z space

// Function to calculate where screen edges are in 3D space
function updateBoundaries() {
    // 1. Calculate the visible height/width at the object's Z-depth (0)
    const distance = camera.position.z; // Assumes object is at z=0
    const vFOV = THREE.MathUtils.degToRad(camera.fov); // convert vertical fov to radians
    const visibleHeight = 2 * Math.tan(vFOV / 2) * distance;
    const visibleWidth = visibleHeight * camera.aspect;

    const halfW = visibleWidth / 2;
    const halfH = visibleHeight / 2;

    // 2. Position and Rotate the Walls to match screen edges

    // Right Wall (Points Left)
    walls['right'].position.set(halfW, 0, 0);
    walls['right'].quaternion.setFromEuler(0, -Math.PI / 2, 0);

    // Left Wall (Points Right)
    walls['left'].position.set(-halfW, 0, 0);
    walls['left'].quaternion.setFromEuler(0, Math.PI / 2, 0);

    // Top Wall (Points Down)
    walls['top'].position.set(0, halfH, 0);
    walls['top'].quaternion.setFromEuler(Math.PI / 2, 0, 0);

    // Bottom Wall (Points Up)
    walls['bottom'].position.set(0, -halfH, 0);
    walls['bottom'].quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    
    // Back Wall (Stops it falling backward)
    walls['back'].position.set(0, 0, -50); // Slightly behind
    walls['back'].quaternion.setFromEuler(0, 0, 0);
}

// --- 2. The Heart Object ---
let renderMesh;
let physicsBody;
const loader = new GLTFLoader();

loader.load(`./models/heart/scene.gltf`, (gltf) => {
    renderMesh = gltf.scene;
    // Normalize scale if needed
    renderMesh.scale.set(15, 15, 15); 
    scene.add(renderMesh);

    // PHYSICS BODY:
    // Using a BOX instead of a Sphere makes it tumble chaotically
    const boxShape = new CANNON.Box(new CANNON.Vec3(12, 12, 5)); // Half-extents (Lx, Ly, Lz)
    
    physicsBody = new CANNON.Body({
        mass: 5,
        material: heartMaterial,
        shape: boxShape,
        angularDamping: 0.5, // How fast it stops spinning
        linearDamping: 0.1
    });
    
    physicsBody.position.set(0, 0, 0);
    world.addBody(physicsBody);

    // Initialize boundaries now that scene is ready
    updateBoundaries();
});

// --- Motion Control ---
function enableMotion() {
    window.addEventListener("deviceorientation", (e) => {
        if(!world) return;

        // Gravity multiplier
        const strength = 80;

        // Map Device Orientation to Gravity
        // Gamma (Left/Right) -> X Gravity
        // Beta (Front/Back)  -> Y Gravity
        const xg = (e.gamma || 0) / 45; 
        const yg = (e.beta || 0) / 45;

        // We update the world gravity vector directly
        // Note: We flip Y so tilting 'forward' makes gravity go 'down' visually
        world.gravity.set(xg * strength, -yg * strength, 0);
    });
}

// Permission Request
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

// --- Animation Loop ---
const clock = new THREE.Clock();
let oldElapsedTime = 0;

function animate() {
    requestAnimationFrame(animate);

    const elapsedTime = clock.getElapsedTime();
    const deltaTime = elapsedTime - oldElapsedTime;
    oldElapsedTime = elapsedTime;

    // Step Physics
    world.step(1 / 60, deltaTime, 3);

    // Sync Graphics to Physics
    if (renderMesh && physicsBody) {
        renderMesh.position.copy(physicsBody.position);
        renderMesh.quaternion.copy(physicsBody.quaternion);
        
        // Slight dampening on Z position to keep it from drifting too far 
        // if it bounces off the back wall hard
        if(physicsBody.position.z > 20) physicsBody.velocity.z -= 1;
        if(physicsBody.position.z < -20) physicsBody.velocity.z += 1;
    }

    renderer.render(scene, camera);
}

// Handle Resize
window.addEventListener("resize", function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    updateBoundaries(); // Recalculate walls on resize
});

animate();