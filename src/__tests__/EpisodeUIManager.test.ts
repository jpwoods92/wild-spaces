import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type Phaser from 'phaser';
import {
  clamp,
  EpisodeUIManager,
  getStaminaSpeedMultiplier,
} from '../systems/EpisodeUIManager.ts';

interface MockGraphics {
  clearCalls: number;
  roundedRects: { x: number; y: number; w: number; h: number; r: number }[];
  rects: { x: number; y: number; w: number; h: number }[];
  strokeRects: { x: number; y: number; w: number; h: number }[];
  lineStyles: { width: number; color: number; alpha: number }[];
  clear(): MockGraphics;
  fillStyle(): MockGraphics;
  fillRoundedRect(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): MockGraphics;
  strokeRoundedRect(): MockGraphics;
  fillRect(x: number, y: number, w: number, h: number): MockGraphics;
  strokeRect(x: number, y: number, w: number, h: number): MockGraphics;
  lineStyle(width: number, color: number, alpha: number): MockGraphics;
  lineBetween(): MockGraphics;
  setScrollFactor(): MockGraphics;
  setDepth(): MockGraphics;
}

interface MockText {
  x: number;
  y: number;
  text: string;
  color: string;
  destroyed: boolean;
  width: number;
  active: boolean;
  setText(val: string): MockText;
  setPosition(x: number, y: number): MockText;
  setColor(c: string): MockText;
  setOrigin(): MockText;
  setScrollFactor(): MockText;
  setDepth(): MockText;
  destroy(): void;
}

function createMockScene(width = 1280, height = 720) {
  const graphicsList: MockGraphics[] = [];
  const textList: MockText[] = [];
  const tweenConfigs: { targets: unknown; onComplete?: () => void }[] = [];

  const scene = {
    scale: { width, height },
    time: {
      delayedCall: (_ms: number, _cb: () => void) => {},
    },
    tweens: {
      add: (cfg: { targets: unknown; onComplete?: () => void }) => {
        tweenConfigs.push(cfg);
      },
    },
    add: {
      graphics: () => {
        const g: MockGraphics = {
          clearCalls: 0,
          roundedRects: [],
          rects: [],
          strokeRects: [],
          lineStyles: [],
          clear() {
            this.clearCalls++;
            this.roundedRects = [];
            this.rects = [];
            this.strokeRects = [];
            this.lineStyles = [];
            return this;
          },
          fillStyle() {
            return this;
          },
          fillRoundedRect(x, y, w, h, r) {
            this.roundedRects.push({ x, y, w, h, r });
            return this;
          },
          strokeRoundedRect() {
            return this;
          },
          fillRect(x, y, w, h) {
            this.rects.push({ x, y, w, h });
            return this;
          },
          strokeRect(x, y, w, h) {
            this.strokeRects.push({ x, y, w, h });
            return this;
          },
          lineStyle(w, c, a) {
            this.lineStyles.push({ width: w, color: c, alpha: a });
            return this;
          },
          lineBetween() {
            return this;
          },
          setScrollFactor() {
            return this;
          },
          setDepth() {
            return this;
          },
        };
        graphicsList.push(g);
        return g;
      },
      text: (x: number, y: number, initialText: string) => {
        const t: MockText = {
          x,
          y,
          text: initialText,
          color: '',
          destroyed: false,
          active: true,
          get width() {
            return this.text.length * 8;
          },
          setText(val: string) {
            this.text = val;
            return this;
          },
          setPosition(nx: number, ny: number) {
            this.x = nx;
            this.y = ny;
            return this;
          },
          setColor(c: string) {
            this.color = c;
            return this;
          },
          setOrigin() {
            return this;
          },
          setScrollFactor() {
            return this;
          },
          setDepth() {
            return this;
          },
          destroy() {
            this.destroyed = true;
          },
        };
        textList.push(t);
        return t;
      },
    },
  };

  return {
    scene: scene as unknown as Phaser.Scene,
    graphicsList,
    textList,
    tweenConfigs,
  };
}

