//Import the THREE.js library
import * as THREE from "https://cdn.skypack.dev/three@0.129.0/build/three.module.js";
// To allow for the camera to move around the scene
import { OrbitControls } from "https://cdn.skypack.dev/three@0.129.0/examples/jsm/controls/OrbitControls.js";
// To allow for importing the .gltf file
import { GLTFLoader } from "https://cdn.skypack.dev/three@0.129.0/examples/jsm/loaders/GLTFLoader.js";

let velocity = new THREE.Vector3(0, 0, 0);
let gravity = new THREE.Vector3(0, -0.02, 0);
let tilt = { x: 0, y: 0 };

//Create a Three.JS Scene
const scene = new THREE.Scene();
//create a new camera with positions and angles
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

//Keep track of the mouse position, so we can make the eye move
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;

//Keep the 3D object on a global variable so we can access it later
let object;

//OrbitControls allow the camera to move around the scene
let controls;

//Set which object to render
let objToRender = 'heart';

//Instantiate a loader for the .gltf file
const loader = new GLTFLoader();

//Load the file
loader.load(
  `./models/${objToRender}/scene.gltf`,
  function (gltf) {
    //If the file is loaded, add it to the scene
    object = gltf.scene;
    scene.add(object);
  },
  function (xhr) {
    //While it is loading, log the progress
    console.log((xhr.loaded / xhr.total * 100) + '% loaded');
  },
  function (error) {
    //If there is an error, log it
    console.error(error);
  }
);

//Instantiate a new renderer and set its size
const renderer = new THREE.WebGLRenderer({ alpha: true }); //Alpha: true allows for the transparent background
renderer.setSize(window.innerWidth, window.innerHeight);

//Add the renderer to the DOM
document.getElementById("container3D").appendChild(renderer.domElement);

//Set how far the camera will be from the 3D model
camera.position.z = objToRender === "dino" ? 25 : 250;

//Add lights to the scene, so we can actually see the 3D model
const topLight = new THREE.DirectionalLight(0xffffff, 1); // (color, intensity)
topLight.position.set(500, 500, 500) //top-left-ish
topLight.castShadow = true;
scene.add(topLight);

const ambientLight = new THREE.AmbientLight(0x333333, objToRender === "dino" ? 5 : 1);
scene.add(ambientLight);

//This adds controls to the camera, so we can rotate / zoom it with the mouse
if (objToRender === "heart") {
  controls = new OrbitControls(camera, renderer.domElement);
}

function enableMotion() {

  window.addEventListener("deviceorientation", (e) => {

    if (!object) return;

    // Left-right tilt
    tilt.x = e.gamma / 30;

    // Front-back tilt
    tilt.y = -e.beta / 30;
  });

}


// iPhone permission
if (
  typeof DeviceMotionEvent !== "undefined" &&
  typeof DeviceMotionEvent.requestPermission === "function"
) {

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
  // Android / others
  enableMotion();
}

//Render the scene
function animate() {
  requestAnimationFrame(animate);

  if (object && objToRender === "heart") {

    // Apply tilt as gravity direction
    gravity.x = tilt.x;
    gravity.y = -0.02 + tilt.y;

    // Add gravity
    velocity.add(gravity);

    // Move heart
    object.position.add(velocity);

    // Floor collision
    if (object.position.y < -40) {
      object.position.y = -40;
      velocity.y *= -0.6; // bounce
    }

    // Wall limits
    if (Math.abs(object.position.x) > 60) {
      velocity.x *= -0.6;
    }

    if (Math.abs(object.position.z) > 60) {
      velocity.z *= -0.6;
    }

    // Friction
    velocity.multiplyScalar(0.98);
  }

  renderer.render(scene, camera);
}

//Add a listener to the window, so we can resize the window and the camera
window.addEventListener("resize", function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

//add mouse position listener, so we can make the eye move
document.onmousemove = (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
}

//Start the 3D rendering
animate();