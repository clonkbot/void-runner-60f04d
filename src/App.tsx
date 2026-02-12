import { useState, useRef, useCallback, useEffect, Suspense, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  OrbitControls,
  Environment,
  Float,
  MeshDistortMaterial,
  Text,
  Stars,
  Trail
} from '@react-three/drei'
import * as THREE from 'three'

// Game Constants
const LANE_WIDTH = 2.5
const LANES = [-LANE_WIDTH, 0, LANE_WIDTH]
const OBSTACLE_SPEED = 0.15
const SPAWN_INTERVAL = 1500
const JUMP_FORCE = 0.25
const GRAVITY = 0.012

// Types
interface Obstacle {
  id: number
  lane: number
  z: number
  type: 'crystal' | 'spike' | 'ring'
  rotation: number
}

// Player Cube Component
function PlayerCube({
  lane,
  isJumping,
  y,
  gameOver
}: {
  lane: number
  isJumping: boolean
  y: number
  gameOver: boolean
}) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const glowRef = useRef<THREE.Mesh>(null!)

  useFrame((state, delta) => {
    if (meshRef.current) {
      // Smooth lane transition
      meshRef.current.position.x = THREE.MathUtils.lerp(
        meshRef.current.position.x,
        LANES[lane],
        0.15
      )
      meshRef.current.position.y = y

      // Rotation animation
      meshRef.current.rotation.x += delta * 2
      meshRef.current.rotation.z += delta * 1.5

      // Pulse scale based on jumping
      const scale = isJumping ? 1.1 : 1 + Math.sin(state.clock.elapsedTime * 4) * 0.05
      meshRef.current.scale.setScalar(scale)
    }
    if (glowRef.current) {
      glowRef.current.position.x = meshRef.current.position.x
      glowRef.current.position.y = y
      glowRef.current.scale.setScalar(1.8 + Math.sin(state.clock.elapsedTime * 3) * 0.2)
    }
  })

  return (
    <group>
      <Trail
        width={2}
        length={6}
        color={gameOver ? '#ff2a6d' : '#05d9e8'}
        attenuation={(t) => t * t}
      >
        <mesh ref={meshRef} position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[0.6, 0.6, 0.6]} />
          <meshStandardMaterial
            color={gameOver ? '#ff2a6d' : '#05d9e8'}
            emissive={gameOver ? '#ff2a6d' : '#05d9e8'}
            emissiveIntensity={2}
            metalness={0.9}
            roughness={0.1}
          />
        </mesh>
      </Trail>
      <mesh ref={glowRef} position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshBasicMaterial
          color={gameOver ? '#ff2a6d' : '#05d9e8'}
          transparent
          opacity={0.15}
        />
      </mesh>
    </group>
  )
}

// Crystal Obstacle
function CrystalObstacle({ position, rotation }: { position: [number, number, number], rotation: number }) {
  const ref = useRef<THREE.Group>(null!)

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta
    }
  })

  return (
    <group ref={ref} position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow>
        <octahedronGeometry args={[0.8, 0]} />
        <meshStandardMaterial
          color="#ff2a6d"
          emissive="#ff2a6d"
          emissiveIntensity={1.5}
          metalness={0.8}
          roughness={0.2}
          transparent
          opacity={0.9}
        />
      </mesh>
      <mesh scale={1.3}>
        <octahedronGeometry args={[0.8, 0]} />
        <meshBasicMaterial
          color="#ff2a6d"
          transparent
          opacity={0.1}
          wireframe
        />
      </mesh>
    </group>
  )
}

// Spike Obstacle
function SpikeObstacle({ position, rotation }: { position: [number, number, number], rotation: number }) {
  const ref = useRef<THREE.Group>(null!)

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * 2
      ref.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 3) * 0.2
    }
  })

  return (
    <group ref={ref} position={position} rotation={[0, rotation, Math.PI]}>
      <mesh castShadow>
        <coneGeometry args={[0.5, 1.5, 4]} />
        <meshStandardMaterial
          color="#d300c5"
          emissive="#d300c5"
          emissiveIntensity={1.5}
          metalness={0.9}
          roughness={0.1}
        />
      </mesh>
      <mesh position={[0, -0.3, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.3, 0.8, 4]} />
        <meshStandardMaterial
          color="#7b2cbf"
          emissive="#7b2cbf"
          emissiveIntensity={1}
          metalness={0.9}
          roughness={0.1}
        />
      </mesh>
    </group>
  )
}

