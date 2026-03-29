"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyHeatmapColors = exports.init3DHeatmap = void 0;
const THREE = __importStar(require("three"));
const OrbitControls_js_1 = require("three/addons/controls/OrbitControls.js");
const GLTFLoader_js_1 = require("three/addons/loaders/GLTFLoader.js");
let scene;
let camera;
let renderer;
let controls;
let model = null;
// This dictionary maps our colloquial muscle groups to potential mesh names found in open-source GLB files.
// Since we are using a placeholder robot right now, we will add fallback logic.
// For a real model like Z-Anatomy, you'd populate these arrays with precise mesh names (e.g., 'Biceps_Brachii_Short_Head').
const MUSCLE_MAPPING = {
    'Chest': ['Pectoralis', 'Chest', 'Torso'],
    'Shoulders': ['Deltoid', 'Shoulder'],
    'Arms': ['Biceps', 'Triceps', 'Arm_L', 'Arm_R', 'Hand_L', 'Hand_R'],
    'Back': ['Latissimus', 'Trapezius', 'Back'],
    'Legs': ['Quadriceps', 'Hamstrings', 'Gluteus', 'Leg_L', 'Leg_R', 'Foot_L', 'Foot_R'],
    'Core': ['Abdominal', 'Oblique', 'Core']
};
const init3DHeatmap = (containerId) => {
    const container = document.getElementById(containerId);
    if (!container)
        return;
    // Clear previous SVG or canvas
    container.innerHTML = '';
    // Setup Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#1e1e1e');
    // Setup Camera
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 1.5, 4);
    // Setup Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    // Setup Controls
    controls = new OrbitControls_js_1.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1, 0);
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 5, 5);
    scene.add(dirLight);
    // Load Model
    const loader = new GLTFLoader_js_1.GLTFLoader();
    loader.load('body.glb', (gltf) => {
        model = gltf.scene;
        // Center and scale the placeholder model roughly
        model.position.set(0, 0, 0);
        model.scale.set(0.5, 0.5, 0.5);
        // Ensure all meshes have a standard material we can colorize
        model.traverse((child) => {
            if (child.isMesh) {
                // Clone material so changing one doesn't change all instances
                child.material = new THREE.MeshStandardMaterial({
                    color: 0x444444,
                    roughness: 0.5
                });
            }
        });
        scene.add(model);
    }, undefined, (error) => {
        console.error('Error loading 3D model:', error);
        container.innerHTML = '<p>Could not load 3D model. Please ensure body.glb exists in the public folder.</p>';
    });
    // Animation Loop
    const animate = () => {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    };
    animate();
    // Handle Resize
    window.addEventListener('resize', () => {
        if (!container)
            return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
};
exports.init3DHeatmap = init3DHeatmap;
const applyHeatmapColors = (stats) => {
    if (!model) {
        // If model isn't loaded yet, try again in a bit
        setTimeout(() => (0, exports.applyHeatmapColors)(stats), 500);
        return;
    }
    const now = new Date();
    // Reset all colors to dark grey first
    model.traverse((child) => {
        if (child.isMesh && child.material) {
            child.material.color.setHex(0x444444);
        }
    });
    stats.forEach((stat) => {
        let targetColor = 0xef4444; // Default to red (neglected)
        if (stat.last_trained_date) {
            const lastTrained = new Date(stat.last_trained_date);
            const diffDays = Math.floor((now.getTime() - lastTrained.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays >= 7) {
                targetColor = 0xef4444; // Red
            }
            else if (diffDays >= 2) {
                targetColor = 0x4ade80; // Green
            }
            else {
                targetColor = 0x3b82f6; // Blue
            }
        }
        // Find meshes that match this muscle group and apply color
        const possibleNames = MUSCLE_MAPPING[stat.muscle_group] || [stat.muscle_group];
        model.traverse((child) => {
            if (child.isMesh) {
                // Simple string matching. In a production app with Z-Anatomy, you'd do an exact ID match.
                const meshName = child.name.toLowerCase();
                const matches = possibleNames.some(pn => meshName.includes(pn.toLowerCase()));
                if (matches) {
                    child.material.color.setHex(targetColor);
                }
            }
        });
    });
};
exports.applyHeatmapColors = applyHeatmapColors;
//# sourceMappingURL=heatmap3D.js.map