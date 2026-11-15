import Phaser from 'phaser';
import { formatHudClock } from '../utils/LeaderboardStore';

export interface EpisodeHudConfig {
  accentColor: number;
  accentHex: string;
  bottomHint: string;
  autoFadeHintMs?: number;
  worldUiYOffset: number;
  worldBarWidth?: number;
}

export interface TopCardRenderState {
  headerPrefix: string;
  elapsedSeconds: number;
  heroValueText: string;
  subValueText: string;
  progressPct: number; // 0..1
  stamina: number;
  secondaryVignetteColor?: number;
  secondaryVignetteAlpha?: number;
}

export interface WorldBarRenderState {
  x: number;
  y: number;
  stamina: number;
  maxStamina: number;
  primaryFillColor: number;
  secondaryBar?: {
    pct: number; // 0..1
    fillColor: number;
    tagText: string;
    tagColor: string;
  };
}

/**
 * Shared UI, HUD, Vignette, Over-the-Animal World Bars, and Floating Notice manager
 * used across all Wild Spaces episodes so UI rendering is never duplicated.
 */
export class EpisodeUIManager {
  private scene: Phaser.Scene;
  private config: EpisodeHudConfig;

  private viewportBg!: Phaser.GameObjects.Graphics;
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private hudLevelLabel!: Phaser.GameObjects.Text;
  private hudHeroText!: Phaser.GameObjects.Text;
  private hudSubText!: Phaser.GameObjects.Text;
  private hudHintText!: Phaser.GameObjects.Text;
  private vignetteGraphics!: Phaser.GameObjects.Graphics;