describe('EpisodeUIManager & shared stamina math helpers', () => {
  describe('clamp', () => {
    it('clamps numbers within [min, max]', () => {
      assert.equal(clamp(5, 0, 10), 5);
      assert.equal(clamp(-3, 0, 10), 0);
      assert.equal(clamp(14, 0, 10), 10);
    });
  });

  describe('getStaminaSpeedMultiplier', () => {
    it('returns 1.0 when maxStamina is at 100%', () => {
      assert.equal(getStaminaSpeedMultiplier(100, 0.52), 1.0);
      assert.equal(getStaminaSpeedMultiplier(120, 0.52), 1.0);
    });

    it('returns minFactor when maxStamina drops to 20% or below', () => {
      assert.equal(getStaminaSpeedMultiplier(20, 0.52), 0.52);
      assert.equal(getStaminaSpeedMultiplier(10, 0.54), 0.54);
    });

    it('interpolates linearly at 60% maxStamina (midpoint between 20 and 100)', () => {
      const mid = getStaminaSpeedMultiplier(60, 0.52);
      assert.ok(Math.abs(mid - 0.76) < 1e-6);
    });
  });

  describe('EpisodeUIManager rendering & layout', () => {
    it('renders top-left HUD with formatted clock, auto-sized card width, and low-stamina vignette', () => {
      const { scene, graphicsList, textList } = createMockScene(1440, 900);
      const ui = new EpisodeUIManager(scene, {
        accentColor: 0x38bdf8,
        accentHex: '#38bdf8',
        bottomHint: 'Controls hint',
        worldUiYOffset: 64,
        worldBarWidth: 72,
      });

      ui.renderTopHUD({
        headerPrefix: 'EPISODE 01 • LEVEL 2',
        elapsedSeconds: 65.4,
        heroValueText: '420m',
        subValueText: 'to Sanctuary (long status text)',
        progressPct: 0.65,
        stamina: 20, // < 35 triggers red danger vignette
      });

      const [hudLevelLabel, hudHeroText, hudSubText] = textList;
      assert.equal(hudLevelLabel.text, 'EPISODE 01 • LEVEL 2  •  ⏱ 01:05.4');
      assert.equal(hudHeroText.text, '420m');
      assert.equal(hudSubText.text, 'to Sanctuary (long status text)');

      // Card width expands to fit long text
      const hudGraphics = graphicsList[2];
      assert.ok(hudGraphics.roundedRects[0].w > 224);

      // Vignette strokes screen edge when stamina < 35
      const vignetteGraphics = graphicsList[1];
      assert.equal(vignetteGraphics.strokeRects.length, 1);
      assert.equal(vignetteGraphics.lineStyles[0].color, 0xef4444);
    });

    it('stacks secondary world bar and tag ABOVE the Stamina bar and renders depleted maxStamina ceiling', () => {
      const { scene, graphicsList, textList } = createMockScene();
      const ui = new EpisodeUIManager(scene, {
        accentColor: 0x818cf8,
        accentHex: '#818cf8',
        bottomHint: 'Whale hint',
        worldUiYOffset: 84,
        worldBarWidth: 78,
      });

      ui.renderWorldBars({
        x: 500,
        y: 600,
        stamina: 50,
        maxStamina: 75,
        primaryFillColor: 0x38bdf8,
        secondaryBar: {
          pct: 0.5,
          fillColor: 0xf59e0b,
          tagText: 'SONAR DISRUPTED • 2.1s',
          tagColor: '#fbbf24',
        },
      });

      const worldGraphics = graphicsList[3];
      const worldTag = textList[4];

      // Primary stamina bar is at y = 600 - 84 = 516; secondary bar is 14px above it (y = 502)
      const primaryBackdrop = worldGraphics.roundedRects[0];
      const secondaryBackdrop = worldGraphics.roundedRects[2];
      assert.ok(secondaryBackdrop.y < primaryBackdrop.y);

      // Depleted maxStamina ceiling draws a locked rect on the right side
      assert.equal(worldGraphics.rects.length, 1);

      // Tag text floats above the secondary bar
      assert.equal(worldTag.text, 'SONAR DISRUPTED • 2.1s');
      assert.ok(worldTag.y < secondaryBackdrop.y);
    });

    it('spawns floating notice and destroys it when tween completes', () => {
      const { scene, textList, tweenConfigs } = createMockScene();
      const ui = new EpisodeUIManager(scene, {
        accentColor: 0x38bdf8,
        accentHex: '#38bdf8',
        bottomHint: 'Hint',
        worldUiYOffset: 64,
      });

      ui.spawnFloatingNotice(300, 400, '+30% MAX STAMINA!', '#34d399');
      const noticeText = textList[textList.length - 1];
      assert.equal(noticeText.text, '+30% MAX STAMINA!');
      assert.equal(noticeText.destroyed, false);

      const lastTween = tweenConfigs[tweenConfigs.length - 1];
      lastTween.onComplete?.();
      assert.equal(noticeText.destroyed, true);
    });
  });
});
