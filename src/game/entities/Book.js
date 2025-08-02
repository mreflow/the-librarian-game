import { Entity } from './Entity.js';

export class Book extends Entity {
  constructor(game, x, y, color) {
    super(x, y, 16, 20);
    this.game = game;
    
    // Book properties
    this.color = color; // Matches shelf color
    this.isHeld = false;
    this.isShelved = false;
    this.holder = null; // Entity holding this book
    this.shelf = null; // Shelf this book belongs to
    
    // Unique ID for tracking
    this.id = `book-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Physics
    this.friction = 0.9;
    this.bounceDecay = 0.7;
    this.gravity = 0;
    
    // Visual
    this.rotation = 0;
    this.rotationSpeed = 0;
    this.sparkleTimer = 0;
    
    // Collision box
    this.collisionBox = {
      offsetX: 2,
      offsetY: 2,
      width: 12,
      height: 16
    };
    
    // Glow effect when on floor
    this.glowIntensity = 0;
    this.glowDirection = 1;
    
    // Pre-create glow canvas for performance
    this.glowCanvas = null;
    this.glowCtx = null;
    this.glowNeedsUpdate = true;
  }
  
  update(deltaTime) {
    // Skip physics for held books, but not shelved books
    // (shelved books might have been removed but not yet picked up)
    if (this.isHeld) {
      return;
    }
    
    // Apply friction to velocity
    this.vx *= this.friction;
    this.vy *= this.friction;
    
    // Store old position
    const oldX = this.x;
    const oldY = this.y;
    
    // Update position
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
    
    // Check collision with shelves if not shelved
    if (!this.isShelved) {
      const state = this.game.stateManager.currentState;
      if (state && state.shelves) {
        for (const shelf of state.shelves) {
          // Check if book overlaps with shelf
          if (!(this.x + this.width < shelf.x || 
                this.x > shelf.x + shelf.width ||
                this.y + this.height < shelf.y || 
                this.y > shelf.y + shelf.height)) {
            // Book collided with shelf, bounce it away
            this.x = oldX;
            this.y = oldY;
            
            // Reverse velocity and reduce it
            this.vx = -this.vx * 0.5;
            this.vy = -this.vy * 0.5;
            
            // Add some randomness to prevent getting stuck
            this.vx += (Math.random() - 0.5) * 20;
            this.vy += (Math.random() - 0.5) * 20;
            
            break; // Only handle first collision
          }
        }
      }
    }
    
    // Update rotation
    this.rotation += this.rotationSpeed * deltaTime;
    this.rotationSpeed *= 0.95; // Slow down rotation
    
    // Sparkle effect
    this.sparkleTimer += deltaTime;
    
    // Glow pulsing
    this.glowIntensity += this.glowDirection * deltaTime * 2;
    if (this.glowIntensity >= 1) {
      this.glowIntensity = 1;
      this.glowDirection = -1;
    } else if (this.glowIntensity <= 0.3) {
      this.glowIntensity = 0.3;
      this.glowDirection = 1;
    }
    
    // Stop moving if velocity is very small
    if (Math.abs(this.vx) < 5 && Math.abs(this.vy) < 5) {
      this.vx = 0;
      this.vy = 0;
    }
  }
  
  render(ctx, interpolation) {
    if (!this.visible) return;
    
    const sprite = this.game.assetLoader.getImage('book');
    
    // Draw glow effect if on floor
    if (!this.isHeld && !this.isShelved) {
      this.renderOptimizedGlow(ctx);
      
      // Sparkle effect - optimized to reduce random calls
      if (Math.sin(this.sparkleTimer * 5) > 0.5) {
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.8;
        // Use deterministic sparkle position based on timer to reduce randomness
        const sparkleOffset = (this.sparkleTimer * 3) % 1;
        const sparkleX = this.x + sparkleOffset * this.width;
        const sparkleY = this.y + (sparkleOffset * 0.7) * this.height;
        ctx.fillRect(sparkleX - 1, sparkleY - 1, 2, 2);
        ctx.restore();
      }
    }
    
    // Draw book sprite (or fallback)
    if (sprite) {
      this.game.renderer.drawSprite(
        sprite,
        this.x,
        this.y,
        this.width,
        this.height,
        { 
          rotation: this.rotation,
          alpha: this.isHeld ? 0.8 : 1
        }
      );
    } else {
      // Fallback rendering
      ctx.save();
      ctx.fillStyle = this.getColorHex();
      ctx.fillRect(this.x, this.y, this.width, this.height);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(this.x, this.y, this.width, this.height);
      ctx.restore();
    }
    
    // Draw color indicator
    ctx.save();
    ctx.fillStyle = this.getColorHex();
    ctx.fillRect(this.x + 4, this.y + 2, this.width - 8, 4);
    ctx.restore();
  }
  
  renderOptimizedGlow(ctx) {
    // Create glow canvas once and reuse it
    if (!this.glowCanvas || this.glowNeedsUpdate) {
      this.createGlowCanvas();
      this.glowNeedsUpdate = false;
    }
    
    // Draw the pre-rendered glow with current intensity
    if (this.glowCanvas) {
      ctx.save();
      ctx.globalAlpha = this.glowIntensity * 0.5;
      ctx.drawImage(
        this.glowCanvas,
        this.getCenterX() - 25, // Center the 50x50 glow canvas
        this.getCenterY() - 25
      );
      ctx.restore();
    }
  }
  
  createGlowCanvas() {
    // Create a small canvas for the glow effect
    this.glowCanvas = document.createElement('canvas');
    this.glowCanvas.width = 50;
    this.glowCanvas.height = 50;
    this.glowCtx = this.glowCanvas.getContext('2d');
    
    // Create radial gradient for glow
    const gradient = this.glowCtx.createRadialGradient(25, 25, 5, 25, 25, 25);
    gradient.addColorStop(0, this.getColorHex());
    gradient.addColorStop(0.5, this.getColorHex() + '80'); // 50% opacity
    gradient.addColorStop(1, this.getColorHex() + '00'); // Transparent
    
    // Fill the canvas with the gradient
    this.glowCtx.fillStyle = gradient;
    this.glowCtx.fillRect(0, 0, 50, 50);
  }

  getColorHex() {
    const colors = {
      red: '#ff4444',
      blue: '#4444ff',
      green: '#44ff44',
      yellow: '#ffff44',
      purple: '#ff44ff',
      orange: '#ff8844'
    };
    return colors[this.color] || '#888888';
  }
  
  pickup(holder) {
    this.isHeld = true;
    this.holder = holder;
    this.vx = 0;
    this.vy = 0;
    this.rotation = 0;
    this.rotationSpeed = 0;
  }
  
  drop(x, y, throwVelocity = null) {
    this.isHeld = false;
    this.holder = null;
    this.x = x;
    this.y = y;
    
    if (throwVelocity) {
      this.vx = throwVelocity.x;
      this.vy = throwVelocity.y;
      this.rotationSpeed = (Math.random() - 0.5) * 10;
    }
  }
  
  shelve(shelf = null) {
    this.isShelved = true;
    this.isHeld = false;
    this.holder = null;
    this.shelf = shelf;
    this.vx = 0;
    this.vy = 0;
    this.rotation = 0;
    this.rotationSpeed = 0;
  }
  
  unshelve() {
    this.isShelved = false;
    this.shelf = null;
  }
  
  getStateString() {
    if (this.isShelved) return 'shelved';
    if (this.isHeld) return `held by ${this.holder?.constructor.name || 'unknown'}`;
    return 'on floor';
  }
}