  private worldUiGraphics!: Phaser.GameObjects.Graphics;
  private worldUiTagText!: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, config: EpisodeHudConfig) {
    this.scene = scene;
    this.config = config;
    this.createElements();
  }

  private createElements(): void {
    this.viewportBg = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(-20);
    this.redrawViewportBg(0x040d17);

    this.vignetteGraphics = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(95);

    this.hudGraphics = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(100);

    this.hudLevelLabel = this.scene.add
      .text(28, 22, '', {
        fontSize: '11px',
        fontStyle: 'bold',
        color: this.config.accentHex,
        letterSpacing: 1.5,
      })
      .setScrollFactor(0)
      .setDepth(101);

    this.hudHeroText = this.scene.add
      .text(28, 39, '0m', {
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#f8fafc',
      })
      .setScrollFactor(0)
      .setDepth(101);

    this.hudSubText = this.scene.add
      .text(102, 49, '', {
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#94a3b8',
      })
      .setScrollFactor(0)
      .setDepth(101);

    this.hudHintText = this.scene.add
      .text(
        this.scene.scale.width / 2,
        this.scene.scale.height - 26,
        this.config.bottomHint,
        {
          fontSize: '12px',
          fontStyle: 'bold',
          color: '#e2e8f0',
          backgroundColor: 'rgba(6, 16, 26, 0.84)',
          padding: { x: 14, y: 8 },
        }
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(101);

    if (this.config.autoFadeHintMs && this.config.autoFadeHintMs > 0) {
      this.scene.time.delayedCall(this.config.autoFadeHintMs, () => {
        if (this.hudHintText && this.hudHintText.active) {
          this.scene.tweens.add({
            targets: this.hudHintText,
            alpha: 0,
            duration: 1200,
          });
        }
      });
    }

    this.worldUiGraphics = this.scene.add.graphics().setDepth(45);
    this.worldUiTagText = this.scene.add
      .text(0, 0, '', {
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#fbbf24',
        backgroundColor: 'rgba(4, 13, 23, 0.85)',
        padding: { x: 6, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(46);
  }

  public redrawViewportBg(fillColor = 0x040d17): void {
    if (!this.viewportBg) return;
    this.viewportBg.clear();
    this.viewportBg.fillStyle(fillColor, 1);
    this.viewportBg.fillRect(
      0,
      0,
      this.scene.scale.width + 200,
      this.scene.scale.height + 200
    );
  }

  public handleResize(fillColor = 0x040d17): void {
    this.redrawViewportBg(fillColor);
    if (this.hudHintText) {
      this.hudHintText.setPosition(
        this.scene.scale.width / 2,
        this.scene.scale.height - 26
      );
    }
  }

  public renderTopHUD(state: TopCardRenderState): void {
    const { width, height } = this.scene.scale;
    const clampedPct = Phaser.Math.Clamp(state.progressPct, 0, 1);

    this.hudLevelLabel.setText(
      `${state.headerPrefix}  •  ⏱ ${formatHudClock(state.elapsedSeconds)}`
    );
    this.hudHeroText.setText(state.heroValueText);
    this.hudSubText.setPosition(
      this.hudHeroText.x + this.hudHeroText.width + 8,
      49
    );
    this.hudSubText.setText(state.subValueText);

    const cardX = 16;
    const cardY = 12;
    const rightEdge = Math.max(
      this.hudLevelLabel.x + this.hudLevelLabel.width,
      this.hudSubText.x + this.hudSubText.width
    );
    const cardW = Math.max(224, rightEdge - cardX + 20);
    const cardH = 78;

    this.hudGraphics.clear();
    this.hudGraphics.fillStyle(0x06121e, 0.86);
    this.hudGraphics.fillRoundedRect(cardX, cardY, cardW, cardH, 10);
    this.hudGraphics.lineStyle(1, this.config.accentColor, 0.28);
    this.hudGraphics.strokeRoundedRect(cardX, cardY, cardW, cardH, 10);

    const progW = cardW - 24;
    this.hudGraphics.fillStyle(0x0f172a, 0.95);
    this.hudGraphics.fillRoundedRect(cardX + 12, cardY + 62, progW, 5, 2);
    if (clampedPct > 0.005) {
      this.hudGraphics.fillStyle(this.config.accentColor, 0.96);
      this.hudGraphics.fillRoundedRect(
        cardX + 12,
        cardY + 62,
        Math.max(4, progW * clampedPct),
        5,
        2
      );
    }

    // Screen-edge vignette for low stamina or secondary environmental interference
    this.vignetteGraphics.clear();
    if (state.stamina < 35) {
      const dangerAlpha = ((35 - state.stamina) / 35) * 0.45;
      this.vignetteGraphics.lineStyle(24, 0xef4444, dangerAlpha);
      this.vignetteGraphics.strokeRect(0, 0, width, height);
    } else if (
      state.secondaryVignetteColor !== undefined &&
      state.secondaryVignetteAlpha &&
      state.secondaryVignetteAlpha > 0
    ) {
      this.vignetteGraphics.lineStyle(
        18,
        state.secondaryVignetteColor,
        state.secondaryVignetteAlpha
      );
      this.vignetteGraphics.strokeRect(0, 0, width, height);
    }
  }

  public renderWorldBars(state: WorldBarRenderState): void {
    this.worldUiGraphics.clear();

    const barW = this.config.worldBarWidth ?? 74;
    const barH = 9;
    const bx = state.x - barW / 2;
    const by = state.y - this.config.worldUiYOffset;

    // 1. Stamina Bar backdrop pill
    this.worldUiGraphics.fillStyle(0x040d17, 0.9);
    this.worldUiGraphics.fillRoundedRect(bx - 2, by - 2, barW + 4, barH + 4, 4);

    // Locked / Depleted Max Stamina Ceiling
    const clampedMax = Phaser.Math.Clamp(state.maxStamina / 100, 0.2, 1);
    if (clampedMax < 0.995) {
      const capX = bx + barW * clampedMax;
      const lostW = bx + barW - capX;
      this.worldUiGraphics.fillStyle(0x7f1d1d, 0.9);
      this.worldUiGraphics.fillRect(capX, by, lostW, barH);
      this.worldUiGraphics.lineStyle(1.5, 0xf87171, 0.95);
      this.worldUiGraphics.lineBetween(capX, by, capX, by + barH);
    }

    // Current Stamina Fill
    const staminaPct = Phaser.Math.Clamp(state.stamina / 100, 0, clampedMax);
    if (staminaPct > 0) {
      this.worldUiGraphics.fillStyle(state.primaryFillColor, 0.96);
      this.worldUiGraphics.fillRoundedRect(
        bx,
        by,
        Math.max(3, barW * staminaPct),
        barH,
        2
      );
    }

    // 2. Secondary Bar + Tag stacked ABOVE the Stamina bar so nothing crowds the animal
    if (state.secondaryBar) {
      const topBarH = 5;
      const topBarY = by - 14;
      const pct = Phaser.Math.Clamp(state.secondaryBar.pct, 0, 1);

      this.worldUiGraphics.fillStyle(0x040d17, 0.9);
      this.worldUiGraphics.fillRoundedRect(
        bx - 2,
        topBarY - 1,
        barW + 4,
        topBarH + 2,
        3
      );
      this.worldUiGraphics.fillStyle(state.secondaryBar.fillColor, 0.95);
      this.worldUiGraphics.fillRoundedRect(
        bx,
        topBarY,
        Math.max(3, barW * pct),
        topBarH,
        2
      );

      this.worldUiTagText.setPosition(state.x, topBarY - 8);
      this.worldUiTagText.setColor(state.secondaryBar.tagColor);
      this.worldUiTagText.setText(state.secondaryBar.tagText);
    } else {
      this.worldUiTagText.setText('');
    }
  }

  public spawnFloatingNotice(
    x: number,
    y: number,
    message: string,
    color: string
  ): void {
    const txt = this.scene.add
      .text(x, y, message, {
        fontSize: '12px',
        fontStyle: 'bold',
        color,
        backgroundColor: 'rgba(4, 13, 23, 0.88)',
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(50);

    this.scene.tweens.add({
      targets: txt,
      y: y - 42,
      alpha: 0,
      duration: 1200,
      onComplete: () => txt.destroy(),
    });
  }
}

/**
 * Shared speed multiplier helper based on current Max Stamina ceiling (20..100).
 */
export function getStaminaSpeedMultiplier(
  maxStamina: number,
  minFactor = 0.52
): number {
  const normalized = Phaser.Math.Clamp((maxStamina - 20) / 80, 0, 1);
  return minFactor + (1 - minFactor) * normalized;
}
