import * as THREE from "https://cdn.skypack.dev/three@0.129.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.skypack.dev/three@0.129.0/examples/jsm/loaders/GLTFLoader.js";
// Import Cannon-es (the modern fork of cannon.js)
import * as CANNON from "https://cdn.skypack.dev/cannon-es@0.19.0";

// --- Configuration ---
const WALL_LIMIT = 60;
const FLOOR_LEVEL = -40;

// --- Physics Setup ---
const world = new CANNON.World();
world.gravity.set(0, -20, 0); // Stronger gravity for the larger scale of the scene

// Materials (optional: makes things bounce/slide nicely)
const defaultMaterial = new CANNON.Material('default');
const defaultContactMaterial = new CANNON.ContactMaterial(defaultMaterial, defaultMaterial, {
  friction: 0.3,
  restitution: 0.7, // Bounciness
});
world.addContactMaterial(defaultContactMaterial);

// 1. Create the Physics Body for the Object (Sphere approximation)
const sphereShape = new CANNON.Sphere(10); // Radius approx 10 (adjust based on model size)
const objectBody = new CANNON.Body({
  mass: 1, // Mass > 0 makes it dynamic
  shape: sphereShape,
  material: defaultMaterial,
  linearDamping: 0.4, // Air resistance simulation
  angularDamping: 0.4
});
objectBody.position.set(0, 0, 0);
world.addBody(objectBody);

// 2. Create Static Boundaries (Floor & Walls)
function createBoundary(position, quaternion) {
  const body = new CANNON.Body({
    mass: 0, // Mass 0 makes it static (immovable)
    material: defaultMaterial
  });
  body.addShape(new CANNON.Plane());
  body.position.copy(position);
  body.quaternion.copy(quaternion);
  world.addBody(body);
}

// Floor (Pointing up)
const qFloor = new CANNON.Quaternion();
qFloor.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
createBoundary(new CANNON.Vec3(0, FLOOR_LEVEL, 0), qFloor);

// Wall: Right (+X) - Normal pointing Left
const qRight = new CANNON.Quaternion();
qRight.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -Math.PI / 2);
createBoundary(new CANNON.Vec3(WALL_LIMIT, 0, 0), qRight);

// Wall: Left (-X) - Normal pointing Right
const qLeft = new CANNON.Quaternion();
qLeft.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI / 2);
createBoundary(new CANNON.Vec3(-WALL_LIMIT, 0, 0), qLeft);

// Wall: Back (-Z) - Normal pointing Forward
// (Note: Limit Z motion if desired, otherwise standard plane)
const qBack = new CANNON.Quaternion();
createBoundary(new CANNON.Vec3(0, 0, -WALL_LIMIT), new CANNON.Quaternion()); // Default normal is +Z

// Wall: Front (+Z) - Normal pointing Backward
const qFront = new CANNON.Quaternion();
qFront.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI); // Rotate 180 to face -Z
createBoundary(new CANNON.Vec3(0, 0, WALL_LIMIT), qFront);


// --- Three.js Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 250;

const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById("container3D").appendChild(renderer.domElement);

// Lighting
const topLight = new THREE.DirectionalLight(0xffffff, 1);
topLight.position.set(500, 500, 500);
topLight.castShadow = true;
scene.add(topLight);

const ambientLight = new THREE.AmbientLight(0x333333, 5);
scene.add(ambientLight);

// Load Model
let renderMesh;
let objToRender = 'heart';
const loader = new GLTFLoader();

loader.load(
  `./models/${objToRender}/scene.gltf`,
  function (gltf) {
    renderMesh = gltf.scene;
    scene.add(renderMesh);
    
    // Optional: Scale mesh to fit physics body if needed
    // renderMesh.scale.set(10, 10, 10); 
  },
  function (xhr) {
    console.log((xhr.loaded / xhr.total * 100) + '% loaded');
  },
  function (error) {
    console.error(error);
  }
);


// --- Motion Control ---
function enableMotion() {
  window.addEventListener("deviceorientation", (e) => {
    // Instead of adding velocity manually, we change the world gravity direction.
    // This simulates the "box" tilting.
    
    const gravityStrength = 30; // Maximum gravity force
    
    // Convert degrees to radians approximation
    const xTilt = (e.gamma || 0) / 45; // Left/Right
    const yTilt = (e.beta || 0) / 45;  // Front/Back

    // Update Physics World Gravity
    // Note: Cannon uses x, y, z. 
    // y is usually "up". So tilt affects X (left/right) and Z (depth) gravity, 
    // or X and Y if you view it purely 2D.
    // Based on your camera setup:
    world.gravity.x = xTilt * gravityStrength;
    world.gravity.y = -20 + (Math.abs(yTilt) * -10); // Keep downward pull, adjust slightly
    // If you want front/back tilt to move it in Z depth:
    // world.gravity.z = -yTilt * gravityStrength; 
    
    // If you want front/back tilt to move it Up/Down (2D platformer style):
    // world.gravity.y = -20 + (-yTilt * gravityStrength);
  });
}

// Permissions handling
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
const timeStep = 1 / 60; // Sync physics to 60fps

function animate() {
  requestAnimationFrame(animate);

  // 1. Step the physics world
  world.step(timeStep);

  // 2. Sync Three.js mesh to Cannon.js body
  if (renderMesh) {
    renderMesh.position.copy(objectBody.position);
    renderMesh.quaternion.copy(objectBody.quaternion);
  }

  renderer.render(scene, camera);
}

// Resize handler
window.addEventListener("resize", function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();