// Ring Obstacle (you can pass through but must jump)
function RingObstacle({ position, rotation }: { position: [number, number, number], rotation: number }) {
  const ref = useRef<THREE.Mesh>(null!)

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.x = state.clock.elapsedTime * 1.5
      ref.current.rotation.z = rotation + state.clock.elapsedTime
    }
  })

  return (
    <mesh ref={ref} position={position}>
      <torusGeometry args={[0.9, 0.15, 8, 32]} />
      <meshStandardMaterial
        color="#ffdd00"
        emissive="#ffdd00"
        emissiveIntensity={2}
        metalness={0.95}
        roughness={0.05}
      />
    </mesh>
  )
}

// Ground with grid effect
function Ground() {
  const ref = useRef<THREE.Mesh>(null!)

  useFrame((state) => {
    if (ref.current && ref.current.material instanceof THREE.ShaderMaterial) {
      ref.current.material.uniforms.time.value = state.clock.elapsedTime
    }
  })

  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        color1: { value: new THREE.Color('#0a0a0f') },
        color2: { value: new THREE.Color('#05d9e8') },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 color1;
        uniform vec3 color2;
        varying vec2 vUv;

        void main() {
          vec2 uv = vUv * 40.0;
          uv.y += time * 3.0;

          float lineX = smoothstep(0.0, 0.05, abs(fract(uv.x) - 0.5));
          float lineY = smoothstep(0.0, 0.05, abs(fract(uv.y) - 0.5));
          float grid = 1.0 - min(lineX, lineY);

          float glow = 1.0 - vUv.y;
          glow = pow(glow, 3.0);

          vec3 finalColor = mix(color1, color2, grid * 0.5 + glow * 0.3);
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `
    })
  }, [])

  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -20]} receiveShadow>
      <planeGeometry args={[30, 100]} />
      <primitive object={shaderMaterial} attach="material" />
    </mesh>
  )
}

// Side walls
function SideWalls() {
  return (
    <>
      {[-10, 10].map((x, i) => (
        <mesh key={i} position={[x, 5, -20]} rotation={[0, x > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}>
          <planeGeometry args={[100, 15]} />
          <meshStandardMaterial
            color="#0a0a0f"
            emissive="#05d9e8"
            emissiveIntensity={0.03}
            transparent
            opacity={0.8}
          />
        </mesh>
      ))}
    </>
  )
}

// Floating decorative elements
function FloatingDecorations() {
  const particles = useMemo(() => {
    const temp = []
    for (let i = 0; i < 50; i++) {
      temp.push({
        position: [
          (Math.random() - 0.5) * 20,
          Math.random() * 10 + 2,
          -Math.random() * 60 - 5
        ] as [number, number, number],
        scale: Math.random() * 0.15 + 0.05,
        speed: Math.random() * 0.5 + 0.5
      })
    }
    return temp
  }, [])

  return (
    <>
      {particles.map((p, i) => (
        <Float key={i} speed={p.speed} rotationIntensity={2} floatIntensity={1}>
          <mesh position={p.position} scale={p.scale}>
            <dodecahedronGeometry args={[1, 0]} />
            <MeshDistortMaterial
              color={i % 3 === 0 ? '#05d9e8' : i % 3 === 1 ? '#ff2a6d' : '#d300c5'}
              emissive={i % 3 === 0 ? '#05d9e8' : i % 3 === 1 ? '#ff2a6d' : '#d300c5'}
              emissiveIntensity={1}
              distort={0.3}
              speed={2}
              metalness={0.8}
              roughness={0.2}
            />
          </mesh>
        </Float>
      ))}
    </>
  )
}

// Game scene
function GameScene({
  obstacles,
  playerLane,
  playerY,
  isJumping,
  gameOver,
  score
}: {
  obstacles: Obstacle[]
  playerLane: number
  playerY: number
  isJumping: boolean
  gameOver: boolean
  score: number
}) {
  const { camera } = useThree()

  useEffect(() => {
    camera.position.set(0, 4, 6)
    camera.lookAt(0, 1, -10)
  }, [camera])

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <directionalLight
        position={[5, 10, 5]}
        intensity={1}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[0, 5, -10]} intensity={2} color="#05d9e8" />
      <pointLight position={[-5, 3, -20]} intensity={1.5} color="#ff2a6d" />
      <pointLight position={[5, 3, -30]} intensity={1.5} color="#d300c5" />

      {/* Background */}
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

      {/* Environment */}
      <Ground />
      <SideWalls />
      <FloatingDecorations />

      {/* Player */}
      <PlayerCube
        lane={playerLane}
        isJumping={isJumping}
        y={playerY}
        gameOver={gameOver}
      />

      {/* Obstacles */}
      {obstacles.map((obstacle) => {
        const position: [number, number, number] = [
          LANES[obstacle.lane],
          obstacle.type === 'ring' ? 1.5 : 0.8,
          obstacle.z
        ]

        switch (obstacle.type) {
          case 'crystal':
            return <CrystalObstacle key={obstacle.id} position={position} rotation={obstacle.rotation} />
          case 'spike':
            return <SpikeObstacle key={obstacle.id} position={position} rotation={obstacle.rotation} />
          case 'ring':
            return <RingObstacle key={obstacle.id} position={position} rotation={obstacle.rotation} />
          default:
            return null
        }
      })}

      {/* Score display in 3D */}
      <Text
        position={[0, 6, -15]}
        fontSize={1.5}
        color="#05d9e8"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.05}
        outlineColor="#0a0a0f"
      >
        {score.toString().padStart(6, '0')}
      </Text>

      {/* Game Over Text */}
      {gameOver && (
        <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
          <Text
            position={[0, 3, -5]}
            fontSize={0.8}
            color="#ff2a6d"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.03}
            outlineColor="#0a0a0f"
          >
            GAME OVER
          </Text>
        </Float>
      )}
    </>
  )
}

// Main App Component
export default function App() {
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'gameover'>('idle')
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(0)
  const [playerLane, setPlayerLane] = useState(1)
  const [playerY, setPlayerY] = useState(0.5)
  const [isJumping, setIsJumping] = useState(false)
  const [obstacles, setObstacles] = useState<Obstacle[]>([])

  const velocityY = useRef(0)
  const obstacleIdRef = useRef(0)
  const lastSpawnTime = useRef(0)
  const animationRef = useRef<number>()

  // Reset game
  const resetGame = useCallback(() => {
    setScore(0)
    setPlayerLane(1)
    setPlayerY(0.5)
    setIsJumping(false)
    setObstacles([])
    velocityY.current = 0
    obstacleIdRef.current = 0
    lastSpawnTime.current = 0
  }, [])

  // Start game
  const startGame = useCallback(() => {
    resetGame()
    setGameState('playing')
  }, [resetGame])

  // Jump
  const jump = useCallback(() => {
    if (!isJumping && playerY <= 0.6) {
      setIsJumping(true)
      velocityY.current = JUMP_FORCE
    }
  }, [isJumping, playerY])

  // Move left
  const moveLeft = useCallback(() => {
    setPlayerLane(prev => Math.max(0, prev - 1))
  }, [])

  // Move right
  const moveRight = useCallback(() => {
    setPlayerLane(prev => Math.min(2, prev + 1))
  }, [])

  // Game loop
  useEffect(() => {
    if (gameState !== 'playing') return

    let lastTime = performance.now()

    const gameLoop = (currentTime: number) => {
      const deltaTime = currentTime - lastTime
      lastTime = currentTime

      // Update score
      setScore(prev => prev + 1)

      // Spawn obstacles
      if (currentTime - lastSpawnTime.current > SPAWN_INTERVAL) {
        lastSpawnTime.current = currentTime
        const types: Array<'crystal' | 'spike' | 'ring'> = ['crystal', 'spike', 'ring']
        const newObstacle: Obstacle = {
          id: obstacleIdRef.current++,
          lane: Math.floor(Math.random() * 3),
          z: -60,
          type: types[Math.floor(Math.random() * types.length)],
          rotation: Math.random() * Math.PI * 2
        }
        setObstacles(prev => [...prev, newObstacle])
      }

      // Update obstacles
      setObstacles(prev => {
        const updated = prev
          .map(obs => ({ ...obs, z: obs.z + OBSTACLE_SPEED * deltaTime * 0.06 }))
          .filter(obs => obs.z < 10)

        // Collision detection
        for (const obs of updated) {
          if (obs.z > -1 && obs.z < 1) {
            const playerX = LANES[playerLane]
            const obsX = LANES[obs.lane]

            if (Math.abs(playerX - obsX) < 1) {
              // Check if player avoided by jumping (for rings, you need to be at ring height)
              if (obs.type === 'ring') {
                if (playerY < 1.2) {
                  // Hit the ring from below
                  setGameState('gameover')
                  setHighScore(prev => Math.max(prev, score))
                }
              } else {
                // For crystals and spikes, jumping over them works
                if (playerY < 1.5) {
                  setGameState('gameover')
                  setHighScore(prev => Math.max(prev, score))
                }
              }
            }
          }
        }

        return updated
      })

      // Update player Y position (jumping physics)
      setPlayerY(prev => {
        velocityY.current -= GRAVITY
        const newY = Math.max(0.5, prev + velocityY.current)

        if (newY <= 0.5) {
          velocityY.current = 0
          setIsJumping(false)
          return 0.5
        }

        return newY
      })

      animationRef.current = requestAnimationFrame(gameLoop)
    }

    animationRef.current = requestAnimationFrame(gameLoop)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [gameState, playerLane, playerY, score])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState === 'idle' || gameState === 'gameover') {
        if (e.code === 'Space' || e.code === 'Enter') {
          startGame()
        }
        return
      }

      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          moveLeft()
          break
        case 'ArrowRight':
        case 'KeyD':
          moveRight()
          break
        case 'Space':
        case 'ArrowUp':
        case 'KeyW':
          jump()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [gameState, startGame, moveLeft, moveRight, jump])

  // Touch controls
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (gameState === 'idle' || gameState === 'gameover') {
      startGame()
      return
    }

    const deltaX = e.changedTouches[0].clientX - touchStartX.current
    const deltaY = e.changedTouches[0].clientY - touchStartY.current

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX > 30) moveRight()
      else if (deltaX < -30) moveLeft()
    } else {
      if (deltaY < -30) jump()
    }
  }, [gameState, startGame, moveLeft, moveRight, jump])

  return (
    <div
      className="w-screen h-screen bg-[#050508] overflow-hidden relative"
      style={{ touchAction: 'none' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* 3D Canvas */}
      <Canvas
        shadows
        camera={{ position: [0, 4, 6], fov: 75 }}
        style={{ background: 'linear-gradient(180deg, #0a0a0f 0%, #1a0a2e 50%, #050508 100%)' }}
      >
        <Suspense fallback={null}>
          <fog attach="fog" args={['#050508', 10, 70]} />
          <GameScene
            obstacles={obstacles}
            playerLane={playerLane}
            playerY={playerY}
            isJumping={isJumping}
            gameOver={gameState === 'gameover'}
            score={score}
          />
        </Suspense>
      </Canvas>

      {/* UI Overlay */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Title & Start Screen */}
        {gameState === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-auto">
            <div className="text-center">
              <h1
                className="text-4xl md:text-6xl lg:text-8xl font-black tracking-tighter mb-2"
                style={{
                  fontFamily: '"Orbitron", sans-serif',
                  color: '#05d9e8',
                  textShadow: '0 0 40px rgba(5, 217, 232, 0.8), 0 0 80px rgba(5, 217, 232, 0.4)'
                }}
              >
                VOID
              </h1>
              <h2
                className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-widest mb-8"
                style={{
                  fontFamily: '"Orbitron", sans-serif',
                  color: '#ff2a6d',
                  textShadow: '0 0 30px rgba(255, 42, 109, 0.6)'
                }}
              >
                RUNNER
              </h2>

              <button
                onClick={startGame}
                className="px-8 py-4 md:px-12 md:py-5 text-lg md:text-xl font-bold tracking-wider transition-all duration-300 hover:scale-110 active:scale-95"
                style={{
                  fontFamily: '"Orbitron", sans-serif',
                  background: 'linear-gradient(135deg, #05d9e8 0%, #d300c5 100%)',
                  color: '#0a0a0f',
                  borderRadius: '4px',
                  boxShadow: '0 0 30px rgba(5, 217, 232, 0.5), inset 0 0 20px rgba(255, 255, 255, 0.2)'
                }}
              >
                START GAME
              </button>

              <div
                className="mt-8 text-sm md:text-base opacity-70"
                style={{ fontFamily: '"Orbitron", sans-serif', color: '#05d9e8' }}
              >
                <p className="mb-2">DESKTOP: Arrow keys or WASD to move & jump</p>
                <p>MOBILE: Swipe left/right to move, swipe up to jump</p>
              </div>

              {highScore > 0 && (
                <div
                  className="mt-6 text-xl md:text-2xl"
                  style={{
                    fontFamily: '"Orbitron", sans-serif',
                    color: '#ffdd00',
                    textShadow: '0 0 20px rgba(255, 221, 0, 0.5)'
                  }}
                >
                  HIGH SCORE: {highScore.toString().padStart(6, '0')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Game Over Screen */}
        {gameState === 'gameover' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 pointer-events-auto">
            <div className="text-center p-6 md:p-8">
              <h2
                className="text-3xl md:text-5xl font-black tracking-wider mb-4"
                style={{
                  fontFamily: '"Orbitron", sans-serif',
                  color: '#ff2a6d',
                  textShadow: '0 0 40px rgba(255, 42, 109, 0.8)'
                }}
              >
                GAME OVER
              </h2>

              <div
                className="text-2xl md:text-4xl mb-2"
                style={{
                  fontFamily: '"Orbitron", sans-serif',
                  color: '#05d9e8',
                  textShadow: '0 0 20px rgba(5, 217, 232, 0.6)'
                }}
              >
                SCORE: {score.toString().padStart(6, '0')}
              </div>

              {score >= highScore && score > 0 && (
                <div
                  className="text-lg md:text-xl mb-6 animate-pulse"
                  style={{
                    fontFamily: '"Orbitron", sans-serif',
                    color: '#ffdd00',
                    textShadow: '0 0 20px rgba(255, 221, 0, 0.6)'
                  }}
                >
                  NEW HIGH SCORE!
                </div>
              )}

              <button
                onClick={startGame}
                className="px-8 py-4 md:px-10 md:py-4 text-base md:text-lg font-bold tracking-wider transition-all duration-300 hover:scale-110 active:scale-95 mt-4"
                style={{
                  fontFamily: '"Orbitron", sans-serif',
                  background: 'linear-gradient(135deg, #ff2a6d 0%, #d300c5 100%)',
                  color: '#ffffff',
                  borderRadius: '4px',
                  boxShadow: '0 0 30px rgba(255, 42, 109, 0.5)'
                }}
              >
                PLAY AGAIN
              </button>
            </div>
          </div>
        )}

        {/* In-game HUD */}
        {gameState === 'playing' && (
          <>
            {/* Mobile Controls */}
            <div className="absolute bottom-20 left-0 right-0 flex justify-center gap-4 md:hidden pointer-events-auto">
              <button
                onTouchStart={(e) => { e.preventDefault(); moveLeft(); }}
                className="w-16 h-16 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                style={{
                  background: 'rgba(5, 217, 232, 0.3)',
                  border: '2px solid rgba(5, 217, 232, 0.6)',
                  boxShadow: '0 0 20px rgba(5, 217, 232, 0.3)'
                }}
              >
                <span className="text-2xl" style={{ color: '#05d9e8' }}>←</span>
              </button>
              <button
                onTouchStart={(e) => { e.preventDefault(); jump(); }}
                className="w-16 h-16 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                style={{
                  background: 'rgba(255, 221, 0, 0.3)',
                  border: '2px solid rgba(255, 221, 0, 0.6)',
                  boxShadow: '0 0 20px rgba(255, 221, 0, 0.3)'
                }}
              >
                <span className="text-2xl" style={{ color: '#ffdd00' }}>↑</span>
              </button>
              <button
                onTouchStart={(e) => { e.preventDefault(); moveRight(); }}
                className="w-16 h-16 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                style={{
                  background: 'rgba(5, 217, 232, 0.3)',
                  border: '2px solid rgba(5, 217, 232, 0.6)',
                  boxShadow: '0 0 20px rgba(5, 217, 232, 0.3)'
                }}
              >
                <span className="text-2xl" style={{ color: '#05d9e8' }}>→</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <footer
        className="absolute bottom-2 md:bottom-4 left-0 right-0 text-center text-xs md:text-sm pointer-events-none"
        style={{
          fontFamily: '"Orbitron", sans-serif',
          color: 'rgba(5, 217, 232, 0.4)',
          letterSpacing: '0.05em'
        }}
      >
        Requested by @trustnoneisakey · Built by @clonkbot
      </footer>
    </div>
  )
}
