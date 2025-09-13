import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createNoise2D, createNoise3D } from 'simplex-noise';
import vertexShader from '../shaders/vertex.js';
import fragmentShader from '../shaders/fragment.js';

const noise2D = createNoise2D();
const noise3D = createNoise3D();

function fractionate(val, minVal, maxVal) {
  return (val - minVal) / (maxVal - minVal);
}
function cmodulate(value, inMin, inMax, outMin, outMax) {
  return outMin + (value - inMin) * (outMax - outMin) / (inMax - inMin);
}
function modulate(val, minVal, maxVal, outMin, outMax) {
  var fr = fractionate(val, minVal, maxVal);
  var delta = outMax - outMin;
  return outMin + fr * delta;
}
function avg(arr) {
  var total = arr.reduce(function (sum, b) {
    return sum + b;
  });
  return total / arr.length;
}
function max(arr) {
  return arr.reduce(function (a, b) {
    return Math.max(a, b);
  });
}

const AudioVisualizer = () => {
  const containerRef = useRef(null);
  const audioRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const audioContextRef = useRef(null);
  const sourceRef = useRef(null);
  const [audioFile, setAudioFile] = useState(null);
  const [showOptions, setShowOptions] = useState(true);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [downloadMessage, setDownloadMessage] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [controlsPosition, setControlsPosition] = useState(50);
  const fileInputRef = useRef(null);

  useEffect(() => {
    // THREE.js setup
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    scene.add(group);
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 100);
    camera.lookAt(scene.position);
    scene.add(camera);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);

    // Planes
    const planeGeometry = new THREE.PlaneGeometry(800, 800, 20, 20);
    const planeMaterial = new THREE.MeshLambertMaterial({ color: 0x00ff00, side: THREE.DoubleSide, wireframe: true });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -0.5 * Math.PI;
    plane.position.set(0, 30, 0);
    group.add(plane);
    const plane2 = new THREE.Mesh(planeGeometry, planeMaterial.clone());
    plane2.rotation.x = -0.5 * Math.PI;
    plane2.position.set(0, -30, 0);
    group.add(plane2);

    // Ball
    const icosahedronGeometry = new THREE.IcosahedronGeometry(10, 6);
    const shaderMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: THREE.DoubleSide,
      wireframe: true,
      uniforms: {
        UTime: { value: 0.0 },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uDisplace: { value: 2 },
        uSpread: { value: 1.2 },
        uNoise: { value: 16 },
      },
    });
    const ball = new THREE.Mesh(icosahedronGeometry, shaderMaterial);
    ball.position.set(0, 0, 0);
    group.add(ball);

    // Particles
    const particleCount = 5500;
    const particlesGeometry = new THREE.BufferGeometry();
    const particlesMaterial = new THREE.PointsMaterial({
      size: 1.0,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
      vertexColors: true,
    });
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(Math.random() * 2 - 1);
      const radius = 15 + Math.random() * 5;
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
      const color = new THREE.Color(0xffffff);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    group.add(particles);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xaaaaaa);
    scene.add(ambientLight);
    const spotLight = new THREE.SpotLight(0xffffff);
    spotLight.intensity = 0.9;
    spotLight.position.set(-10, 40, 20);
    spotLight.lookAt(ball.position);
    spotLight.castShadow = true;
    scene.add(spotLight);

    function onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener('resize', onWindowResize, false);

    function makeRoughBall(mesh, bassFr, treFr) {
      const geometry = mesh.geometry;
      const positionAttribute = geometry.attributes.position;
      const offset = geometry.parameters.radius;
      const amp = 7;
      const time = window.performance.now();
      const rf = 0.0003;
      for (let i = 0; i < positionAttribute.count; i++) {
        const x = positionAttribute.getX(i);
        const y = positionAttribute.getY(i);
        const z = positionAttribute.getZ(i);
        const distance = offset + bassFr + noise3D(
          x * 0.045 + time * rf,
          y * 0.045 + time * rf,
          z * 0.045 + time * rf
        ) * amp * treFr;
        const length = Math.sqrt(x * x + y * y + z * z);
        const newX = (x / length) * distance;
        const newY = (y / length) * distance;
        const newZ = (z / length) * distance;
        positionAttribute.setXYZ(i, newX, newY, newZ);
      }
      positionAttribute.needsUpdate = true;
      geometry.computeVertexNormals();
    }
    function makeRoughParticles(particles, bassFr, treFr) {
      const positions = particles.geometry.attributes.position.array;
      const amp = 7;
      const time = window.performance.now();
      const rf = 0.0003;
      const offset = 10;
      for (let i = 0; i < positions.length / 3; i++) {
        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        const z = positions[i * 3 + 2];
        const distance = offset + bassFr + noise3D(
          x * 0.045 + time * rf,
          y * 0.045 + time * rf,
          z * 0.045 + time * rf
        ) * amp * treFr;
        const length = Math.sqrt(x * x + y * y + z * z);
        positions[i * 3] = (x / length) * distance;
        positions[i * 3 + 1] = (y / length) * distance;
        positions[i * 3 + 2] = (z / length) * distance;
      }
      particles.geometry.attributes.position.needsUpdate = true;
    }
    function makeRoughGround(mesh, distortionFr) {
      const positionAttribute = mesh.geometry.attributes.position;
      const amp = 2;
      const time = Date.now();
      for (let i = 0; i < positionAttribute.count; i++) {
        const x = positionAttribute.getX(i);
        const y = positionAttribute.getY(i);
        const distance = noise2D(x + time * 0.0003, y + time * 0.0001) * distortionFr * amp;
        positionAttribute.setZ(i, distance);
      }
      positionAttribute.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    }
    function updateBackgroundColor(ballColor) {
      const hsl = ballColor.getHSL({});
      const bgColor = `hsla(${hsl.h * 360}, ${hsl.s * 100}%, 90%, 1)`;
      const bgColorLight = `hsla(${hsl.h * 360}, ${hsl.s * 100}%, 85%, 1)`;
      document.documentElement.style.setProperty('--bgColor', bgColor);
      document.documentElement.style.setProperty('--bgColorLight', bgColorLight);
      const particleColors = particles.geometry.attributes.color.array;
      const lightdark = Math.max(0, hsl.l - 0.4);
      for (let i = 0; i < particleColors.length; i += 3) {
        const particleColor = new THREE.Color();
        particleColor.setHSL(hsl.h, hsl.s, lightdark);
        particleColors[i] = particleColor.r;
        particleColors[i + 1] = particleColor.g;
        particleColors[i + 2] = particleColor.b;
      }
      particles.geometry.attributes.color.needsUpdate = true;
    }

    const animate = () => {
      if (analyserRef.current && dataArrayRef.current) {
        analyserRef.current.getByteFrequencyData(dataArrayRef.current);
        const lowerHalfArray = dataArrayRef.current.slice(0, dataArrayRef.current.length / 2 - 1);
        const upperHalfArray = dataArrayRef.current.slice(dataArrayRef.current.length / 2 - 1, dataArrayRef.current.length - 1);
        const overallAvg = avg(dataArrayRef.current);
        const lowerMax = max(lowerHalfArray);
        const lowerAvg = avg(lowerHalfArray);
        const upperMax = max(upperHalfArray);
        const upperAvg = avg(upperHalfArray);
        const lowerMaxFr = lowerMax / lowerHalfArray.length;
        const lowerAvgFr = lowerAvg / lowerHalfArray.length;
        const upperMaxFr = upperMax / upperHalfArray.length;
        const upperAvgFr = upperAvg / upperHalfArray.length;
        makeRoughGround(plane, modulate(upperAvgFr, 0, 1, 0.5, 4));
        makeRoughGround(plane2, modulate(lowerMaxFr, 0, 1, 0.5, 4));
        makeRoughBall(
          ball,
          modulate(Math.pow(lowerMaxFr, 0.8), 0, 1, 0, 8),
          modulate(upperAvgFr, 0, 1, 0, 4)
        );
        makeRoughParticles(
          particles,
          modulate(Math.pow(lowerMaxFr, 0.7), 0, 1, 0, 8),
          modulate(upperMaxFr, 0, 1, 0, 4)
        );
        const color = new THREE.Color(`hsl(${modulate(upperAvgFr, 0, 1, 0, 360)}, 100%, 50%)`);
        updateBackgroundColor(color);
        ball.material.color = color;
        const intensity = upperAvg / 255;
        const rotationSpeed = cmodulate(intensity, 0, 1, 0.01, 0.1);
        group.rotation.y += rotationSpeed + 0.001;
      }
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    return () => {
      renderer.dispose();
      window.removeEventListener('resize', onWindowResize);
      cleanupAudio();
    };
  }, []);

  const cleanupAudio = () => {
    try {
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      analyserRef.current = null;
      dataArrayRef.current = null;
    } catch (error) {
      console.error('Error cleaning up audio:', error);
    }
  };

  const setupAudioAnalyser = async (audioElement) => {
    try {
      // Clean up any existing audio context first
      cleanupAudio();
      
      if (!audioElement) {
        console.error('No audio element provided');
        setDownloadMessage('❌ No audio element available');
        return;
      }
      
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      dataArrayRef.current = dataArray;
      
      const source = audioContext.createMediaElementSource(audioElement);
      sourceRef.current = source;
      source.connect(analyser);
      analyser.connect(audioContext.destination);
      
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      audioElement.addEventListener('play', () => {
        console.log('Audio started playing!');
        setIsPlaying(true);
      });
      audioElement.addEventListener('pause', () => {
        console.log('Audio paused');
        setIsPlaying(false);
      });
      audioElement.addEventListener('ended', () => {
        console.log('Audio ended');
        setIsPlaying(false);
      });
      
      console.log('Audio analyser setup complete!');
    } catch (error) {
      console.error('Error setting up audio analyser:', error);
      setDownloadMessage('❌ Error setting up audio analysis');
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    console.log('File selected:', file.name);
    setAudioFile(file);
    setShowOptions(false);
    
    const audio = audioRef.current;
    if (!audio) {
      console.error('Audio element not found!');
      setDownloadMessage('❌ Audio element not found!');
      return;
    }
    
    // Remove old event listeners by cloning the element
    const newAudio = audio.cloneNode();
    audio.parentNode.replaceChild(newAudio, audio);
    audioRef.current = newAudio;
    
    console.log('Setting audio src...');
    newAudio.src = URL.createObjectURL(file);
    
    newAudio.addEventListener('loadeddata', () => {
      console.log('Audio file loaded successfully!');
      setupAudioAnalyser(newAudio);
      
      console.log('Attempting auto-play...');
      newAudio.play().then(() => {
        console.log('Auto-play started!');
        setIsPlaying(true);
      }).catch((e) => {
        console.log('Auto-play failed, user needs to click play:', e);
        setDownloadMessage('⚠️ Click play to start (auto-play blocked)');
        setTimeout(() => setDownloadMessage(''), 3000);
      });
    });
    
    newAudio.addEventListener('error', (e) => {
      console.error('Audio loading error:', e);
      setDownloadMessage('❌ Error loading audio file');
      setTimeout(() => setDownloadMessage(''), 5000);
    });
    
    console.log('Loading audio...');
    newAudio.load();
  };

  return (
    <div className="audio-visualizer">
      <div ref={containerRef} style={{ width: '100vw', height: '100vh', position: 'absolute', top: 0, left: 0, zIndex: 1 }} />
      
      {showOptions && (
        <div className="options-overlay" style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
          color: 'white',
          fontFamily: 'Saira, sans-serif'
        }}>
          <h1 style={{ marginBottom: '30px', fontSize: '2.5rem' }}>🎵 Audio Visualizer</h1>
          <p style={{ marginBottom: '30px', fontSize: '1.2rem', textAlign: 'center' }}>
            Upload an audio file to start:
          </p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '400px' }}>
            <div style={{ border: '1px solid #333', padding: '20px', borderRadius: '10px' }}>
              <h3>📁 Upload Audio File</h3>
              <label htmlFor="thefile" className="file-input-label" style={{
                display: 'block',
                width: '100%',
                padding: '10px',
                backgroundColor: '#333',
                textAlign: 'center',
                borderRadius: '5px',
                cursor: 'pointer'
              }}>
                Choose an audio file from your computer
                <input
                  ref={fileInputRef}
                  type="file"
                  id="thefile"
                  accept="audio/*"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {downloadMessage && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: downloadMessage.includes('✅') ? 'rgba(0, 200, 0, 0.9)' : 'rgba(200, 0, 0, 0.9)',
          color: 'white',
          padding: '15px 25px',
          borderRadius: '10px',
          zIndex: 12,
          fontSize: '16px',
          fontWeight: 'bold',
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
          animation: 'slideDown 0.3s ease-out'
        }}>
          {downloadMessage}
        </div>
      )}

      {/* Always render audio element but hide it when no file */}
      <audio ref={audioRef} controls style={{ width: 300, display: audioFile ? 'block' : 'none' }} />
      
      {audioFile && (
        <div className="controls" style={{ position: 'absolute', bottom: controlsPosition, left: '50%', transform: 'translateX(-50%)', zIndex: 2 }}>
          <div style={{ 
            backgroundColor: 'rgba(0, 0, 0, 0.8)', 
            padding: '15px', 
            borderRadius: '10px', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            gap: '10px'
          }}>
            <div style={{ color: 'white', fontSize: '14px', marginBottom: '5px' }}>
              {audioFile?.name && `🎵 ${audioFile.name}`}
            </div>
            <button
              onClick={async () => {
                const audio = audioRef.current;
                if (audio) {
                  if (audio.paused) {
                    try {
                      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                        await audioContextRef.current.resume();
                      }
                      await audio.play();
                    } catch (e) {
                      console.error('Play failed:', e);
                      setDownloadMessage('❌ Play failed: ' + e.message);
                      setTimeout(() => setDownloadMessage(''), 5000);
                    }
                  } else {
                    audio.pause();
                  }
                }
              }}
              style={{
                padding: '10px 20px',
                backgroundColor: isPlaying ? '#ff4444' : '#44ff44',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              {isPlaying ? '⏸️ Pause' : '▶️ Play'}
            </button>
            <button
              onClick={() => {
                console.log('Change song clicked');
                
                try {
                  // Stop and clean up current audio
                  const audio = audioRef.current;
                  if (audio) {
                    audio.pause();
                    audio.src = '';
                    audio.load();
                  }
                  
                  // Clean up audio context and analyser
                  cleanupAudio();
                  
                  // Reset file input to allow selecting same file again
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                  
                  // Reset state
                  setIsPlaying(false);
                  setAudioFile(null);
                  setShowOptions(true);
                  setDownloadMessage('');
                  
                  console.log('Reset complete, showing file picker');
                } catch (error) {
                  console.error('Error during change song:', error);
                  setDownloadMessage('❌ Error changing song');
                  setTimeout(() => setDownloadMessage(''), 3000);
                }
              }}
              style={{
                padding: '10px 20px',
                backgroundColor: '#333',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              🔄 Change Song
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AudioVisualizer;
