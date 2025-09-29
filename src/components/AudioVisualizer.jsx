import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createNoise2D, createNoise3D } from 'simplex-noise';
import vertexShader from '../shaders/vertex.js';
import fragmentShader from '../shaders/fragment.js';
import { API_ENDPOINTS } from '../config/api';
import './AudioVisualizer.css';

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

const AudioVisualizer = ({ audioFile: propAudioFile, onAudioChange }) => {
  const containerRef = useRef(null);
  const audioRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const audioContextRef = useRef(null);
  const sourceRef = useRef(null);
  const [audioFile, setAudioFile] = useState(propAudioFile);
  const [showOptions, setShowOptions] = useState(true);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [controlsPosition, setControlsPosition] = useState(50);
  const fileInputRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [songQueue, setSongQueue] = useState(() => {
    const saved = localStorage.getItem('audioVisualizerQueue');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentQueueIndex, setCurrentQueueIndex] = useState(() => {
    const saved = localStorage.getItem('audioVisualizerCurrentIndex');
    return saved ? parseInt(saved) : 0;
  });
  const [showQueue, setShowQueue] = useState(false);
  // Track whether audioFile changes are initiated internally (so we can notify parent only then)
  const shouldNotifyParentRef = useRef(false);

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
    
    // Clear any existing children and append the renderer
    if (containerRef.current) {
      while (containerRef.current.firstChild) {
        containerRef.current.removeChild(containerRef.current.firstChild);
      }
      containerRef.current.appendChild(renderer.domElement);
    }

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
    const particleCount = 2000;
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

    let lastTime = 0;
    const targetFPS = 60;
    const frameInterval = 1000 / targetFPS;
    
    const animate = (currentTime) => {
      // Frame rate limiting
      if (currentTime - lastTime >= frameInterval) {
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
        lastTime = currentTime;
      }
      requestAnimationFrame(animate);
    };
    animate();

    return () => {
      renderer.dispose();
      window.removeEventListener('resize', onWindowResize);
      cleanupAudio();
    };
  }, []);

  // Save queue to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('audioVisualizerQueue', JSON.stringify(songQueue));
  }, [songQueue]);

  // Save current index to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('audioVisualizerCurrentIndex', currentQueueIndex.toString());
  }, [currentQueueIndex]);

  // Handle prop changes
  useEffect(() => {
    if (propAudioFile && propAudioFile !== audioFile) {
      setAudioFile(propAudioFile);
      // Load the audio file when it changes
      if (audioRef.current) {
        audioRef.current.src = propAudioFile.url;
        audioRef.current.load();
        // Stop any currently playing audio
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        // Reset visualizer state
        setIsPlaying(false);
      }
    }
  }, [propAudioFile]);

  // Function to play a specific audio file
  const playAudioFile = (audioData) => {
    if (audioRef.current && audioData && audioData.url) {
      audioRef.current.src = audioData.url;
      audioRef.current.load();
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  // Queue management functions
  const addToQueue = (audioData) => {
    const newSong = {
      id: Date.now() + Math.random(),
      name: audioData.name || audioData.title || 'Unknown Track',
      url: audioData.url,
      type: audioData.type || 'uploaded',
      thumbnail: audioData.thumbnail || null,
      duration: audioData.duration || null
    };
    
    setSongQueue(prev => [...prev, newSong]);
    
    // If no current song is playing, play this one
    if (!audioFile) {
      setCurrentQueueIndex(songQueue.length);
      setAudioFile(newSong);
    }
  };

  const removeFromQueue = (index) => {
    setSongQueue(prev => {
      const newQueue = prev.filter((_, i) => i !== index);
      
      // Adjust current index if needed
      if (index < currentQueueIndex) {
        setCurrentQueueIndex(prev => prev - 1);
      } else if (index === currentQueueIndex) {
        // If we're removing the current song, play the next one or stop
        if (newQueue.length > 0) {
          const nextIndex = Math.min(currentQueueIndex, newQueue.length - 1);
          setCurrentQueueIndex(nextIndex);
          setAudioFile(newQueue[nextIndex]);
        } else {
          setCurrentQueueIndex(0);
          setAudioFile(null);
          setIsPlaying(false);
        }
      }
      
      return newQueue;
    });
  };

  const playFromQueue = async (index) => {
    if (songQueue[index] && !isLoading) {
      const selectedSong = songQueue[index];
      setIsLoading(true);
      setCurrentQueueIndex(index);
      setShowOptions(false);
      
      try {
        // Clean up existing audio context
        cleanupAudio();
        
        // Stop current audio and wait for it to stop
        const audio = audioRef.current;
        if (audio) {
          audio.pause();
          audio.currentTime = 0;
          
          // Wait a bit before loading new audio
          await new Promise(resolve => setTimeout(resolve, 100));
          
          audio.src = '';
          audio.load();
        }
        
        // Set the new audio file
        setAudioFile(selectedSong);
        
        // Load the new audio
        if (audio) {
          const handleLoadedData = () => {
            setupAudioAnalyser(audio);
            audio.play().then(() => {
              setIsPlaying(true);
              setIsLoading(false);
            }).catch((e) => {
              setDownloadMessage('⚠️ Click play to start (auto-play blocked)');
              setTimeout(() => setDownloadMessage(''), 3000);
              setIsLoading(false);
            });
            
            // Remove event listener after use
            audio.removeEventListener('loadeddata', handleLoadedData);
          };
          
          const handleError = (e) => {
            console.error('Audio loading error:', e);
            setDownloadMessage('❌ Error loading audio file');
            setTimeout(() => setDownloadMessage(''), 5000);
            setIsLoading(false);
            
            // Remove event listener after use
            audio.removeEventListener('error', handleError);
          };
          
          audio.addEventListener('loadeddata', handleLoadedData);
          audio.addEventListener('error', handleError);
          
          audio.src = selectedSong.url;
          audio.load();
        }
      } catch (error) {
        console.error('Error playing from queue:', error);
        setDownloadMessage('❌ Error playing song');
        setTimeout(() => setDownloadMessage(''), 3000);
        setIsLoading(false);
      }
    }
  };

  const skipNext = () => {
    if (currentQueueIndex < songQueue.length - 1 && !isLoading) {
      const nextIndex = currentQueueIndex + 1;
      playFromQueue(nextIndex);
    }
  };

  const skipPrevious = () => {
    if (currentQueueIndex > 0 && !isLoading) {
      const prevIndex = currentQueueIndex - 1;
      playFromQueue(prevIndex);
    }
  };

  const clearQueue = () => {
    setSongQueue([]);
    setCurrentQueueIndex(0);
    setAudioFile(null);
    setIsPlaying(false);
  };

  // Expose playAudioFile function to parent component without causing render loops
  const onAudioChangeRef = useRef(onAudioChange);
  useEffect(() => {
    onAudioChangeRef.current = onAudioChange;
  }, [onAudioChange]);
  useEffect(() => {
    if (audioFile && shouldNotifyParentRef.current && onAudioChangeRef.current) {
      onAudioChangeRef.current({ ...audioFile, playAudioFile });
      // Reset the flag so external updates do not loop
      shouldNotifyParentRef.current = false;
    }
  }, [audioFile]);

  const cleanupAudio = () => {
    try {
      // Disconnect analyser first
      if (analyserRef.current) {
        try { analyserRef.current.disconnect(); } catch (_) {}
        analyserRef.current = null;
      }
      // Keep source node if we plan to reuse the same media element; just disconnect chains
      if (sourceRef.current) {
        try { sourceRef.current.disconnect(); } catch (_) {}
      }
      // Do not close AudioContext here; reuse improves reliability
      // We'll lazily create/resume it in setupAudioAnalyser
      dataArrayRef.current = null;
    } catch (error) {
      console.error('Error cleaning up audio:', error);
    }
  };

  const searchYouTube = async (query) => {
    if (!query.trim()) return;
    
    setIsSearching(true);
    setDownloadMessage('🔍 Searching YouTube...');
    
    try {
      const response = await fetch(`${API_ENDPOINTS.SEARCH}?q=${encodeURIComponent(query)}`);
      const results = await response.json();
      
      if (results.success) {
        console.log('🔍 Search results received:', results.data);
        setSearchResults(results.data);
        setShowSearchResults(true);
        setDownloadMessage('✅ Search completed!');
        setTimeout(() => setDownloadMessage(''), 2000);
      } else {
        setDownloadMessage('❌ Search failed: ' + results.error);
        setTimeout(() => setDownloadMessage(''), 3000);
      }
    } catch (error) {
      console.error('Search error:', error);
      setDownloadMessage('❌ Search failed: ' + error.message);
      setTimeout(() => setDownloadMessage(''), 3000);
    } finally {
      setIsSearching(false);
    }
  };

  const downloadAndPlayNow = async (videoId, format = 'mp3') => {
    console.log('🎵 DownloadAndPlayNow called with videoId:', videoId, 'format:', format);
    setIsDownloading(true);
    setDownloadMessage('🎵 Downloading and will play immediately...');
    
    try {
      const response = await fetch(API_ENDPOINTS.DOWNLOAD, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId: videoId,
          format: format
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setDownloadMessage('✅ Downloaded! Playing now...');
        
        // Convert base64 to blob
        const binaryString = atob(result.audioData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/mpeg' });
        
        // Create a file object from the downloaded audio
        const downloadedFile = new File([blob], result.filename, { type: 'audio/mpeg' });
        
        // Find the video info from search results
        const videoInfo = searchResults.find(video => video.id === videoId);
        
        // Create song data
        const songData = {
          name: result.filename,
          url: URL.createObjectURL(downloadedFile),
          type: 'downloaded',
          thumbnail: videoInfo?.thumbnail || '',
          duration: videoInfo?.duration || 0
        };
        
        // Add to queue
        addToQueue(songData);
        
        // Set as current audio file and play immediately
        shouldNotifyParentRef.current = true;
        setAudioFile(songData);
        setShowOptions(false);
        setShowSearchResults(false);
        
        // Load and play the audio immediately
        const audio = audioRef.current;
        if (audio && !isLoading) {
          setIsLoading(true);
          
          // Clean up existing audio context
          cleanupAudio();
          
          // Stop current audio and wait
          audio.pause();
          audio.currentTime = 0;
          
          // Wait a bit before loading new audio
          await new Promise(resolve => setTimeout(resolve, 100));
          
          audio.src = '';
          audio.load();
          
          const handleLoadedData = () => {
            setupAudioAnalyser(audio);
            audio.play().then(() => {
              setIsPlaying(true);
              setIsLoading(false);
              setDownloadMessage('🎵 Now playing!');
            }).catch((e) => {
              setDownloadMessage('⚠️ Click play to start (auto-play blocked)');
              setTimeout(() => setDownloadMessage(''), 3000);
              setIsLoading(false);
            });
            
            // Remove event listener after use
            audio.removeEventListener('loadeddata', handleLoadedData);
          };
          
          const handleError = (e) => {
            console.error('Audio loading error:', e);
            setDownloadMessage('❌ Error loading audio file');
            setTimeout(() => setDownloadMessage(''), 5000);
            setIsLoading(false);
            
            // Remove event listener after use
            audio.removeEventListener('error', handleError);
          };
          
          audio.addEventListener('loadeddata', handleLoadedData);
          audio.addEventListener('error', handleError);
          
          audio.src = songData.url;
          audio.load();
        }
        
        setTimeout(() => setDownloadMessage(''), 2000);
      } else {
        setDownloadMessage('❌ Download failed: ' + result.error);
        setTimeout(() => setDownloadMessage(''), 5000);
      }
    } catch (error) {
      console.error('Download error:', error);
      setDownloadMessage('❌ Download failed: ' + error.message);
      setTimeout(() => setDownloadMessage(''), 5000);
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadFromYouTube = async (videoId, format = 'mp3') => {
    console.log('⬇️ DownloadFromYouTube called with videoId:', videoId, 'format:', format);
    setIsDownloading(true);
    setDownloadMessage(`⬇️ Downloading ${format.toUpperCase()}...`);
    
    try {
      const response = await fetch(API_ENDPOINTS.DOWNLOAD, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId: videoId,
          format: format
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setDownloadMessage('✅ Downloaded and added to queue!');
        
        // Convert base64 to blob
        const binaryString = atob(result.audioData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/mpeg' });
        
        // Create a file object from the downloaded audio
        const downloadedFile = new File([blob], result.filename, { type: 'audio/mpeg' });
        
        // Find the video info from search results
        const videoInfo = searchResults.find(video => video.id === videoId);
        
        // Add to queue
        const songData = {
          name: result.filename,
          url: URL.createObjectURL(downloadedFile),
          type: 'downloaded',
          thumbnail: videoInfo?.thumbnail || '',
          duration: videoInfo?.duration || 0
        };
        addToQueue(songData);
        
        // If this is the first song or no song is currently playing, play it
        if (songQueue.length === 0 || !audioFile) {
          // mark as internal change so we notify parent once
          shouldNotifyParentRef.current = true;
          setAudioFile(songData);
          setShowOptions(false);
          setShowSearchResults(false);
          
          // Load and play the audio immediately
          const audio = audioRef.current;
          if (audio && !isLoading) {
            setIsLoading(true);
            
            // Clean up existing audio context
            cleanupAudio();
            
            // Stop current audio and wait
            audio.pause();
            audio.currentTime = 0;
            
            // Wait a bit before loading new audio
            await new Promise(resolve => setTimeout(resolve, 100));
            
            audio.src = '';
            audio.load();
            
            const handleLoadedData = () => {
              setupAudioAnalyser(audio);
              audio.play().then(() => {
                setIsPlaying(true);
                setIsLoading(false);
              }).catch((e) => {
                setDownloadMessage('⚠️ Click play to start (auto-play blocked)');
                setTimeout(() => setDownloadMessage(''), 3000);
                setIsLoading(false);
              });
              
              // Remove event listener after use
              audio.removeEventListener('loadeddata', handleLoadedData);
            };
            
            const handleError = (e) => {
              console.error('Audio loading error:', e);
              setDownloadMessage('❌ Error loading audio file');
              setTimeout(() => setDownloadMessage(''), 5000);
              setIsLoading(false);
              
              // Remove event listener after use
              audio.removeEventListener('error', handleError);
            };
            
            audio.addEventListener('loadeddata', handleLoadedData);
            audio.addEventListener('error', handleError);
            
            audio.src = songData.url;
            audio.load();
          }
        } else {
          // Just add to queue and show success message
          setDownloadMessage('✅ Added to queue! Click queue button to view.');
          setShowSearchResults(false);
        }
        
        setTimeout(() => setDownloadMessage(''), 2000);
      } else {
        setDownloadMessage('❌ Download failed: ' + result.error);
        setTimeout(() => setDownloadMessage(''), 5000);
      }
    } catch (error) {
      console.error('Download error:', error);
      setDownloadMessage('❌ Download failed: ' + error.message);
      setTimeout(() => setDownloadMessage(''), 5000);
    } finally {
      setIsDownloading(false);
    }
  };

  const setupAudioAnalyser = async (audioElement) => {
    try {
      // Ensure a single AudioContext exists (reuse)
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const audioContext = audioContextRef.current;
      
      // If we already created a source for this element, reuse it; else create once
      if (!sourceRef.current) {
        sourceRef.current = audioContext.createMediaElementSource(audioElement);
      }
      const source = sourceRef.current;
      
      // Create a fresh analyser and connect chain: source -> analyser -> destination
      if (analyserRef.current) {
        try { analyserRef.current.disconnect(); } catch (_) {}
      }
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyserRef.current = analyser;
      dataArrayRef.current = dataArray;
      
      // Reconnect graph
      source.disconnect();
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
    if (!file || isLoading) return;
    
    console.log('File selected:', file.name);
    setIsLoading(true);
    
    // Add to queue
    const songData = {
      name: file.name,
      url: URL.createObjectURL(file),
      type: 'uploaded',
      thumbnail: null,
      duration: null
    };
    addToQueue(songData);
    
    // mark as internal change so we notify parent once
    shouldNotifyParentRef.current = true;
    setAudioFile(songData);
    setShowOptions(false);
    
    // Clean up existing audio context
    cleanupAudio();
    
    // Create new audio element properly
    const audio = audioRef.current;
    if (audio) {
      // Stop current audio and wait for it to stop
      audio.pause();
      audio.currentTime = 0;
      
      // Wait a bit before loading new audio
      await new Promise(resolve => setTimeout(resolve, 100));
      
      audio.src = '';
      audio.load();
    }
    
    console.log('Setting audio src...');
    const audioUrl = URL.createObjectURL(file);
    
    const handleLoadedData = () => {
      console.log('Audio file loaded successfully!');
      setupAudioAnalyser(audio);
      
      console.log('Attempting auto-play...');
      audio.play().then(() => {
        console.log('Auto-play started!');
        setIsPlaying(true);
        setIsLoading(false);
      }).catch((e) => {
        console.log('Auto-play failed, user needs to click play:', e);
        setDownloadMessage('⚠️ Click play to start (auto-play blocked)');
        setTimeout(() => setDownloadMessage(''), 3000);
        setIsLoading(false);
      });
      
      // Remove event listener after use
      audio.removeEventListener('loadeddata', handleLoadedData);
    };
    
    const handleError = (e) => {
      console.error('Audio loading error:', e);
      setDownloadMessage('❌ Error loading audio file');
      setTimeout(() => setDownloadMessage(''), 5000);
      setIsLoading(false);
      
      // Remove event listener after use
      audio.removeEventListener('error', handleError);
    };
    
    audio.addEventListener('loadeddata', handleLoadedData);
    audio.addEventListener('error', handleError);
    
    console.log('Loading audio...');
    audio.src = audioUrl;
    audio.load();
  };

  return (
    <div className="audio-visualizer">
      <div ref={containerRef} className="visualizer-canvas" />
      
      {showOptions && (
        <div className="options-overlay">
          <div className="welcome-container">
            <div className="welcome-header">
              <h1 className="welcome-title">🎵 Audio Visualizer</h1>
              <p className="welcome-subtitle">Experience music like never before with stunning 3D visualizations</p>
            </div>
            
            <div className="options-grid">
              {/* YouTube Search Section */}
              <div className="option-card youtube-section">
                <div className="card-header">
                  <h3>🎵 YouTube Music</h3>
                  <p>Search and download from millions of songs</p>
                </div>
                
                <div className="search-container">
                  <div className="search-input-group">
                    <input
                      type="text"
                      placeholder="Search for songs, artists, or albums..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && searchYouTube(searchQuery)}
                      className="search-input"
                      disabled={isSearching}
                    />
                    <button
                      onClick={() => searchYouTube(searchQuery)}
                      disabled={isSearching || !searchQuery.trim()}
                      className="search-button"
                    >
                      {isSearching ? (
                        <span className="loading-spinner">⏳</span>
                      ) : (
                        <span>🔍 Search</span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Search Results */}
                {showSearchResults && searchResults.length > 0 && (
                  <div className="search-results">
                    <div className="results-header">
                      <h4>Search Results</h4>
                      <button
                        onClick={() => setShowSearchResults(false)}
                        className="close-results-btn"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="results-list">
                      {searchResults.map((video, index) => (
                        <div key={index} className="result-item">
                          <div className="result-thumbnail">
                            <img 
                              src={video.thumbnail} 
                              alt={video.title}
                              className="thumbnail-img"
                            />
                          </div>
                          <div className="result-info">
                            <h5 className="result-title" title={video.title}>
                              {video.title}
                            </h5>
                            <p className="result-meta">
                              {video.duration} • {video.views}
                            </p>
                          </div>
                          <div className="result-actions">
                            <button
                              onClick={() => {
                                console.log('🎵 MP3 button clicked for video:', video);
                                downloadFromYouTube(video.id, 'mp3');
                              }}
                              disabled={isDownloading}
                              className="download-btn mp3-btn"
                              title="Download MP3 and Add to Queue"
                            >
                              {isDownloading ? '⏳' : '🎵 MP3'}
                            </button>
                            <button
                              onClick={() => downloadFromYouTube(video.id, 'mp4')}
                              disabled={isDownloading}
                              className="download-btn mp4-btn"
                              title="Download MP4 and Add to Queue"
                            >
                              {isDownloading ? '⏳' : '🎬 MP4'}
                            </button>
                            <button
                              onClick={() => {
                                console.log('▶️ Play Now button clicked for video:', video);
                                downloadAndPlayNow(video.id, 'mp3');
                              }}
                              disabled={isDownloading}
                              className="download-btn play-now-btn"
                              title="Download and Play Now"
                            >
                              {isDownloading ? '⏳' : '▶️ Play Now'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* File Upload Section */}
              <div className="option-card upload-section">
                <div className="card-header">
                  <h3>📁 Upload Audio</h3>
                  <p>Choose an audio file from your device</p>
                </div>
                
                <label htmlFor="thefile" className="file-upload-area">
                  <div className="upload-icon">📁</div>
                  <div className="upload-text">
                    <span className="upload-title">Choose Audio File</span>
                    <span className="upload-subtitle">Supports MP3, WAV, M4A, and more</span>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    id="thefile"
                    accept="audio/*"
                    onChange={handleFileChange}
                    className="file-input"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Messages */}
      {downloadMessage && (
        <div className={`status-message ${downloadMessage.includes('✅') ? 'success' : 'error'}`}>
          <span className="status-icon">
            {downloadMessage.includes('✅') ? '✅' : '❌'}
          </span>
          <span className="status-text">{downloadMessage}</span>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner-large">⏳</div>
          <p>Loading audio...</p>
        </div>
      )}

      {/* Audio Controls */}
      {audioFile && (
        <div className="audio-controls">
          <div className="controls-panel">
            <div className="track-info">
              <div className="track-icon">🎵</div>
              <div className="track-details">
                <h4 className="track-name">{audioFile?.name || 'Unknown Track'}</h4>
                <p className="track-status">{isPlaying ? 'Now Playing' : 'Paused'}</p>
              </div>
            </div>
            
            <div className="control-buttons">
              <button
                onClick={skipPrevious}
                className="skip-button"
                disabled={isLoading || currentQueueIndex === 0}
                title="Previous Song"
              >
                ⏮️
              </button>
              
              <button
                onClick={async () => {
                  const audio = audioRef.current;
                  if (audio && !isLoading) {
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
                className={`play-button ${isPlaying ? 'playing' : 'paused'}`}
                disabled={isLoading}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? '⏸️' : '▶️'}
              </button>
              
              <button
                onClick={skipNext}
                className="skip-button"
                disabled={isLoading || currentQueueIndex >= songQueue.length - 1}
                title="Next Song"
              >
                ⏭️
              </button>
              
              <button
                onClick={() => setShowQueue(!showQueue)}
                className="queue-button"
                disabled={isLoading}
                title="Toggle Queue"
              >
                📋
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
                className="change-button"
                disabled={isLoading}
                title="Add More Songs"
              >
                ➕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Queue Panel */}
      {showQueue && (
        <div className="queue-panel">
          <div className="queue-header">
            <h3>🎵 Play Queue ({songQueue.length} songs)</h3>
            <div className="queue-actions">
              <button
                onClick={clearQueue}
                className="clear-queue-btn"
                disabled={songQueue.length === 0}
                title="Clear Queue"
              >
                🗑️ Clear
              </button>
              <button
                onClick={() => setShowQueue(false)}
                className="close-queue-btn"
                title="Close Queue"
              >
                ✕
              </button>
            </div>
          </div>
          
          <div className="queue-list">
            {songQueue.length === 0 ? (
              <div className="empty-queue">
                <p>No songs in queue</p>
                <p>Add songs to start building your playlist!</p>
              </div>
            ) : (
              songQueue.map((song, index) => (
                <div
                  key={song.id}
                  className={`queue-item ${index === currentQueueIndex ? 'current' : ''}`}
                  onClick={() => playFromQueue(index)}
                >
                  <div className="queue-item-info">
                    <div className="queue-item-thumbnail">
                      {song.thumbnail ? (
                        <img src={song.thumbnail} alt={song.name} />
                      ) : (
                        <div className="default-thumbnail">🎵</div>
                      )}
                    </div>
                    <div className="queue-item-details">
                      <h4 className="queue-item-title">{song.name}</h4>
                      <p className="queue-item-meta">
                        {song.type === 'downloaded' ? '📥 Downloaded' : '📁 Uploaded'}
                        {song.duration && ` • ${song.duration}`}
                      </p>
                    </div>
                  </div>
                  
                  <div className="queue-item-actions">
                    {index === currentQueueIndex && (
                      <span className="current-indicator">
                        {isLoading ? '⏳' : '▶️'}
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromQueue(index);
                      }}
                      className="remove-queue-btn"
                      title="Remove from Queue"
                    >
                      ❌
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Hidden audio element */}
      <audio ref={audioRef} controls className="hidden-audio" />
    </div>
  );
};

export default AudioVisualizer;

