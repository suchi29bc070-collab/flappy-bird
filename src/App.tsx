/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Volume2,
  VolumeX,
  Download,
  Code2,
  Trophy,
  RotateCcw,
  Gamepad2,
  Check,
  Copy,
  ExternalLink,
  Sliders,
  Maximize2,
  Minimize2,
} from 'lucide-react';

type Difficulty = 'casual' | 'classic' | 'hardcore';

interface DifficultyConfig {
  name: string;
  pipeGap: number;
  pipeSpeed: number;
  gravity: number;
  flapForce: number;
  spawnInterval: number;
  description: string;
}

const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  casual: {
    name: 'Casual',
    pipeGap: 155,
    pipeSpeed: 2.1,
    gravity: 0.28,
    flapForce: -6.2,
    spawnInterval: 125,
    description: 'Wider gaps and gentler physics for relaxing flight',
  },
  classic: {
    name: 'Classic',
    pipeGap: 138,
    pipeSpeed: 2.5,
    gravity: 0.33,
    flapForce: -6.9,
    spawnInterval: 110,
    description: 'The authentic, challenging retro arcade experience',
  },
  hardcore: {
    name: 'Hardcore',
    pipeGap: 118,
    pipeSpeed: 3.0,
    gravity: 0.38,
    flapForce: -7.5,
    spawnInterval: 95,
    description: 'Tight gaps and high speeds for true masters',
  },
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // App UI State
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [highScore, setHighScore] = useState(0);
  const [currentScore, setCurrentScore] = useState(0);
  const [gameState, setGameState] = useState<'GET_READY' | 'PLAYING' | 'GAME_OVER'>('GET_READY');
  const [difficulty, setDifficulty] = useState<Difficulty>('classic');
  const [isCopied, setIsCopied] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [standaloneCode, setStandaloneCode] = useState<string>('');

  useEffect(() => {
    fetch('/flappy-bird.html')
      .then((res) => res.text())
      .then((code) => setStandaloneCode(code))
      .catch(() => {});
  }, []);

  // References to keep game loop fresh without restarting loop
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  const difficultyRef = useRef(difficulty);
  difficultyRef.current = difficulty;

  const audioCtxRef = useRef<AudioContext | null>(null);

  // Initialize Audio
  const playSound = useCallback((type: 'flap' | 'score' | 'hit' | 'die') => {
    if (!soundEnabledRef.current) return;
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          audioCtxRef.current = new AudioCtx();
        }
      }
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const now = ctx.currentTime;

      if (type === 'flap') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(650, now + 0.11);
        gain.gain.setValueAtTime(0.28, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.11);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'score') {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.type = 'triangle';
        osc2.type = 'triangle';
        osc1.frequency.setValueAtTime(587.33, now); // D5
        osc2.frequency.setValueAtTime(880, now + 0.08); // A5
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.linearRampToValueAtTime(0.25, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.08);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.32);
      } else if (type === 'hit') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.2);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'die') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(75, now + 0.32);
        gain.gain.setValueAtTime(0.28, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.32);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.33);
      }
    } catch {
      // Audio playback fails silently if restricted
    }
  }, []);

  // Fetch initial high score
  useEffect(() => {
    const saved = localStorage.getItem('flappy_high_score');
    if (saved) {
      setHighScore(parseInt(saved, 10) || 0);
    }
  }, []);

  // Reset or Action triggers
  const triggerActionRef = useRef<((clientX?: number, clientY?: number) => void) | null>(null);

  // Setup Canvas Game Engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rawCtx = canvas.getContext('2d');
    if (!rawCtx) return;
    const ctx: CanvasRenderingContext2D = rawCtx;

    const WIDTH = 400;
    const HEIGHT = 640;
    const GROUND_HEIGHT = 100;
    const PLAYABLE_HEIGHT = HEIGHT - GROUND_HEIGHT;
    const PIPE_WIDTH = 64;

    let frameCount = 0;
    let score = 0;
    let state: 'GET_READY' | 'PLAYING' | 'GAME_OVER' = 'GET_READY';
    let flashAlpha = 0;

    // Load highscore
    let localHigh = parseInt(localStorage.getItem('flappy_high_score') || '0', 10);

    // Particles
    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      alpha: number;
      color: string;
    }
    let particles: Particle[] = [];

    // Clouds
    const clouds = [
      { x: 30, y: 70, scale: 1.2, speed: 0.35 },
      { x: 190, y: 130, scale: 0.85, speed: 0.25 },
      { x: 330, y: 55, scale: 1.1, speed: 0.3 },
    ];

    // Bird
    const bird = {
      x: 105,
      y: PLAYABLE_HEIGHT / 2,
      radius: 17,
      vy: 0,
      rotation: 0,
      wingAngle: 0,
      reset() {
        this.x = 105;
        this.y = PLAYABLE_HEIGHT / 2;
        this.vy = 0;
        this.rotation = 0;
        this.wingAngle = 0;
      },
      flap(cfg: DifficultyConfig) {
        this.vy = cfg.flapForce;
        playSound('flap');
        // Puff particles
        for (let i = 0; i < 4; i++) {
          particles.push({
            x: this.x - 12 + Math.random() * 6,
            y: this.y + 4 + Math.random() * 6,
            vx: -1.6 - Math.random() * 2,
            vy: (Math.random() - 0.5) * 2,
            radius: 3 + Math.random() * 3,
            alpha: 0.85,
            color: '#ffffff',
          });
        }
      },
      update(cfg: DifficultyConfig) {
        if (state === 'GET_READY') {
          this.y = PLAYABLE_HEIGHT / 2 + Math.sin(frameCount * 0.08) * 8;
          this.rotation = 0;
          this.wingAngle = Math.sin(frameCount * 0.25) * 0.5;
        } else if (state === 'PLAYING') {
          this.vy += cfg.gravity;
          this.y += this.vy;

          if (this.vy < 0) {
            this.rotation = Math.max(-0.45, this.vy * 0.08);
            this.wingAngle = Math.sin(frameCount * 0.4) * 0.6;
          } else {
            this.rotation = Math.min(1.3, this.rotation + 0.04);
            this.wingAngle = 0.1;
          }

          // Top boundary check
          if (this.y - this.radius <= 0) {
            this.y = this.radius;
            this.vy = 0;
          }

          // Bottom ground collision check
          if (this.y + this.radius >= PLAYABLE_HEIGHT) {
            this.y = PLAYABLE_HEIGHT - this.radius;
            triggerGameOver();
          }
        } else if (state === 'GAME_OVER') {
          if (this.y + this.radius < PLAYABLE_HEIGHT) {
            this.vy += cfg.gravity * 1.5;
            this.y += this.vy;
            this.rotation = Math.min(1.5, this.rotation + 0.1);
          } else {
            this.y = PLAYABLE_HEIGHT - this.radius;
          }
        }
      },
      draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        // Bird shadow
        ctx.beginPath();
        ctx.ellipse(0, 16, this.radius * 0.8, 4, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.fill();

        // Bird Body (Circle with dark stroke)
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#facc15'; // Bright yellow
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#854d0e';
        ctx.stroke();

        // Belly highlight
        ctx.beginPath();
        ctx.arc(-2, 4, this.radius * 0.6, 0, Math.PI);
        ctx.fillStyle = '#fde047';
        ctx.fill();

        // Wing
        ctx.save();
        ctx.translate(-4, 1);
        ctx.rotate(this.wingAngle);
        ctx.beginPath();
        ctx.ellipse(-3, 0, 8, 5, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#854d0e';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // Big cartoon eye
        ctx.beginPath();
        ctx.arc(6, -6, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Pupil
        ctx.beginPath();
        ctx.arc(8, -6, 2.8, 0, Math.PI * 2);
        ctx.fillStyle = '#000000';
        ctx.fill();

        // Catchlight reflection
        ctx.beginPath();
        ctx.arc(7.2, -7.2, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Beak (Orange polygon)
        ctx.beginPath();
        ctx.moveTo(10, -2);
        ctx.lineTo(21, 3);
        ctx.lineTo(10, 8);
        ctx.closePath();
        ctx.fillStyle = '#ea580c';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#7c2d12';
        ctx.stroke();

        // Beak mouth crease
        ctx.beginPath();
        ctx.moveTo(11, 3);
        ctx.lineTo(19, 3);
        ctx.strokeStyle = '#7c2d12';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Cute blush
        ctx.beginPath();
        ctx.arc(1, 4, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.fill();

        ctx.restore();
      },
    };

    // Pipes
    interface Pipe {
      x: number;
      topHeight: number;
      bottomY: number;
      bottomHeight: number;
      passed: boolean;
    }
    let pipes: Pipe[] = [];

    function spawnPipe(cfg: DifficultyConfig) {
      const minTop = 60;
      const maxTop = PLAYABLE_HEIGHT - cfg.pipeGap - 60;
      const topHeight = Math.floor(Math.random() * (maxTop - minTop + 1)) + minTop;
      const bottomY = topHeight + cfg.pipeGap;
      const bottomHeight = PLAYABLE_HEIGHT - bottomY;

      pipes.push({
        x: WIDTH + 10,
        topHeight,
        bottomY,
        bottomHeight,
        passed: false,
      });
    }

    function checkCollision(b: typeof bird, p: Pipe): boolean {
      const hitTop = circleRectCollision(b.x, b.y, b.radius - 2, p.x, 0, PIPE_WIDTH, p.topHeight);
      const hitBottom = circleRectCollision(b.x, b.y, b.radius - 2, p.x, p.bottomY, PIPE_WIDTH, p.bottomHeight);
      return hitTop || hitBottom;
    }

    function circleRectCollision(
      cx: number,
      cy: number,
      cr: number,
      rx: number,
      ry: number,
      rw: number,
      rh: number
    ): boolean {
      const closestX = Math.max(rx, Math.min(cx, rx + rw));
      const closestY = Math.max(ry, Math.min(cy, ry + rh));
      const dx = cx - closestX;
      const dy = cy - closestY;
      return dx * dx + dy * dy < cr * cr;
    }

    function triggerGameOver() {
      if (state === 'GAME_OVER') return;
      state = 'GAME_OVER';
      setGameState('GAME_OVER');
      flashAlpha = 0.8;
      playSound('hit');
      setTimeout(() => playSound('die'), 120);

      // Feather burst particles
      for (let i = 0; i < 18; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 2 + Math.random() * 4.5;
        particles.push({
          x: bird.x,
          y: bird.y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          radius: 3 + Math.random() * 4,
          alpha: 1,
          color: Math.random() > 0.4 ? '#facc15' : '#ea580c',
        });
      }
    }

    function resetGame() {
      score = 0;
      setCurrentScore(0);
      pipes = [];
      particles = [];
      bird.reset();
      state = 'GET_READY';
      setGameState('GET_READY');
    }

    // Geometry of Restart Button on canvas
    const restartBtnRect = {
      x: WIDTH / 2 - 80,
      y: 380,
      w: 160,
      h: 46,
    };

    function handleAction(clientX?: number, clientY?: number) {
      const cfg = DIFFICULTIES[difficultyRef.current];

      if (state === 'GET_READY') {
        state = 'PLAYING';
        setGameState('PLAYING');
        bird.flap(cfg);
      } else if (state === 'PLAYING') {
        bird.flap(cfg);
      } else if (state === 'GAME_OVER') {
        if (clientX !== undefined && clientY !== undefined && canvas) {
          const rect = canvas.getBoundingClientRect();
          const scaleX = WIDTH / rect.width;
          const scaleY = HEIGHT / rect.height;
          const clickX = (clientX - rect.left) * scaleX;
          const clickY = (clientY - rect.top) * scaleY;

          if (
            clickX >= restartBtnRect.x &&
            clickX <= restartBtnRect.x + restartBtnRect.w &&
            clickY >= restartBtnRect.y &&
            clickY <= restartBtnRect.y + restartBtnRect.h
          ) {
            resetGame();
            return;
          }
        }
        resetGame();
      }
    }

    triggerActionRef.current = handleAction;

    // Ground scrolling
    let groundOffset = 0;

    // Drawing helper: Rounded Rect
    function drawRoundRect(x: number, y: number, w: number, h: number, r: number) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    // Main animation loop
    let animationId: number;

    function renderLoop() {
      frameCount++;
      const cfg = DIFFICULTIES[difficultyRef.current];

      // 1. Update Clouds
      for (const cloud of clouds) {
        cloud.x -= cloud.speed;
        if (cloud.x < -100) {
          cloud.x = WIDTH + 50;
          cloud.y = 40 + Math.random() * 120;
        }
      }

      // 2. Update Bird
      bird.update(cfg);

      // 3. Update Pipes
      if (state === 'PLAYING') {
        if (frameCount % cfg.spawnInterval === 0) {
          spawnPipe(cfg);
        }

        for (let i = pipes.length - 1; i >= 0; i--) {
          const p = pipes[i];
          p.x -= cfg.pipeSpeed;

          // Check passed
          if (!p.passed && p.x + PIPE_WIDTH < bird.x - bird.radius) {
            p.passed = true;
            score++;
            setCurrentScore(score);
            playSound('score');
            if (score > localHigh) {
              localHigh = score;
              setHighScore(score);
              localStorage.setItem('flappy_high_score', score.toString());
            }
          }

          // Check collision
          if (checkCollision(bird, p)) {
            triggerGameOver();
          }

          // Remove offscreen
          if (p.x + PIPE_WIDTH < -20) {
            pipes.splice(i, 1);
          }
        }
      }

      // 4. Update Ground
      if (state !== 'GAME_OVER') {
        groundOffset = (groundOffset + cfg.pipeSpeed) % 24;
      }

      // 5. Draw Sky & Background
      const skyGrad = ctx.createLinearGradient(0, 0, 0, PLAYABLE_HEIGHT);
      skyGrad.addColorStop(0, '#4ec0ca');
      skyGrad.addColorStop(0.7, '#82d9e3');
      skyGrad.addColorStop(1, '#bcf1f5');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Cityscape silhouette
      ctx.fillStyle = 'rgba(78, 170, 160, 0.45)';
      const buildings = [
        { x: 10, w: 35, h: 60 },
        { x: 50, w: 45, h: 90 },
        { x: 100, w: 30, h: 50 },
        { x: 135, w: 55, h: 110 },
        { x: 195, w: 40, h: 70 },
        { x: 240, w: 50, h: 95 },
        { x: 295, w: 35, h: 65 },
        { x: 335, w: 60, h: 105 },
      ];
      for (const b of buildings) {
        ctx.fillRect(b.x, PLAYABLE_HEIGHT - b.h, b.w, b.h);
      }

      // Clouds
      for (const c of clouds) {
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(c.x, c.y, 18 * c.scale, 0, Math.PI * 2);
        ctx.arc(c.x + 16 * c.scale, c.y - 8 * c.scale, 16 * c.scale, 0, Math.PI * 2);
        ctx.arc(c.x + 36 * c.scale, c.y - 4 * c.scale, 15 * c.scale, 0, Math.PI * 2);
        ctx.arc(c.x + 50 * c.scale, c.y + 2 * c.scale, 14 * c.scale, 0, Math.PI * 2);
        ctx.arc(c.x + 26 * c.scale, c.y + 8 * c.scale, 18 * c.scale, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // 6. Draw Pipes
      for (const p of pipes) {
        // Top Pipe
        drawPipeSegment(p.x, 0, PIPE_WIDTH, p.topHeight, true);
        // Bottom Pipe
        drawPipeSegment(p.x, p.bottomY, PIPE_WIDTH, p.bottomHeight, false);
      }

      function drawPipeSegment(px: number, py: number, pw: number, ph: number, isTop: boolean) {
        ctx.save();
        // Body gradient
        const bodyGrad = ctx.createLinearGradient(px, 0, px + pw, 0);
        bodyGrad.addColorStop(0, '#22c55e');
        bodyGrad.addColorStop(0.25, '#4ade80');
        bodyGrad.addColorStop(0.7, '#16a34a');
        bodyGrad.addColorStop(1, '#14532d');

        ctx.fillStyle = bodyGrad;
        ctx.fillRect(px, py, pw, ph);

        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#052e16';
        ctx.strokeRect(px, py, pw, ph);

        // Pipe rim cap
        const rimHeight = 24;
        const rimOverhang = 5;
        const rimX = px - rimOverhang;
        const rimW = pw + rimOverhang * 2;
        const rimY = isTop ? py + ph - rimHeight : py;

        const rimGrad = ctx.createLinearGradient(rimX, 0, rimX + rimW, 0);
        rimGrad.addColorStop(0, '#22c55e');
        rimGrad.addColorStop(0.2, '#86efac');
        rimGrad.addColorStop(0.75, '#16a34a');
        rimGrad.addColorStop(1, '#052e16');

        ctx.fillStyle = rimGrad;
        ctx.fillRect(rimX, rimY, rimW, rimHeight);
        ctx.strokeRect(rimX, rimY, rimW, rimHeight);

        // Highlight stripe
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.fillRect(px + 7, py, 4, ph);

        ctx.restore();
      }

      // 7. Draw Bird
      bird.draw();

      // 8. Update & Draw Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.vy += 0.08;
        pt.alpha -= 0.025;
        if (pt.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = Math.max(0, pt.alpha);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 9. Draw Ground
      const gy = PLAYABLE_HEIGHT;
      // Top Grass
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(0, gy, WIDTH, 14);

      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#14532d';
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(WIDTH, gy);
      ctx.stroke();

      // Grass stripe patterns
      ctx.fillStyle = '#16a34a';
      for (let x = -24; x < WIDTH + 24; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x - groundOffset, gy);
        ctx.lineTo(x - groundOffset + 12, gy + 14);
        ctx.lineTo(x - groundOffset + 6, gy + 14);
        ctx.lineTo(x - groundOffset - 6, gy);
        ctx.fill();
      }

      // Earth Dirt Body
      const dirtGrad = ctx.createLinearGradient(0, gy + 14, 0, HEIGHT);
      dirtGrad.addColorStop(0, '#ded895');
      dirtGrad.addColorStop(1, '#c8b675');
      ctx.fillStyle = dirtGrad;
      ctx.fillRect(0, gy + 14, WIDTH, GROUND_HEIGHT - 14);

      ctx.strokeStyle = '#854d0e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, gy + 14);
      ctx.lineTo(WIDTH, gy + 14);
      ctx.stroke();

      // Dirt pebble details
      ctx.fillStyle = '#a16207';
      for (let x = -24; x < WIDTH + 24; x += 36) {
        ctx.fillRect(x - groundOffset + 8, gy + 32, 4, 3);
        ctx.fillRect(x - groundOffset + 24, gy + 56, 5, 3);
      }

      // 10. Draw Score In-Game
      if (state === 'PLAYING') {
        ctx.save();
        ctx.font = '900 48px "Courier New", monospace, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#000000';
        ctx.strokeText(score.toString(), WIDTH / 2, 90);
        ctx.fillText(score.toString(), WIDTH / 2, 90);
        ctx.restore();
      }

      // 11. Draw Get Ready Screen
      if (state === 'GET_READY') {
        ctx.save();
        ctx.textAlign = 'center';

        // Title
        ctx.font = '900 32px "Courier New", monospace, sans-serif';
        ctx.fillStyle = '#f59e0b';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 6;
        ctx.strokeText('FLAPPY BIRD', WIDTH / 2, 160);
        ctx.fillText('FLAPPY BIRD', WIDTH / 2, 160);

        ctx.font = 'bold 14px "Courier New", monospace, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.strokeText('CANVAS RETRO CLONE', WIDTH / 2, 190);
        ctx.fillText('CANVAS RETRO CLONE', WIDTH / 2, 190);

        // Animated Button Prompt
        const pulse = 1 + Math.sin(frameCount * 0.1) * 0.05;
        ctx.save();
        ctx.translate(WIDTH / 2, 380);
        ctx.scale(pulse, pulse);

        ctx.fillStyle = '#22c55e';
        ctx.strokeStyle = '#052e16';
        ctx.lineWidth = 3;
        drawRoundRect(-100, -22, 200, 44, 10);
        ctx.fill();
        ctx.stroke();

        ctx.font = 'bold 16px "Courier New", monospace, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.strokeText('TAP OR SPACE', 0, 6);
        ctx.fillText('TAP OR SPACE', 0, 6);
        ctx.restore();

        ctx.font = 'bold 13px "Courier New", monospace, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.strokeText('Click / Tap or press Spacebar to Flap', WIDTH / 2, 440);
        ctx.fillText('Click / Tap or press Spacebar to Flap', WIDTH / 2, 440);

        ctx.restore();
      }

      // 12. Draw Game Over Screen
      if (state === 'GAME_OVER') {
        ctx.save();
        ctx.textAlign = 'center';

        // Header
        ctx.font = '900 36px "Courier New", monospace, sans-serif';
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 6;
        ctx.strokeText('GAME OVER', WIDTH / 2, 150);
        ctx.fillText('GAME OVER', WIDTH / 2, 150);

        // Card
        const cardX = 45;
        const cardY = 185;
        const cardW = WIDTH - 90;
        const cardH = 160;

        ctx.fillStyle = '#ded895';
        ctx.strokeStyle = '#543847';
        ctx.lineWidth = 4;
        drawRoundRect(cardX, cardY, cardW, cardH, 8);
        ctx.fill();
        ctx.stroke();

        // Inner shadow highlight
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        drawRoundRect(cardX + 4, cardY + 4, cardW - 8, cardH - 8, 6);
        ctx.stroke();

        // Medal label
        ctx.font = 'bold 12px "Courier New", monospace, sans-serif';
        ctx.fillStyle = '#854d0e';
        ctx.textAlign = 'left';
        ctx.fillText('MEDAL', cardX + 22, cardY + 36);

        // Medal circle
        const mx = cardX + 46;
        const my = cardY + 86;
        let medalColor: string | null = null;
        let medalBorder = '#000';

        if (score >= 40) {
          medalColor = '#38bdf8'; // Platinum
          medalBorder = '#0284c7';
        } else if (score >= 25) {
          medalColor = '#facc15'; // Gold
          medalBorder = '#a16207';
        } else if (score >= 15) {
          medalColor = '#cbd5e1'; // Silver
          medalBorder = '#64748b';
        } else if (score >= 5) {
          medalColor = '#d97706'; // Bronze
          medalBorder = '#78350f';
        }

        ctx.beginPath();
        ctx.arc(mx, my, 24, 0, Math.PI * 2);
        if (medalColor) {
          ctx.fillStyle = medalColor;
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = medalBorder;
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(mx, my, 10, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(0,0,0,0.1)';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = 'rgba(0,0,0,0.3)';
          ctx.stroke();
        }

        // Score display
        ctx.textAlign = 'right';
        ctx.font = 'bold 13px "Courier New", monospace, sans-serif';
        ctx.fillStyle = '#854d0e';
        ctx.fillText('SCORE', cardX + cardW - 20, cardY + 38);

        ctx.font = '900 28px "Courier New", monospace, sans-serif';
        ctx.fillStyle = '#000000';
        ctx.fillText(score.toString(), cardX + cardW - 20, cardY + 70);

        ctx.font = 'bold 13px "Courier New", monospace, sans-serif';
        ctx.fillStyle = '#854d0e';
        ctx.fillText('BEST', cardX + cardW - 20, cardY + 104);

        ctx.font = '900 28px "Courier New", monospace, sans-serif';
        ctx.fillStyle = '#000000';
        ctx.fillText(localHigh.toString(), cardX + cardW - 20, cardY + 136);

        // Restart Button
        ctx.textAlign = 'center';
        ctx.fillStyle = '#22c55e';
        ctx.strokeStyle = '#052e16';
        ctx.lineWidth = 3;
        drawRoundRect(restartBtnRect.x, restartBtnRect.y, restartBtnRect.w, restartBtnRect.h, 8);
        ctx.fill();
        ctx.stroke();

        ctx.font = '900 20px "Courier New", monospace, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#052e16';
        ctx.lineWidth = 4;
        ctx.strokeText('RESTART', WIDTH / 2, restartBtnRect.y + 30);
        ctx.fillText('RESTART', WIDTH / 2, restartBtnRect.y + 30);

        ctx.font = 'bold 12px "Courier New", monospace, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.strokeText('Press SPACE or Click RESTART', WIDTH / 2, 456);
        ctx.fillText('Press SPACE or Click RESTART', WIDTH / 2, 456);

        ctx.restore();
      }

      // 13. Screen flash
      if (flashAlpha > 0) {
        ctx.save();
        ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.restore();
        flashAlpha -= 0.05;
      }

      animationId = requestAnimationFrame(renderLoop);
    }

    animationId = requestAnimationFrame(renderLoop);

    // Event listeners
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        handleAction();
      }
    };

    const handleCanvasMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      handleAction(e.clientX, e.clientY);
    };

    const handleCanvasTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      handleAction(touch.clientX, touch.clientY);
    };

    window.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('mousedown', handleCanvasMouseDown);
    canvas.addEventListener('touchstart', handleCanvasTouchStart, { passive: false });

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('keydown', handleKeyDown);
      canvas.removeEventListener('mousedown', handleCanvasMouseDown);
      canvas.removeEventListener('touchstart', handleCanvasTouchStart);
    };
  }, [playSound]);

  // Download Standalone Single-File HTML
  const downloadSingleFile = () => {
    const trigger = (htmlContent: string) => {
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'flappy-bird.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    if (standaloneCode) {
      trigger(standaloneCode);
    } else {
      fetch('/flappy-bird.html')
        .then((res) => res.text())
        .then((html) => {
          setStandaloneCode(html);
          trigger(html);
        })
        .catch((err) => {
          console.error('Failed to download file', err);
        });
    }
  };

  const copyStandaloneCode = async () => {
    try {
      const text = standaloneCode || (await (await fetch('/flappy-bird.html')).text());
      if (!standaloneCode) setStandaloneCode(text);
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      setIsCopied(false);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-3 md:p-6 select-none font-sans">
      {/* Header bar */}
      <header className="w-full max-w-4xl flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Gamepad2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Flappy Bird Canvas
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                HTML5 & Vanilla JS
              </span>
            </h1>
            <p className="text-xs text-slate-400 hidden sm:block">
              Single-file standalone retro arcade clone · Smooth requestAnimationFrame physics
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Sound Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              soundEnabled
                ? 'bg-slate-800/80 hover:bg-slate-800 text-slate-200 border-slate-700'
                : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30'
            }`}
            title="Toggle Web Audio Synth Sound"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-rose-400" />}
            <span className="hidden sm:inline">{soundEnabled ? 'Sound On' : 'Muted'}</span>
          </button>

          {/* Download Standalone File */}
          <button
            onClick={downloadSingleFile}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-sm active:scale-95"
            title="Download complete single .html file to run anywhere offline"
          >
            <Download className="w-4 h-4" />
            <span>Download .html</span>
          </button>

          {/* View Code Modal */}
          <button
            onClick={() => setShowCodeModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            title="View inline HTML, CSS, and JS source code"
          >
            <Code2 className="w-4 h-4 text-sky-400" />
            <span className="hidden sm:inline">View Source</span>
          </button>
        </div>
      </header>

      {/* Main Game Stage Area */}
      <main className="w-full max-w-4xl flex-1 flex flex-col md:flex-row items-center justify-center gap-6 my-4">
        {/* Game Screen Container */}
        <div
          ref={containerRef}
          className="relative flex flex-col items-center justify-center p-2 rounded-2xl bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 border border-slate-700/60 shadow-2xl"
        >
          {/* Game Arcade Frame */}
          <div className="relative w-[340px] h-[544px] xs:w-[380px] xs:h-[608px] sm:w-[400px] sm:h-[640px] rounded-xl overflow-hidden shadow-inner bg-[#4ec0ca] border-2 border-slate-900">
            {/* Top HUD overlay within canvas */}
            <div className="absolute top-3 left-3 right-3 flex justify-between items-center pointer-events-none z-10">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/60 backdrop-blur-xs text-white border border-white/20 text-xs font-mono font-bold">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span>BEST: {highScore}</span>
              </div>

              <div className="flex items-center gap-1 pointer-events-auto">
                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className="p-1.5 rounded-lg bg-slate-900/60 hover:bg-slate-900/80 backdrop-blur-xs text-white border border-white/20 transition-all text-xs"
                  aria-label="Toggle Sound"
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-300" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
                </button>
                <button
                  onClick={toggleFullscreen}
                  className="p-1.5 rounded-lg bg-slate-900/60 hover:bg-slate-900/80 backdrop-blur-xs text-white border border-white/20 transition-all text-xs hidden sm:block"
                  aria-label="Fullscreen"
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* The HTML5 Canvas */}
            <canvas
              ref={canvasRef}
              width={400}
              height={640}
              className="w-full h-full block cursor-pointer touch-none"
            />
          </div>

          {/* Quick Arcade Controls Footer */}
          <div className="w-full mt-2.5 flex items-center justify-between px-2 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-slate-300">
                Space
              </span>
              <span>or Click to Flap</span>
            </span>
            <span className="font-mono text-slate-500">
              State: <span className="text-slate-300 font-semibold">{gameState}</span>
            </span>
          </div>
        </div>

        {/* Sidebar Controls & Game Details */}
        <div className="w-full md:w-80 flex flex-col gap-4">
          {/* Score & Record Card */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-md">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-amber-400" /> Scoreboard
            </h2>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
                <span className="block text-[11px] text-slate-400 mb-0.5">Current Score</span>
                <span className="text-2xl font-black font-mono text-white">{currentScore}</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
                <span className="block text-[11px] text-slate-400 mb-0.5">High Score</span>
                <span className="text-2xl font-black font-mono text-amber-400">{highScore}</span>
              </div>
            </div>
          </div>

          {/* Difficulty Selection */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-md">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-sky-400" /> Difficulty Setting
            </h2>
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-slate-950/70 border border-slate-800">
              {(['casual', 'classic', 'hardcore'] as Difficulty[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setDifficulty(mode)}
                  className={`py-1.5 px-2 rounded-md text-xs font-medium capitalize transition-all ${
                    difficulty === mode
                      ? 'bg-sky-600 text-white shadow-xs font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
              {DIFFICULTIES[difficulty].description}
            </p>
          </div>

          {/* Standalone Single-File Box */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-950/30 to-slate-900/80 border border-emerald-900/40 shadow-md">
            <div className="flex items-center gap-2 mb-2 text-emerald-400 font-semibold text-xs uppercase tracking-wider">
              <Download className="w-4 h-4" /> Single-File Portability
            </div>
            <p className="text-xs text-slate-300 leading-relaxed mb-3">
              This game is 100% self-contained in a single HTML file with inline CSS and vanilla JS canvas. Zero external assets, audio files, or images required!
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={downloadSingleFile}
                className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2 transition-all shadow-sm active:scale-98"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save Standalone flappy-bird.html</span>
              </button>

              <button
                onClick={copyStandaloneCode}
                className="w-full py-1.5 px-3 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center justify-center gap-1.5 transition-colors"
              >
                {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopied ? 'Code Copied to Clipboard!' : 'Copy Raw Single-File HTML'}</span>
              </button>
            </div>
          </div>

          {/* Action Restart Button */}
          {gameState === 'GAME_OVER' && (
            <button
              onClick={() => {
                if (triggerActionRef.current) {
                  triggerActionRef.current();
                }
              }}
              className="w-full py-2.5 px-4 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95 animate-pulse"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Restart Game (Space)</span>
            </button>
          )}
        </div>
      </main>

      {/* Code Viewer Modal */}
      {showCodeModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="w-5 h-5 text-sky-400" />
                <h3 className="font-semibold text-sm text-white">Standalone Single-File Code (HTML5 + Vanilla JS)</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyStandaloneCode}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 flex items-center gap-1"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopied ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  onClick={() => setShowCodeModal(false)}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto max-h-[60vh] font-mono text-xs text-slate-300 bg-slate-950 leading-relaxed select-text border-b border-slate-800">
              <pre className="whitespace-pre-wrap break-all text-emerald-400/90 font-mono text-[11px]">
                {standaloneCode || 'Loading standalone HTML...'}
              </pre>
            </div>

            <div className="px-5 py-3 border-t border-slate-800 bg-slate-900 flex justify-end gap-2">
              <button
                onClick={downloadSingleFile}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Download flappy-bird.html
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="w-full max-w-4xl pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-[11px] text-slate-500 gap-2">
        <div className="flex items-center gap-2">
          <span>HTML5 Canvas Game Loop</span>
          <span>·</span>
          <span>Synthesized Web Audio API</span>
          <span>·</span>
          <span>requestAnimationFrame</span>
        </div>
        <div>
          <span>Save as a single .html file &amp; run directly in any browser</span>
        </div>
      </footer>
    </div>
  );
}
